import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { useEffect } from "react"

type Props = Record<string, unknown>

const eventId = "11111111-1111-4111-8111-111111111111"
const viewId = "22222222-2222-4222-8222-222222222222"

let signedInUserId: string | null = null
let mentorParticipantId: string | null = null
let presenterView: Props | null = null
let pollPayload: Props | null = null
let hackathon: Props
let submissions: Props[] = []
let winnerEntries: Props[] = []
let presenterSubmissions: Props[] = []
let captures: Record<string, Props>

const auth = mock(async () => ({ userId: signedInUserId }))
const getPublicHackathon = mock(async () => hackathon)
const listChallenges = mock(async () => [
  { id: "challenge-1", title: "Build safely" },
])
const buildPollPayload = mock(async () => pollPayload)
const getPresenterView = mock(async () => presenterView)
const resolvePresenterSubmissions = mock(async () => presenterSubmissions)
const getWinnerPageData = mock(async () => winnerEntries)
const getMentorParticipantId = mock(async () => mentorParticipantId)
const getQueueStats = mock(async () => ({ open: 2, claimed: 1 }))
const getMentorQueuePage = mock(async () => ({
  requests: [
    {
      id: "request-1",
      team_name: "Team Maple",
      category: "API",
      description: "We need help with auth.",
      status: "claimed",
      created_at: "2026-08-26T16:00:00.000Z",
      claimed_by_participant_id: "mentor-1",
    },
  ],
  total: 1,
  truncated: false,
}))
const getHackathonSubmissions = mock(async () => submissions)
const getVoteCounts = mock(async () => [{ submissionId: "submission-1", voteCount: 4 }])
const getUserVote = mock(async () => "submission-1")
const listPrizes = mock(async () => [{
  id: "prize-crowd",
  name: "Crowd favorite",
  judging_style: "crowd_vote",
  type: "crowd",
}])
const notFound = mock((): never => {
  throw new Error("NEXT_NOT_FOUND")
})

mock.module("next/navigation", () => ({ notFound }))
mock.module("@clerk/nextjs/server", () => ({ auth }))
mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon,
}))
mock.module("@/lib/services/challenges", () => ({ listChallenges }))
mock.module("@/lib/services/polling", () => ({ buildPollPayload }))
mock.module("@/lib/services/presenter-views", () => ({
  getPresenterView,
  resolvePresenterSubmissions,
}))
mock.module("@/lib/services/winner-pages", () => ({ getWinnerPageData }))
mock.module("@/lib/services/mentor-requests", () => ({
  getMentorParticipantId,
  getMentorQueuePage,
  getQueueStats,
}))
mock.module("@/lib/services/submissions", () => ({
  getHackathonSubmissions,
  isSubmissionWindowOpen: mock(() => Promise.resolve(true)),
}))
mock.module("@/lib/services/crowd-voting", () => ({
  getVoteCounts,
  getUserVote,
}))
mock.module("@/lib/services/prizes", () => ({ listPrizes }))

function capture(name: string) {
  const CapturedComponent = (props: Props) => {
    useEffect(() => {
      captures[name] = props
    }, [props])
    return <div data-testid={name} />
  }
  CapturedComponent.displayName = `Captured${name}`
  return CapturedComponent
}

mock.module("@/components/hackathon/display/fullscreen-challenge", () => ({
  FullscreenChallenge: capture("challenge"),
}))
mock.module("@/components/hackathon/display/fullscreen-leaderboard", () => ({
  FullscreenLeaderboard: capture("leaderboard"),
}))
mock.module("@/components/hackathon/display/room-grid", () => ({
  RoomGrid: capture("rooms"),
}))
mock.module("@/components/hackathon/display/fullscreen-showcase", () => ({
  FullscreenShowcase: capture("showcase"),
}))
mock.module("@/components/hackathon/display/fullscreen-timer", () => ({
  FullscreenTimer: capture("timer"),
}))
mock.module("@/components/hackathon/display/fullscreen-winners", () => ({
  FullscreenWinners: capture("display-winners"),
}))
mock.module("@/components/hackathon/winners/winner-grid", () => ({
  WinnerGrid: capture("winner-grid"),
}))
mock.module("@/components/hackathon/mentors/mentor-workspace", () => ({
  MentorWorkspace: capture("mentor-workspace"),
}))
mock.module("@/components/hackathon/voting/vote-gallery", () => ({
  VoteGallery: capture("vote-gallery"),
}))
mock.module("@/components/ui/auto-refresh", () => ({
  AutoRefresh: capture("auto-refresh"),
}))

