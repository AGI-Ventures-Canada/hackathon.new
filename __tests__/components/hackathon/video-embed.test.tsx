import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { VideoEmbed } from "@/components/hackathon/video-embed"

afterEach(() => {
  cleanup()
})

describe("VideoEmbed", () => {
  it.each([
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
  ])("sandboxes $provider iframes without same-origin access", (video) => {
    render(
      <VideoEmbed video={video} />
    )

    const iframe = screen.getByTitle(video.title)
    expect(iframe.getAttribute("src")).toBe(video.embedUrl)
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-presentation allow-popups")
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin")
  })
})
