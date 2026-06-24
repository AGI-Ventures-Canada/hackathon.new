import { describe, expect, it, afterEach } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"

const { VoteCard } = await import("@/components/hackathon/voting/vote-card")

const baseProps = {
  title: "Test Project",
  description: "A description",
  screenshotUrl: null,
  voteCount: 3,
  isVoted: false,
  disabled: false,
  onVote: () => {},
}

describe("VoteCard", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders a link for each provided project URL", () => {
    render(
      <VoteCard
        {...baseProps}
        liveAppUrl="https://example.com"
        githubUrl="https://github.com/acme/repo"
        demoVideoUrl="https://youtu.be/abc"
      />
    )

    const live = screen.getByRole("link", { name: /Live demo/i })
    const code = screen.getByRole("link", { name: /Code/i })
    const video = screen.getByRole("link", { name: /Video/i })

    expect(live.getAttribute("href")).toBe("https://example.com")
    expect(code.getAttribute("href")).toBe("https://github.com/acme/repo")
    expect(video.getAttribute("href")).toBe("https://youtu.be/abc")

    expect(live.getAttribute("target")).toBe("_blank")
    expect(live.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("renders only the links that have URLs", () => {
    render(
      <VoteCard
        {...baseProps}
        liveAppUrl="https://example.com"
        githubUrl={null}
        demoVideoUrl={null}
      />
    )

    expect(screen.getByRole("link", { name: /Live demo/i })).toBeDefined()
    expect(screen.queryByRole("link", { name: /Code/i })).toBeNull()
    expect(screen.queryByRole("link", { name: /Video/i })).toBeNull()
  })

  it("renders no links when all URLs are null", () => {
    render(
      <VoteCard
        {...baseProps}
        liveAppUrl={null}
        githubUrl={null}
        demoVideoUrl={null}
      />
    )

    expect(screen.queryByRole("link")).toBeNull()
  })

  it("renders no links when URL props are omitted", () => {
    render(<VoteCard {...baseProps} />)

    expect(screen.queryByRole("link")).toBeNull()
  })
})