const challengePage = await import(
  "@/app/(public)/e/[slug]/display/challenge/page"
)
const leaderboardPage = await import(
  "@/app/(public)/e/[slug]/display/leaderboard/page"
)
const roomsPage = await import("@/app/(public)/e/[slug]/display/rooms/page")
const showcasePage = await import(
  "@/app/(public)/e/[slug]/display/showcase/page"
)
const timerPage = await import("@/app/(public)/e/[slug]/display/timer/page")
const displayWinnersPage = await import(
  "@/app/(public)/e/[slug]/display/winners/page"
)
const mentorsPage = await import("@/app/(public)/e/[slug]/mentors/page")
const votePage = await import("@/app/(public)/e/[slug]/vote/page")
const winnersPage = await import("@/app/(public)/e/[slug]/winners/page")

const params = Promise.resolve({ slug: "build-day" })

beforeEach(() => {
  signedInUserId = null
  mentorParticipantId = null
  presenterView = null
  pollPayload = null
  submissions = []
  winnerEntries = []
  presenterSubmissions = []
  captures = {}
  hackathon = {
    id: eventId,
    slug: "build-day",
    name: "Build Day",
    status: "active",
    phase: "hacking",
    ends_at: "2026-09-11T21:00:00.000Z",
    challenge_released_at: null,
    results_published_at: "2026-09-12T18:00:00.000Z",
    anonymous_judging: true,
  }
  for (const fn of [
    auth,
    getPublicHackathon,
    listChallenges,
    buildPollPayload,
    getPresenterView,
    resolvePresenterSubmissions,
    getWinnerPageData,
    getMentorParticipantId,
    getQueueStats,
    getMentorQueuePage,
    getHackathonSubmissions,
    listPrizes,
    getVoteCounts,
    getUserVote,
    notFound,
  ]) {
    fn.mockClear()
  }
})

afterEach(cleanup)

