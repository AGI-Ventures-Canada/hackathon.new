import type { Json } from "@/lib/db/types"

export const MAX_SUBMISSION_SCREENSHOTS = 2

export type SubmissionScreenshotSlot = 0 | 1

export type SubmissionScreenshot = {
  slot: SubmissionScreenshotSlot
  url: string
}

type SubmissionScreenshotSource = {
  metadata?: Json | null
  screenshot_url?: string | null
}

function isRecord(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function toScreenshotSlot(index: number): SubmissionScreenshotSlot | null {
  if (index === 0 || index === 1) {
    return index
  }
  return null
}

export function getSubmissionScreenshots(
  submission: SubmissionScreenshotSource
): SubmissionScreenshot[] {
  const screenshots: SubmissionScreenshot[] = []
  const metadata = isRecord(submission.metadata) ? submission.metadata : null
  const metadataUrls = metadata?.screenshotUrls

  if (Array.isArray(metadataUrls)) {
    for (const [index, value] of metadataUrls.slice(0, MAX_SUBMISSION_SCREENSHOTS).entries()) {
      const slot = toScreenshotSlot(index)
      if (slot !== null && typeof value === "string" && value.trim()) {
        screenshots.push({ slot, url: value })
      }
    }
  } else if (isRecord(metadataUrls)) {
    for (const [key, value] of Object.entries(metadataUrls)) {
      const slot = toScreenshotSlot(Number(key))
      if (slot !== null && typeof value === "string" && value.trim()) {
        screenshots.push({ slot, url: value })
      }
    }
    screenshots.sort((a, b) => a.slot - b.slot)
  }

  if (
    submission.screenshot_url &&
    screenshots.length === 0
  ) {
    screenshots.unshift({ slot: 0, url: submission.screenshot_url })
  }

  return screenshots.slice(0, MAX_SUBMISSION_SCREENSHOTS)
}

export function getSubmissionScreenshotUrls(submission: SubmissionScreenshotSource): string[] {
  return getSubmissionScreenshots(submission).map((screenshot) => screenshot.url)
}

export function buildSubmissionScreenshotMetadata(
  metadata: Json | null | undefined,
  screenshots: SubmissionScreenshot[]
): Record<string, Json | undefined> {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {}
  // Read support still accepts the old array shape; new writes use slot-keyed objects.
  const screenshotUrls: Record<string, Json> = {}

  for (const screenshot of screenshots) {
    screenshotUrls[String(screenshot.slot)] = screenshot.url
  }

  nextMetadata.screenshotUrls = screenshotUrls
  return nextMetadata
}
