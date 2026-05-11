import { describe, expect, it } from "bun:test"
import { getVideoEmbedInfo } from "@/lib/utils/video-embed"

describe("getVideoEmbedInfo", () => {
  it("detects YouTube watch links", () => {
    expect(getVideoEmbedInfo("youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      title: "YouTube video",
    })
  })

  it("detects YouTube shorts links", () => {
    expect(getVideoEmbedInfo("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      title: "YouTube video",
    })
  })

  it("detects Loom share links", () => {
    expect(getVideoEmbedInfo("loom.com/share/abc_123-def456")).toEqual({
      provider: "loom",
      embedUrl: "https://www.loom.com/embed/abc_123-def456",
      title: "Loom video",
    })
  })

  it("detects Vimeo links", () => {
    expect(getVideoEmbedInfo("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
      title: "Vimeo video",
    })
  })

  it("detects Vimeo player links", () => {
    expect(getVideoEmbedInfo("https://player.vimeo.com/video/123456789")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
      title: "Vimeo video",
    })
  })

  it("leaves unknown links as plain links", () => {
    expect(getVideoEmbedInfo("https://example.com/demo-video")).toBeNull()
  })
})
