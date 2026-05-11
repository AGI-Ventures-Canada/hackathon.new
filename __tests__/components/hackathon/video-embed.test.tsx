import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { VideoEmbed } from "@/components/hackathon/video-embed"

afterEach(() => {
  cleanup()
})

describe("VideoEmbed", () => {
  it("sandboxes embedded provider iframes", () => {
    render(
      <VideoEmbed
        video={{
          provider: "loom",
          embedUrl: "https://www.loom.com/embed/abc123",
          title: "Loom video",
        }}
      />
    )

    expect(screen.getByTitle("Loom video").getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-presentation allow-popups"
    )
  })
})
