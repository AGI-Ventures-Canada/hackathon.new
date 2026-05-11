import { describe, expect, it } from "bun:test"
import {
  extractYouTubeVideoId,
  getYouTubeEmbedUrl,
  isYouTubeUrl,
} from "@/lib/utils/youtube"

describe("extractYouTubeVideoId", () => {
  it("extracts from standard youtube.com/watch URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from youtube.com/watch without www", () => {
    expect(extractYouTubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from youtu.be short URL", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from embed URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from shorts URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from mobile URL", () => {
    expect(extractYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts with extra query params", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120")).toBe("dQw4w9WgXcQ")
  })

  it("extracts from URL without protocol", () => {
    expect(extractYouTubeVideoId("youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("returns null for non-YouTube URLs", () => {
    expect(extractYouTubeVideoId("https://vimeo.com/123456")).toBeNull()
  })

  it("returns null for invalid YouTube URLs", () => {
    expect(extractYouTubeVideoId("https://youtube.com/channel/UCxyz")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(extractYouTubeVideoId("")).toBeNull()
  })
})

describe("isYouTubeUrl", () => {
  it("returns true for YouTube URLs", () => {
    expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true)
  })

  it("returns false for non-YouTube URLs", () => {
    expect(isYouTubeUrl("https://vimeo.com/123456")).toBe(false)
  })
})

describe("getYouTubeEmbedUrl", () => {
  it("returns privacy-enhanced embed URL", () => {
    expect(getYouTubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    )
  })
})
