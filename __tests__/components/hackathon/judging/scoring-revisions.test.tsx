import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { BucketSortPanel } from "@/components/hackathon/judging/bucket-sort-panel"
import { GateCheckPanel } from "@/components/hackathon/judging/gate-check-panel"

const originalFetch = globalThis.fetch

const completeAssignment = {
  id: "assignment-1",
  submissionId: "submission-1",
  submissionTitle: "Project Alpha",
  submissionDescription: "A useful project",
  submissionGithubUrl: null,
  submissionLiveAppUrl: null,
  submissionDemoVideoUrl: null,
  submissionScreenshotUrl: null,
  teamName: "Team Alpha",
  isComplete: true,
}

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe("completed scoring responses", () => {
  it("lets a judge edit a saved bucket response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        ...completeAssignment,
        buckets: [{ id: "bucket-1", level: 1, label: "Top", description: null }],
        existingBucketId: "bucket-1",
        existingGateResponses: [],
        notes: "Saved note",
      }), { status: 200 }))
    ) as unknown as typeof fetch

    render(
      <BucketSortPanel
        hackathonSlug="test-hack"
        prizeName="Best Project"
        assignments={[completeAssignment]}
      />
    )

    expect(await screen.findByText("Response saved")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Edit response" }))
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDefined()
    expect(screen.getByDisplayValue("Saved note")).toBeDefined()
  })

  it("lets a judge edit saved gate responses", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        ...completeAssignment,
        criteria: [{
          id: "gate-1",
          name: "Works offline",
          description: null,
          prizeId: "prize-1",
        }],
        existingGateResponses: [{ criteriaId: "gate-1", passed: true }],
      }), { status: 200 }))
    ) as unknown as typeof fetch

    render(
      <GateCheckPanel
        hackathonSlug="test-hack"
        prizeName="Offline Ready"
        assignments={[completeAssignment]}
      />
    )

    expect(await screen.findByText("1/1 gates passed")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Edit response" }))
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDefined()
    expect(screen.getByText("Works offline")).toBeDefined()
  })
})
