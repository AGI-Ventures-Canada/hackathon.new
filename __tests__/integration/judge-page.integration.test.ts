import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { JudgeAssignmentForJudge } from "@/lib/services/judging"

const redirect = mock((url: string): never => { throw new Error(`REDIRECT:${url}`) })
const notFound = mock((): never => { throw new Error("NOT_FOUND") })
const auth = mock(() => Promise.resolve<{ userId: string | null; orgId: string | null }>({ userId: "user-1", orgId: null }))
const event = { id: "event-1", slug: "our-event", name: "Our event", status: "judging", anonymous_judging: false, judging_timezone: "UTC" }
const getPublicHackathon = mock(() => Promise.resolve<Record<string, unknown> | null>(event))
const getRegistrationInfo = mock(() => Promise.resolve<{ participantRole: string | null }>({ participantRole: "judge" }))
const getJudgeAssignments = mock(() => Promise.resolve<JudgeAssignmentForJudge[]>([]))
const getJudgeDraftTargetIds = mock(() => Promise.resolve<string[]>([]))
const isJudgingOpenForHackathon = mock(() => Promise.resolve(true))
const listRounds = mock(() => Promise.resolve([]))
let workspace: Record<string, unknown> = {}

mock.module("next/navigation", () => ({ redirect, notFound }))
mock.module("@clerk/nextjs/server", () => ({ auth }))
mock.module("@/lib/services/public-hackathons", () => ({ getPublicHackathon }))
mock.module("@/lib/services/hackathons", () => ({ getRegistrationInfo }))
mock.module("@/lib/services/judging", () => ({ getJudgeAssignments, isJudgingOpenForHackathon, listRounds }))
mock.module("@/lib/services/judging-reviews", () => ({ getJudgeDraftTargetIds }))
mock.module("@/components/hackathon/judging/judge-workspace", () => ({ JudgeWorkspace: (props: Record<string, unknown>) => { workspace = props; return createElement("main", { "data-workspace": props.slug }, "Review queue") } }))
mock.module("@/components/hackathon/judging/judging-inbox", () => ({ JudgingInbox: ({ hackathonId }: { hackathonId: string }) => createElement("aside", { "data-inbox": hackathonId }, "Judging updates") }))
mock.module("@/components/page-header", () => ({ PageHeader: ({ title }: { title: string }) => createElement("h1", null, title) }))
mock.module("@/components/ui/auto-refresh", () => ({ AutoRefresh: () => null }))

const { default: JudgePage } = await import("@/app/(public)/e/[slug]/judge/page")
const project: JudgeAssignmentForJudge = { id: "review-1", submissionId: "project-1", submissionTitle: "A useful demo", submissionDescription: "A project", submissionGithubUrl: null, submissionLiveAppUrl: null, submissionDemoVideoUrl: null, submissionScreenshotUrl: null, teamName: "Team name", teamMode: "in_person", teamMemberCount: 3, isComplete: false, notes: "", viewedAt: null, prizeId: null, prizeName: null, judgingStyle: "weighted_score", maxPicks: null, selfJudging: false, assignmentKind: "unified_weighted_score" }
const callPage = (review?: string) => JudgePage({ params: Promise.resolve({ slug: "our-event" }), searchParams: Promise.resolve({ review }) })

beforeEach(() => {
  workspace = {}
  auth.mockReset(); auth.mockResolvedValue({ userId: "user-1", orgId: null })
  getPublicHackathon.mockReset(); getPublicHackathon.mockResolvedValue(event)
  getRegistrationInfo.mockReset(); getRegistrationInfo.mockResolvedValue({ participantRole: "judge" })
  getJudgeAssignments.mockReset(); getJudgeAssignments.mockResolvedValue([project])
  getJudgeDraftTargetIds.mockReset(); getJudgeDraftTargetIds.mockResolvedValue([project.id])
  isJudgingOpenForHackathon.mockReset(); isJudgingOpenForHackathon.mockResolvedValue(true)
  listRounds.mockReset(); listRounds.mockResolvedValue([])
})

describe("judge page server boundary", () => {
  it("requires sign-in before reading an event or private judging data", async () => {
    auth.mockResolvedValue({ userId: null, orgId: null })
    await expect(callPage()).rejects.toThrow(`REDIRECT:/sign-in?redirect_url=${encodeURIComponent("/e/our-event/judge")}`)
    expect(getPublicHackathon).not.toHaveBeenCalled()
    expect(getJudgeAssignments).not.toHaveBeenCalled()
    expect(getJudgeDraftTargetIds).not.toHaveBeenCalled()
  })
  it("returns not found without loading judging data for a missing event", async () => {
    getPublicHackathon.mockResolvedValue(null)
    await expect(callPage()).rejects.toThrow("NOT_FOUND")
    expect(getRegistrationInfo).not.toHaveBeenCalled()
    expect(getJudgeAssignments).not.toHaveBeenCalled()
  })
  for (const role of ["organizer", "participant", null]) {
    it(`redirects the ${role ?? "unregistered"} role before loading private reviews`, async () => {
      getRegistrationInfo.mockResolvedValue({ participantRole: role })
      await expect(callPage()).rejects.toThrow("REDIRECT:/e/our-event")
      expect(getJudgeAssignments).not.toHaveBeenCalled()
      expect(getJudgeDraftTargetIds).not.toHaveBeenCalled()
    })
  }
  it("renders the server shell and passes current, historical, and draft data to the review boundary", async () => {
    const old = { ...project, id: "old-review", isComplete: true }
    getJudgeAssignments.mockResolvedValueOnce([project, old]).mockResolvedValueOnce([project])
    const html = renderToStaticMarkup(await callPage(old.id))
    expect(html).toContain("Judge Our event")
    expect(html).toContain("Judging updates")
    expect(html).toContain("Review queue")
    expect(getJudgeAssignments).toHaveBeenCalledWith(event.id, "user-1", { includeClosedRounds: true })
    expect(getJudgeAssignments).toHaveBeenCalledWith(event.id, "user-1")
    expect(getJudgeDraftTargetIds).toHaveBeenCalledWith(event.id, "user-1")
    expect(workspace).toMatchObject({ assignments: [project, old], activeAssignmentIds: [project.id], draftTargetIds: [project.id], initialReview: old.id, canJudge: true })
  })
  it("retains the preparation workspace for an invited judge before go-live", async () => {
    getPublicHackathon.mockResolvedValue({ ...event, status: "draft" })
    isJudgingOpenForHackathon.mockResolvedValue(false)
    const html = renderToStaticMarkup(await callPage())
    expect(html).toContain("You&#x27;re on the judge list")
    expect(getPublicHackathon).toHaveBeenCalledWith("our-event", { includeUnpublished: true })
    expect(workspace).toMatchObject({ canJudge: false, activeAssignmentIds: [] })
  })
  it("removes own-team projects before anonymizing the client data", async () => {
    getPublicHackathon.mockResolvedValue({ ...event, anonymous_judging: true })
    getJudgeAssignments.mockResolvedValue([project, { ...project, id: "own-project", selfJudging: true }])
    renderToStaticMarkup(await callPage())
    expect(workspace.assignments).toEqual([{ ...project, teamName: null, teamMode: null, teamMemberCount: null }])
    expect(workspace.activeAssignmentIds).toEqual([project.id])
  })
  it("uses the event's judge role regardless of the active Clerk organization", async () => {
    auth.mockResolvedValue({ userId: "user-1", orgId: "another-org" })
    expect(renderToStaticMarkup(await callPage())).toContain("Review queue")
    expect(getRegistrationInfo).toHaveBeenCalledWith(event.id, "user-1")
  })
})
