import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const redirect = mock((url: string): never => { throw new Error(`REDIRECT:${url}`) })
const notFound = mock((): never => { throw new Error("NOT_FOUND") })
const auth = mock(() => Promise.resolve<{ userId: string | null }>({ userId: "judge-user" }))
const event = { id: "event-1", name: "Our event", status: "completed" }
const getPublicHackathon = mock(() => Promise.resolve<Record<string, unknown> | null>(event))
const getRegistrationInfo = mock(() => Promise.resolve<{ participantRole: string | null }>({ participantRole: "judge" }))
const getJudgeAssignments = mock(() => Promise.resolve<Array<Record<string, unknown>>>([]))

mock.module("next/navigation", () => ({ redirect, notFound }))
mock.module("@clerk/nextjs/server", () => ({ auth }))
mock.module("@/lib/services/public-hackathons", () => ({ getPublicHackathon }))
mock.module("@/lib/services/hackathons", () => ({ getRegistrationInfo }))
mock.module("@/lib/services/judging", () => ({ getJudgeAssignments }))
mock.module("@/components/page-header", () => ({ PageHeader: ({ title }: { title: string }) => createElement("h1", null, title) }))

const { default: JudgeSummaryPage } = await import("@/app/(public)/e/[slug]/judge/summary/page")
const callPage = () => JudgeSummaryPage({ params: Promise.resolve({ slug: "our-event" }) })

beforeEach(() => {
  auth.mockReset(); auth.mockResolvedValue({ userId: "judge-user" })
  getPublicHackathon.mockReset(); getPublicHackathon.mockResolvedValue(event)
  getRegistrationInfo.mockReset(); getRegistrationInfo.mockResolvedValue({ participantRole: "judge" })
  getJudgeAssignments.mockReset(); getJudgeAssignments.mockResolvedValue([])
})

describe("judge summary server boundary", () => {
  it("requires sign-in before reading submitted reviews", async () => {
    auth.mockResolvedValue({ userId: null })
    await expect(callPage()).rejects.toThrow(`REDIRECT:/sign-in?redirect_url=${encodeURIComponent("/e/our-event/judge/summary")}`)
    expect(getPublicHackathon).not.toHaveBeenCalled()
    expect(getJudgeAssignments).not.toHaveBeenCalled()
  })
  it("returns not found for a missing event", async () => {
    getPublicHackathon.mockResolvedValue(null)
    await expect(callPage()).rejects.toThrow("NOT_FOUND")
    expect(getJudgeAssignments).not.toHaveBeenCalled()
  })
  it("requires the judge role even after results close", async () => {
    getRegistrationInfo.mockResolvedValue({ participantRole: "organizer" })
    await expect(callPage()).rejects.toThrow("REDIRECT:/e/our-event")
    expect(getJudgeAssignments).not.toHaveBeenCalled()
  })
  it("renders submitted history across scoring modes and counts a ranked ballot once", async () => {
    getJudgeAssignments.mockResolvedValue([
      { id: "weighted", isComplete: true, judgingStyle: "weighted_score", submissionTitle: "A helpful project", prizeName: "Best demo" },
      { id: "gate", isComplete: true, judgingStyle: "gate_check", submissionTitle: "Meets the checks", prizeName: "Ready to launch" },
      { id: "pick-1", isComplete: true, judgingStyle: "judges_pick", prizeId: "favorite", prizeName: "Favorite" },
      { id: "pick-2", isComplete: true, judgingStyle: "judges_pick", prizeId: "favorite", prizeName: "Favorite" },
      { id: "draft", isComplete: false, judgingStyle: "bucket_sort", submissionTitle: "Unsubmitted draft" },
    ])
    const html = renderToStaticMarkup(await callPage())
    expect(html).toContain("Your submitted reviews")
    expect(html).toContain("3 reviews submitted")
    expect(html).toContain("A helpful project")
    expect(html).toContain("Meets the checks")
    expect(html).toContain("Your picks for Favorite")
    expect(html).not.toContain("Unsubmitted draft")
    expect(html).toContain("/e/our-event/judge?review=favorite")
    expect(getJudgeAssignments).toHaveBeenCalledWith(event.id, "judge-user", { includeClosedRounds: true })
  })
  it("provides an empty-state path back to saved drafts", async () => {
    const html = renderToStaticMarkup(await callPage())
    expect(html).toContain("Your drafts are in your judging workspace")
    expect(html).toContain('href="/e/our-event/judge"')
  })
})