describe("public role page boundaries", () => {
  it("keeps challenge details private until release and exposes them afterward", async () => {
    render(await challengePage.default({ params }))

    expect(captures.challenge.initialReleased).toBe(false)
    expect(captures.challenge.initialChallenges).toEqual([])
    expect(listChallenges).not.toHaveBeenCalled()
    expect(await challengePage.generateMetadata({ params })).toEqual({
      title: "Challenge | Build Day",
    })

    cleanup()
    hackathon.challenge_released_at = "2026-09-10T18:00:00.000Z"
    render(await challengePage.default({ params }))
    expect(captures.challenge.initialReleased).toBe(true)
    expect(captures.challenge.initialChallenges).toEqual([
      { id: "challenge-1", title: "Build safely" },
    ])
  })

  it("hydrates leaderboard, room, and timer displays from public-safe state", async () => {
    pollPayload = {
      timers: { rooms: [{ id: "room-1", name: "Main room" }] },
    }

    render(await leaderboardPage.default({ params }))
    expect(captures.leaderboard).toMatchObject({
      slug: "build-day",
      hackathonName: "Build Day",
    })

    cleanup()
    render(await roomsPage.default({ params }))
    expect(captures.rooms.initialRooms).toEqual([
      { id: "room-1", name: "Main room" },
    ])

    cleanup()
    render(
      await timerPage.default({
        params,
        searchParams: Promise.resolve({ room: "room-1" }),
      }),
    )
    expect(captures.timer).toMatchObject({
      initialLabel: "Build ends",
      initialPhase: "hacking",
      roomId: "room-1",
    })
    expect(await timerPage.generateMetadata({ params })).toEqual({
      title: "Timer | Build Day",
    })
  })

  it("requires a valid showcase capability and anonymizes matching projects", async () => {
    render(
      await showcasePage.default({
        params,
        searchParams: Promise.resolve({ view: "not-a-capability" }),
      }),
    )
    expect(captures.showcase.submissions).toEqual([])
    expect(captures.showcase.message).toContain("Showcase dialog")
    expect(getPresenterView).not.toHaveBeenCalled()
    expect(resolvePresenterSubmissions).not.toHaveBeenCalled()

    presenterView = { id: viewId, hackathon_id: eventId, name: "Finalists" }
    presenterSubmissions = [
      {
        id: "submission-1",
        title: "Secret project",
        description: "A private entry",
        github_url: null,
        live_app_url: null,
        demo_video_url: null,
        screenshot_url: null,
        submitter_name: "Secret Team",
      },
    ]
    cleanup()
    render(
      await showcasePage.default({
        params,
        searchParams: Promise.resolve({ view: viewId }),
      }),
    )
    expect(captures.showcase.viewName).toBe("Finalists")
    expect(captures.showcase.submissions).toEqual([
      expect.objectContaining({ submitter: "Anonymous project" }),
    ])

    presenterView = {
      id: viewId,
      hackathon_id: "33333333-3333-4333-8333-333333333333",
      name: "Other event",
    }
    await expect(
      showcasePage.default({
        params,
        searchParams: Promise.resolve({ view: viewId }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("gates both winner pages on publication and removes team identity", async () => {
    winnerEntries = [
      {
        prizeName: "First place",
        prizeDescription: null,
        prizeValue: "$500",
        submissionTitle: "Secret project",
        teamName: "Secret Team",
      },
    ]

    render(await displayWinnersPage.default({ params }))
    expect(captures["display-winners"].winners).toEqual([
      expect.objectContaining({ teamName: "Anonymous project" }),
    ])

    cleanup()
    render(await winnersPage.default({ params }))
    expect(captures["winner-grid"].winners).toEqual([
      expect.objectContaining({ teamName: "Anonymous project" }),
    ])

    hackathon.results_published_at = null
    await expect(displayWinnersPage.default({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    )
    await expect(winnersPage.default({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    )
    expect(await winnersPage.generateMetadata({ params })).toEqual({
      title: "Winners",
    })
  })

  it("shows aggregate mentor totals publicly and private queue text only to mentors", async () => {
    render(await mentorsPage.default({ params }))

    expect(screen.getByText("Mentor queue totals")).toBeDefined()
    expect(captures["mentor-workspace"]).toMatchObject({
      isMentor: false,
      initialRequests: [],
      initialTotal: 0,
    })
    expect(getMentorQueuePage).not.toHaveBeenCalled()
    expect(captures["auto-refresh"]).toBeUndefined()

    signedInUserId = "user-mentor"
    mentorParticipantId = "mentor-1"
    cleanup()
    render(await mentorsPage.default({ params }))
    expect(screen.getByText("Help attendees who are stuck")).toBeDefined()
    expect(captures["mentor-workspace"].initialRequests).toEqual([
      expect.objectContaining({
        description: "We need help with auth.",
        claimedByMe: true,
      }),
    ])
    expect(captures["auto-refresh"].intervalMs).toBe(10_000)
  })

  it("filters draft projects, hides submitter identity, and reads a vote only when signed in", async () => {
    submissions = [
      {
        id: "submission-1",
        title: "Ready project",
        description: "Ready",
        status: "submitted",
        submitter_name: "Secret Team",
        screenshot_url: null,
        live_app_url: null,
        github_url: null,
        demo_video_url: null,
      },
      {
        id: "submission-draft",
        title: "Draft project",
        description: "Private",
        status: "draft",
        submitter_name: "Draft Team",
      },
    ]

    render(await votePage.default({ params }))
    expect(captures["vote-gallery"]).toMatchObject({
      isSignedIn: false,
      userVote: null,
    })
    expect(captures["vote-gallery"].submissions).toEqual([
      expect.objectContaining({
        id: "submission-1",
        submitterName: "Anonymous project",
      }),
    ])
    expect(getUserVote).not.toHaveBeenCalled()

    signedInUserId = "user-attendee"
    cleanup()
    render(await votePage.default({ params }))
    expect(captures["vote-gallery"]).toMatchObject({
      isSignedIn: true,
      userVote: "submission-1",
    })
    expect(getUserVote).toHaveBeenCalledWith(eventId, "prize-crowd", "user-attendee")

    submissions = []
    cleanup()
    render(await votePage.default({ params }))
    expect(screen.getByText("No submissions yet")).toBeDefined()
  })

  it("does not load unpublished vote totals after voting closes", async () => {
    hackathon.status = "completed"
    hackathon.results_published_at = null

    render(await votePage.default({ params }))

    expect(screen.getByText("Voting is closed")).toBeDefined()
    expect(getHackathonSubmissions).not.toHaveBeenCalled()
    expect(getVoteCounts).not.toHaveBeenCalled()
    expect(getUserVote).not.toHaveBeenCalled()
  })
})
