import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"

import { SubmissionGallery } from "@/components/hackathon/submission-gallery"

afterEach(cleanup)

describe("SubmissionGallery", () => {
  it("keeps long project rows inside the mobile viewport", () => {
    render(
      <SubmissionGallery
        submissions={[
          {
            id: "project-1",
            title: "A project title that is much wider than a mobile screen",
            description: "A description that is also long enough to test the project row width.",
            githubUrl: null,
            liveAppUrl: null,
            demoVideoUrl: null,
            screenshotUrl: null,
            submitter: "Team One",
            createdAt: "2026-09-01T00:00:00.000Z",
          },
        ]}
      />,
    )

    const trigger = screen.getByRole("button", {
      name: /A project title that is much wider than a mobile screen/,
    })
    const row = trigger.firstElementChild

    expect(trigger.classList.contains("min-w-0")).toBe(true)
    expect(row?.classList.contains("min-w-0")).toBe(true)
  })
})
