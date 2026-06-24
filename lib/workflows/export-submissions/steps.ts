"use step"

import { fetch } from "workflow"
import JSZip from "jszip"
import type {
  EnrichedExportPayload,
  ExportFilters,
  ExportUserDirectory,
} from "@/lib/services/submission-exports"
import {
  collectExportUserIds,
  loadExportPayload,
  markExportFailed,
  markExportProcessing,
  markExportReady,
} from "@/lib/services/submission-exports"
import { resolveClerkUsers } from "@/lib/services/clerk-users"
import { supabase as getSupabase } from "@/lib/db/client"
import { toCsv, type CsvColumn } from "@/lib/utils/csv"
import {
  formatJudgeNotes,
  formatMembers,
  formatScores,
} from "@/lib/workflows/export-submissions/format"
import { isClerkUserId } from "@/lib/utils/person-display"
import { isAllowedDownloadUrl } from "@/lib/utils/safe-fetch-url"
import {
  renderSubmissionsExportPdf,
  type ExportScreenshotMap,
} from "@/pdfs/submissions-export"
import { sendExportReadyEmail, sendExportFailedEmail } from "@/lib/email/submission-exports"

const EXPORTS_BUCKET = "exports"
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000
const IMAGE_DOWNLOAD_CONCURRENCY = 10
const IMAGE_MAX_BYTES = 20 * 1024 * 1024
const EXPORT_TTL_DAYS = 30
const PDF_SCREENSHOT_MAX_EDGE = 1200

export async function loadExportData(
  exportId: string
): Promise<EnrichedExportPayload> {
  await markExportProcessing(exportId)
  const payload = await loadExportPayload(exportId)
  if (!payload) {
    throw new Error(`Export ${exportId} not found or hackathon missing`)
  }

  const userIds = collectExportUserIds(payload)
  const { displayNames, emails } = await resolveClerkUsers(userIds)
  const users: ExportUserDirectory = {}
  for (const id of userIds) {
    const rawName = displayNames[id] ?? null
    users[id] = {
      name: rawName && !isClerkUserId(rawName) ? rawName : null,
      email: emails[id] ?? null,
    }
  }

  return { ...payload, users }
}

export type ExportUploadResult = {
  storagePath: string
  fileSizeBytes: number
  submissionCount: number
}

export async function buildAndUploadExport(
  exportId: string,
  payload: EnrichedExportPayload
): Promise<ExportUploadResult> {
  const images = await downloadAllImages(payload)
  const screenshots = await buildPdfScreenshotMap(images)
  const csvBuffer = Buffer.from(buildCsv(payload), "utf-8")
  const pdfBuffer = await renderSubmissionsExportPdf(payload, screenshots)
  const jsonBuffer = Buffer.from(JSON.stringify(payload, null, 2), "utf-8")
  const readmeBuffer = Buffer.from(buildReadme(payload), "utf-8")

  const zip = new JSZip()
  zip.file("README.md", readmeBuffer)
  zip.file("submissions.csv", csvBuffer)
  zip.file("submissions.pdf", pdfBuffer)
  zip.file("data.json", jsonBuffer)

  for (const image of images) {
    zip.file(image.path, image.buffer)
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  const datePart = new Date().toISOString().split("T")[0]
  const safeSlug =
    payload.hackathon.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "hackathon"
  const storagePath = `${payload.hackathon.id}/${exportId}/submissions-export-${safeSlug}-${datePart}.zip`

  const client = getSupabase()
  const { error } = await client.storage
    .from(EXPORTS_BUCKET)
    .upload(storagePath, zipBuffer, {
      contentType: "application/zip",
      upsert: true,
    })

  if (error) {
    throw new Error(`Failed to upload export ZIP: ${error.message}`)
  }

  return {
    storagePath,
    fileSizeBytes: zipBuffer.length,
    submissionCount: payload.submissions.length,
  }
}

export async function finalizeExport(
  exportId: string,
  result: ExportUploadResult,
  payload: EnrichedExportPayload
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  await markExportReady(exportId, {
    storagePath: result.storagePath,
    fileSizeBytes: result.fileSizeBytes,
    submissionCount: result.submissionCount,
    expiresAt,
  })

  const recipient = await getRequesterEmail(exportId)
  if (!recipient) return

  await sendExportReadyEmail({
    to: recipient.email,
    recipientName: recipient.name,
    hackathonName: payload.hackathon.name,
    hackathonId: payload.hackathon.id,
    hackathonSlug: payload.hackathon.slug,
    exportId,
    submissionCount: result.submissionCount,
    fileSizeBytes: result.fileSizeBytes,
    expiresAt,
  })
}

export async function failExport(
  exportId: string,
  errorMessage: string
): Promise<void> {
  const safeMessage = sanitizeErrorMessage(errorMessage)
  await markExportFailed(exportId, safeMessage)

  const recipient = await getRequesterEmail(exportId)
  if (!recipient) return

  const hackathon = await getHackathonForExport(exportId)
  if (!hackathon) return

  await sendExportFailedEmail({
    to: recipient.email,
    recipientName: recipient.name,
    hackathonName: hackathon.name,
    hackathonSlug: hackathon.slug,
    errorMessage: safeMessage,
  })
}

function sanitizeErrorMessage(message: string): string {
  const collapsed = message.replace(/\s+/g, " ").trim()
  const stripped = collapsed
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/(?:^|\s)(\/[A-Za-z0-9._\-\/]+)/g, " [path]")
    .replace(/[A-Za-z]:\\[\\A-Za-z0-9._\-]+/g, "[path]")
  const max = 240
  return stripped.length > max ? `${stripped.slice(0, max - 1).trimEnd()}…` : stripped
}

