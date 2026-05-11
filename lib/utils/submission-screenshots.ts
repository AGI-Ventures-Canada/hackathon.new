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

function asScreenshotSlot(index: number): SubmissionScreenshotSlot {
  return index === 1 ? 1 : 0
}

export function getSubmissionScreenshots(
  submission: SubmissionScreenshotSource
): SubmissionScreenshot[] {
  const screenshots: SubmissionScreenshot[] = []
  const metadata = isRecord(submission.metadata) ? submission.metadata : null
  const metadataUrls = Array.isArray(metadata?.screenshotUrls)
    ? metadata.screenshotUrls
    : null

  if (metadataUrls) {
    for (const [index, value] of metadataUrls.slice(0, MAX_SUBMISSION_SCREENSHOTS).entries()) {
      if (typeof value === "string" && value.trim()) {
        screenshots.push({ slot: asScreenshotSlot(index), url: value })
      }
    }
  }

  if (
    submission.screenshot_url &&
    !screenshots.some((screenshot) => screenshot.slot === 0)
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
  const screenshotUrls: Array<string | null> = Array.from(
    { length: MAX_SUBMISSION_SCREENSHOTS },
    () => null
  )

  for (const screenshot of screenshots) {
    screenshotUrls[screenshot.slot] = screenshot.url
  }

  nextMetadata.screenshotUrls = screenshotUrls
  return nextMetadata
}
