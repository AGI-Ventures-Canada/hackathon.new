import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { VideoEmbed } from "@/components/hackathon/video-embed"

afterEach(() => {
  cleanup()
})

describe("VideoEmbed", () => {
  it.each([
    {
      provider: "youtube" as const,
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      title: "YouTube video",
    },
    {
      provider: "loom" as const,
      embedUrl: "https://www.loom.com/embed/abc123",
      title: "Loom video",
    },
    {
      provider: "vimeo" as const,
      embedUrl: "https://player.vimeo.com/video/123456",
      title: "Vimeo video",
    },
  ])("renders $provider embeds with same-origin so the player can load", (video) => {
    render(
      <VideoEmbed video={video} />
    )

    const iframe = screen.getByTitle(video.title)
    expect(iframe.getAttribute("src")).toBe(video.embedUrl)
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-presentation allow-popups")
  })
})