type DownloadedImage = { path: string; buffer: Buffer }

const SCREENSHOT_PATH_PATTERN = /^media\/([^/]+)\/screenshot\.[^/]+$/

export async function buildPdfScreenshotMap(
  images: DownloadedImage[]
): Promise<ExportScreenshotMap> {
  const screenshots = images.filter((image) =>
    SCREENSHOT_PATH_PATTERN.test(image.path)
  )
  if (screenshots.length === 0) return {}

  const { default: sharp } = await import("sharp")
  const map: ExportScreenshotMap = {}

  for (const image of screenshots) {
    const submissionId = SCREENSHOT_PATH_PATTERN.exec(image.path)?.[1]
    if (!submissionId) continue
    try {
      const data = await sharp(image.buffer)
        .resize(PDF_SCREENSHOT_MAX_EDGE, PDF_SCREENSHOT_MAX_EDGE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer()
      map[submissionId] = { data, format: "png" }
    } catch (err) {
      console.warn(
        `Skipping PDF screenshot for submission ${submissionId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  return map
}

async function downloadAllImages(
  payload: EnrichedExportPayload
): Promise<DownloadedImage[]> {
  const jobs: { url: string; path: string }[] = []

  for (const submission of payload.submissions) {
    if (submission.screenshotUrl) {
      jobs.push({
        url: submission.screenshotUrl,
        path: `media/${submission.id}/screenshot`,
      })
    }
    submission.socialSubmissions.forEach((social, idx) => {
      if (social.ogImageUrl) {
        jobs.push({
          url: social.ogImageUrl,
          path: `media/${submission.id}/social-${idx + 1}-og`,
        })
      }
    })
  }

  const results: DownloadedImage[] = []
  const queue = [...jobs]
  async function worker() {
    while (queue.length > 0) {
      const job = queue.shift()
      if (!job) return
      const result = await downloadImage(job.url, job.path)
      if (result) results.push(result)
    }
  }

  const workers = Array.from(
    { length: Math.min(IMAGE_DOWNLOAD_CONCURRENCY, jobs.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results
}

async function downloadImage(
  url: string,
  pathWithoutExtension: string
): Promise<DownloadedImage | null> {
  if (!isAllowedDownloadUrl(url)) {
    console.warn(`Refusing to download image with disallowed URL: ${url}`)
    return null
  }
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    IMAGE_DOWNLOAD_TIMEOUT_MS
  )
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
    })

    if (!response.ok) return null

    const declaredLength = Number(response.headers.get("content-length") ?? 0)
    if (declaredLength > IMAGE_MAX_BYTES) {
      console.warn(
        `Skipping image ${url}: content-length ${declaredLength} exceeds ${IMAGE_MAX_BYTES}`
      )
      return null
    }

    const contentType = response.headers.get("content-type") ?? ""
    const extension = inferExtension(contentType, url)
    if (extension === "bin") {
      console.warn(
        `Image ${url} saved as .bin (unrecognized content-type: ${contentType || "<none>"})`
      )
    }

    if (!response.body) return null
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > IMAGE_MAX_BYTES) {
          console.warn(
            `Skipping image ${url}: streamed ${total} bytes exceeds ${IMAGE_MAX_BYTES}`
          )
          await reader.cancel()
          controller.abort()
          return null
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    return {
      path: `${pathWithoutExtension}.${extension}`,
      buffer: Buffer.concat(chunks),
    }
  } catch (err) {
    console.warn(`Failed to download image ${url}:`, err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}


function inferExtension(contentType: string, url: string): string {
  if (contentType.includes("png")) return "png"
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg"
  if (contentType.includes("webp")) return "webp"
  if (contentType.includes("gif")) return "gif"

  const urlMatch = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.exec(url)
  if (urlMatch) {
    const ext = urlMatch[1].toLowerCase()
    return ext === "jpeg" ? "jpg" : ext
  }
  return "bin"
}

function buildCsv(payload: EnrichedExportPayload): string {
  type Row = {
    rank: string | number
    title: string
    status: string
    team: string
    teamMembers: string
    description: string
    githubUrl: string
    liveAppUrl: string
    demoVideoUrl: string
    screenshotUrl: string
    prizes: string
    totalScore: string | number
    weightedScore: string | number
    judgeCount: string | number
    judgeScores: string
    judgeNotes?: string
    socialLinks: string
    submittedAt: string
  }

  const includeJudgeNotes = payload.filters.includeJudgeNotes

  const rows: Row[] = payload.submissions.map((s) => {
    const row: Row = {
      rank: s.result?.rank ?? "",
      title: s.title,
      status: s.status,
      team: s.team?.name ?? "",
      teamMembers: formatMembers(s, payload.users),
      description: s.description ?? "",
      githubUrl: s.githubUrl ?? "",
      liveAppUrl: s.liveAppUrl ?? "",
      demoVideoUrl: s.demoVideoUrl ?? "",
      screenshotUrl: s.screenshotUrl ?? "",
      prizes: s.prizes.map((p) => p.name).join(" | "),
      totalScore: s.result?.totalScore ?? "",
      weightedScore: s.result?.weightedScore ?? "",
      judgeCount: s.result?.judgeCount ?? "",
      judgeScores: formatScores(s, payload.users),
      socialLinks: s.socialSubmissions.map((soc) => soc.url).join(" | "),
      submittedAt: s.createdAt,
    }
    if (includeJudgeNotes) {
      row.judgeNotes = formatJudgeNotes(s, payload.users)
    }
    return row
  })

  const columns: CsvColumn<Row>[] = [
    { key: "rank", header: "Rank" },
    { key: "title", header: "Title" },
    { key: "status", header: "Status" },
    { key: "team", header: "Team" },
    { key: "teamMembers", header: "Team Members" },
    { key: "description", header: "Description" },
    { key: "githubUrl", header: "GitHub URL" },
    { key: "liveAppUrl", header: "Live App URL" },
    { key: "demoVideoUrl", header: "Demo Video URL" },
    { key: "screenshotUrl", header: "Screenshot URL" },
    { key: "prizes", header: "Prizes" },
    { key: "totalScore", header: "Total Score" },
    { key: "weightedScore", header: "Weighted Score" },
    { key: "judgeCount", header: "Judge Count" },
    { key: "judgeScores", header: "Judge Scores" },
  ]
  if (includeJudgeNotes) {
    columns.push({ key: "judgeNotes", header: "Judge Notes" })
  }
  columns.push(
    { key: "socialLinks", header: "Social Submission Links" },
    { key: "submittedAt", header: "Submitted At" }
  )

  return toCsv(rows, columns)
}

function buildReadme(payload: EnrichedExportPayload): string {
  const filters = describeFilters(payload.filters)
  const usersLine =
    "- `data.json` includes a `users` directory mapping every participant and judge to their name **and email** — these also appear inline in `submissions.csv` and `submissions.pdf`. Treat the export as sensitive and share it only with people who already have access to that information."
  return `# Submissions Export — ${payload.hackathon.name}

Generated: ${payload.generatedAt}
Submissions included: ${payload.submissions.length}

## Filters applied

${filters}

## Files

- \`submissions.csv\` — flat row-per-submission spreadsheet with all key fields.
- \`submissions.pdf\` — human-readable report with project screenshots embedded.
- \`data.json\` — full structured data (highest fidelity).
- \`media/<submission-id>/\` — downloaded screenshots and social media OG images.

## Notes

- Demo videos are linked in the CSV/JSON but not downloaded.
- Image downloads that timed out or failed are skipped silently.
- Member and judge names come from Clerk at export time and may differ from how they appear in the live event page if a user has since updated their profile.
${usersLine}
`
}

function describeFilters(filters: ExportFilters): string {
  const lines = [
    `- Winners only: ${filters.winnersOnly ? "yes" : "no"}`,
    `- Include drafts: ${filters.includeDrafts ? "yes" : "no"}`,
    `- Include judge notes: ${filters.includeJudgeNotes ? "yes" : "no"}`,
  ]
  return lines.join("\n")
}

async function getRequesterEmail(
  exportId: string
): Promise<{ email: string; name: string | null } | null> {
  const client = getSupabase()
  const { data: row } = await client
    .from("submission_exports")
    .select("requested_by_user_id")
    .eq("id", exportId)
    .maybeSingle()
  if (!row) {
    console.warn(
      `Export ${exportId}: notification skipped, submission_exports row not found`
    )
    return null
  }

  const { displayNames, emails } = await resolveClerkUsers([
    row.requested_by_user_id,
  ])
  const email = emails[row.requested_by_user_id]
  if (!email) {
    console.warn(
      `Export ${exportId}: notification skipped, no Clerk email for requester ${row.requested_by_user_id}`
    )
    return null
  }
  return { email, name: displayNames[row.requested_by_user_id] ?? null }
}

async function getHackathonForExport(
  exportId: string
): Promise<{ name: string; slug: string } | null> {
  const client = getSupabase()
  const { data } = await client
    .from("submission_exports")
    .select("hackathon:hackathons!hackathon_id(name, slug)")
    .eq("id", exportId)
    .maybeSingle()
  const hackathon = (data as { hackathon: { name: string; slug: string } | null } | null)?.hackathon
  return hackathon ?? null
}
