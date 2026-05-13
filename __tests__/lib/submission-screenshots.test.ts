import { describe, expect, it } from "bun:test"
import {
  buildSubmissionScreenshotMetadata,
  getSubmissionScreenshots,
  getSubmissionScreenshotUrls,
} from "@/lib/utils/submission-screenshots"

describe("submission screenshot helpers", () => {
  it("falls back to the legacy screenshot URL", () => {
    expect(
      getSubmissionScreenshots({
        screenshot_url: "https://storage.test/screenshot.webp",
        metadata: null,
      })
    ).toEqual([{ slot: 0, url: "https://storage.test/screenshot.webp" }])
  })

  it("reads up to two screenshot URLs from metadata", () => {
    expect(
      getSubmissionScreenshotUrls({
        screenshot_url: null,
        metadata: {
          screenshotUrls: [
            "https://storage.test/first.webp",
            "https://storage.test/second.webp",
            "https://storage.test/third.webp",
          ],
        },
      })
    ).toEqual([
      "https://storage.test/first.webp",
      "https://storage.test/second.webp",
    ])
  })

  it("reads sparse screenshot URL metadata", () => {
    expect(
      getSubmissionScreenshots({
        screenshot_url: "https://storage.test/second.webp",
        metadata: {
          screenshotUrls: {
            "1": "https://storage.test/second.webp",
          },
        },
      })
    ).toEqual([{ slot: 1, url: "https://storage.test/second.webp" }])
  })

  it("preserves unrelated metadata when writing screenshot URLs", () => {
    expect(
      buildSubmissionScreenshotMetadata(
        { source: "import" },
        [{ slot: 1, url: "https://storage.test/second.webp" }]
      )
    ).toEqual({
      source: "import",
      screenshotUrls: { "1": "https://storage.test/second.webp" },
    })
  })
})
