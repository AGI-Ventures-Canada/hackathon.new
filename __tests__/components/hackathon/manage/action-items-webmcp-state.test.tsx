import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect, type ReactNode } from "react"
import type { Challenge } from "@/lib/services/challenges"
import type { ScheduleItem } from "@/lib/services/schedule-items"

let overviewScheduleProps: Record<string, unknown> = {}

mock.module("@/components/hackathon/overview-schedule", () => ({
  OverviewSchedule: (props: Record<string, unknown>) => {
    overviewScheduleProps = props
    return <div data-testid="overview-schedule" />
  },
}))

const refreshPoll = mock(() => {})
mock.module("@/hooks/use-organizer-poll", () => ({
  useOrganizerPoll: () => ({ data: null, isStale: false, refresh: refreshPoll }),
}))

mock.module("@/components/hackathon/manage/transition-confirm-dialog", () => ({
  TransitionConfirmDialog: () => null,
}))
mock.module("@/components/hackathon/manage/submission-deadline-dialog", () => ({
  SubmissionDeadlineDialog: () => null,
}))
mock.module("@/components/hackathon/manage/location-edit-dialog", () => ({
  LocationEditDialog: () => null,
}))
mock.module("@/components/hackathon/manage/team-settings-dialog", () => ({
  TeamSettingsDialog: () => null,
}))
mock.module("@/components/hackathon/edit-drawer/community-edit-form", () => ({
  CommunityEditForm: () => null,
}))
mock.module("@/components/hackathon/edit-drawer/timeline-edit-form", () => ({
  TimelineEditForm: () => null,
}))
mock.module("@/components/hackathon/edit-drawer/about-edit-form", () => ({
  AboutEditForm: () => null,
}))
mock.module("@/components/hackathon/banner-upload", () => ({
  BannerUpload: () => null,
}))
mock.module("@/components/hackathon/manage/showcase-dialog", () => ({
  ShowcaseDialog: () => null,
}))
mock.module("@/components/hackathon/manage/perk-editor-dialog", () => ({
  PerkEditorDialog: () => null,
}))
mock.module("@/components/hackathon/judging/add-judge-dialog", () => ({
  AddJudgeDialog: () => null,
}))
mock.module("@/components/hackathon/judging/add-prize-dialog", () => ({
  AddPrizeDialog: () => null,
}))

const initialSchedule: ScheduleItem = {
  id: "schedule-1",
  hackathon_id: "11111111-1111-1111-1111-111111111111",
  title: "Opening",
  description: null,
  starts_at: "2026-09-10T16:00:00.000Z",
  ends_at: null,
  location: null,
  sort_order: 0,
  trigger_type: null,
  linked_to: null,
  created_at: "2026-08-25T15:00:00.000Z",
  updated_at: "2026-08-25T15:00:00.000Z",
}

const replacementSchedule: ScheduleItem = {
  ...initialSchedule,
  id: "schedule-2",
  title: "Lunch",
}

const initialChallenge: Challenge = {
  id: "challenge-1",
  hackathonId: "11111111-1111-1111-1111-111111111111",
  title: "City helper",
  description: null,
  resources: [],
  sortOrder: 0,
  createdAt: "2026-08-25T15:00:00.000Z",
  updatedAt: "2026-08-25T15:00:00.000Z",
}

let challengeToSave: Challenge = {
  ...initialChallenge,
  title: "Updated city helper",
}

mock.module("@/components/hackathon/manage/challenge-editor-dialog", () => ({
  ChallengeEditorDialog: ({
    open,
    onSaved,
  }: {
    open: boolean
    onSaved: (challenge: Challenge) => void
  }) => open ? (
    <button type="button" onClick={() => onSaved(challengeToSave)}>
      Save mocked challenge
    </button>
  ) : null,
}))

mock.module("@/components/hackathon/schedule-editor", () => ({
  ScheduleEditor: ({
    onScheduleChange,
  }: {
    onScheduleChange: (items: ScheduleItem[]) => void
  }) => (
    <button
      type="button"
      onClick={() => onScheduleChange([replacementSchedule])}
    >
      Replace mocked schedule
    </button>
  ),
}))

const { ActionItemsProvider, useActionItems } = await import(
  "@/components/hackathon/manage/action-items-context"
)
const { ManageHackathonName, ManageHackathonTabCount } = await import(
  "@/components/hackathon/manage/manage-hackathon-name"
)
const { OrganizerOverview } = await import(
  "@/components/hackathon/organizer-overview"
)
const { ChallengesTab } = await import(
  "@/components/hackathon/manage/challenges-tab"
)

type ContextValue = ReturnType<typeof useActionItems>
let currentContext: ContextValue | null = null

function ContextProbe() {
  const context = useActionItems()
  useEffect(() => {
    currentContext = context
  }, [context])
  return (
    <div>
      <span data-testid="name">{context.manageWebMcpView.details.name}</span>
      <span data-testid="schedule">
        {context.manageWebMcpView.scheduleItems.map((item) => item.title).join(",")}
      </span>
      <span data-testid="challenges">
        {context.manageWebMcpView.challenges.map((item) => item.title).join(",")}
      </span>
      <span data-testid="prizes">{context.manageWebMcpView.prizes.length}</span>
      <span data-testid="announcements">
        {context.manageWebMcpView.announcements.length}
      </span>
    </div>
  )
}

function provider(
  children: ReactNode,
  overrides: Partial<{
    name: string
    description: string | null
    startsAt: string | null
    endsAt: string | null
    scheduleItems: ScheduleItem[]
    challenges: Challenge[]
  }> = {},
) {
  return (
    <ActionItemsProvider
      actionItems={[]}
      hackathonId="11111111-1111-1111-1111-111111111111"
      slug="build-day"
      name={overrides.name ?? "Build Day"}
      status="draft"
      phase={null}
      challengeExists
      challengeReleasedAt={null}
      challenges={overrides.challenges ?? [initialChallenge]}
      prizes={[]}
      announcements={[]}
      challengeReleaseItem={null}
      scheduleItems={overrides.scheduleItems ?? [initialSchedule]}
      startsAt={overrides.startsAt ?? "2026-09-10T16:00:00.000Z"}
      endsAt={overrides.endsAt ?? "2026-09-11T23:00:00.000Z"}
      registrationClosesAt="2026-09-09T23:00:00.000Z"
      allowLateRegistration={false}
      description={overrides.description ?? "Make something useful."}
      descriptionLocale={null}
      bannerUrl={null}
      locationInitialData={{
        locationType: "hybrid",
        locationName: "Main Hall",
        locationUrl: null,
        locationLatitude: null,
        locationLongitude: null,
        requireLocationVerification: false,
      }}
      teamSettingsInitialData={{
        minTeamSize: 1,
        maxTeamSize: 5,
        allowSolo: true,
        requireTeamApproval: false,
      }}
      communityInitialData={{ url: null, label: null }}
      sponsors={[]}
      rounds={[]}
      judgingSetupIssues={[]}
    >
      {children}
    </ActionItemsProvider>
  )
}

beforeEach(() => {
  currentContext = null
  overviewScheduleProps = {}
  refreshPoll.mockClear()
  localStorage.clear()
  challengeToSave = {
    ...initialChallenge,
    title: "Updated city helper",
  }
})

afterEach(() => {
  cleanup()
})

describe("ActionItemsProvider WebMCP state", () => {
  it("keeps organizer names, counts, schedules, and pending challenge controls on one visible state", async () => {
    render(
      provider(
        <>
          <ContextProbe />
          <ManageHackathonName />
          <span data-testid="challenge-count">
            <ManageHackathonTabCount kind="challenges" />
          </span>
          <OrganizerOverview
            slug="build-day"
            hackathonId="11111111-1111-1111-1111-111111111111"
            stats={{
              participantCount: 3,
              teamCount: 2,
              submissionCount: 1,
              judgingProgress: { totalAssignments: 2, completedAssignments: 1 },
              mentorQueue: { open: 0 },
            }}
            scheduleItems={[]}
            challengeReleasedAt={null}
            challengeExists
            hackathonStartsAt={null}
            hackathonEndsAt={null}
            hackathonStatus="draft"
          />
          <ChallengesTab
            hackathonId="11111111-1111-1111-1111-111111111111"
            initialChallenges={[]}
            releasedAt={null}
            releaseScheduleItem={null}
            hackathonStartsAt={null}
            hackathonEndsAt={null}
            hackathonStatus="draft"
          />
        </>,
      ),
    )
    await waitFor(() => expect(currentContext).not.toBeNull())

    act(() => {
      currentContext?.beginManageWebMcpChange({
        mutationId: "details-visible",
        kind: "details",
        href: "/e/build-day/manage?tab=edit",
        summary: "Updating the name",
        patch: { name: "Agent Build Day" },
      })
      currentContext?.beginManageWebMcpChange({
        mutationId: "timeline-visible",
        kind: "timeline",
        href: "/e/build-day/manage?tab=edit",
        summary: "Updating the timeline",
        timeline: {
          startsAt: "2026-09-12T16:00:00.000Z",
          endsAt: "2026-09-13T21:00:00.000Z",
        },
      })
      currentContext?.beginManageWebMcpChange({
        mutationId: "webmcp-challenge-pending",
        kind: "challenge",
        href: "/e/build-day/manage?tab=challenges",
        summary: "Adding a challenge",
        challenge: {
          ...initialChallenge,
          id: "webmcp-challenge-pending",
          title: "Agent challenge",
        },
      })
    })

    expect(screen.getByRole("heading", { name: "Agent Build Day" })).toBeDefined()
    expect(screen.getByTestId("challenge-count").textContent).toBe("2")
    expect(overviewScheduleProps).toMatchObject({
      scheduleItems: [expect.objectContaining({ title: "Opening" })],
      hackathonStartsAt: "2026-09-12T16:00:00.000Z",
      hackathonEndsAt: "2026-09-13T21:00:00.000Z",
    })
    expect(screen.getByText("Saving")).toBeDefined()
    expect(
      screen.getByRole("button", { name: "Release" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(
      screen.getAllByRole("button", { name: "Move down" })[0].hasAttribute(
        "disabled",
      ),
    ).toBe(true)
    expect(
      screen.getAllByRole("button", { name: "Edit" })[1].hasAttribute(
        "disabled",
      ),
    ).toBe(true)
    expect(
      screen.getAllByRole("button", { name: "Delete" })[1].hasAttribute(
        "disabled",
      ),
    ).toBe(true)
  })

  it("applies, commits, rolls back, and replaces visible organizer state", async () => {
    render(provider(<ContextProbe />))
    await waitFor(() => expect(currentContext).not.toBeNull())
    expect(screen.getByTestId("name").textContent).toBe("Build Day")

    act(() => {
      currentContext?.beginManageWebMcpChange({
        mutationId: "details-1",
        kind: "details",
        href: "/e/build-day/manage?tab=edit",
        summary: "Changing the name",
        patch: { name: "Optimistic name" },
      })
    })
    expect(screen.getByTestId("name").textContent).toBe("Optimistic name")

    act(() => currentContext?.rollbackManageWebMcpChange("details-1"))
    expect(screen.getByTestId("name").textContent).toBe("Build Day")

    act(() => {
      currentContext?.beginManageWebMcpChange({
        mutationId: "details-2",
        kind: "details",
        href: "/e/build-day/manage?tab=edit",
        summary: "Changing the name",
        patch: { name: "Pending name" },
      })
      currentContext?.commitManageWebMcpChange({
        mutationId: "details-2",
        kind: "details",
        details: { name: "Saved name", description: "Saved details" },
      })
    })
    expect(screen.getByTestId("name").textContent).toBe("Saved name")

    act(() => {
      currentContext?.replaceManageSchedule([replacementSchedule])
      currentContext?.replaceManageChallenges([])
      currentContext?.replaceManagePrizes([{
        id: "prize-1",
        name: "Best demo",
      } as never])
      currentContext?.replaceManageAnnouncements([{
        id: "announcement-1",
        title: "Doors open",
      } as never])
    })
    expect(screen.getByTestId("schedule").textContent).toBe("Lunch")
    expect(screen.getByTestId("challenges").textContent).toBe("")
    expect(screen.getByTestId("prizes").textContent).toBe("1")
    expect(screen.getByTestId("announcements").textContent).toBe("1")
  })

  it("syncs server props and routes dialog saves through the same visible state", async () => {
    const view = render(provider(<ContextProbe />))
    await waitFor(() => expect(currentContext).not.toBeNull())

    view.rerender(
      provider(<ContextProbe />, {
        name: "Server refresh",
        description: "New details",
        startsAt: "2026-10-01T16:00:00.000Z",
        endsAt: "2026-10-02T23:00:00.000Z",
        scheduleItems: [replacementSchedule],
        challenges: [],
      }),
    )
    await waitFor(() => {
      expect(screen.getByTestId("name").textContent).toBe("Server refresh")
      expect(screen.getByTestId("schedule").textContent).toBe("Lunch")
      expect(screen.getByTestId("challenges").textContent).toBe("")
    })

    view.rerender(provider(<ContextProbe />))
    await waitFor(() => expect(screen.getByTestId("challenges").textContent).toBe("City helper"))
    act(() => {
      currentContext?.handleActionClick({
        id: "open-challenge",
        label: "Edit challenge",
        severity: "warning",
        action: "open-challenge-dialog",
        close: { kind: "manual" },
      })
    })
    fireEvent.click(screen.getByRole("button", { name: "Save mocked challenge" }))
    await waitFor(() =>
      expect(screen.getByTestId("challenges").textContent).toBe(
        "Updated city helper",
      ),
    )

    act(() => {
      currentContext?.handleActionClick({
        id: "open-agenda",
        label: "Edit agenda",
        severity: "info",
        action: "open-agenda-dialog",
        close: { kind: "manual" },
      })
    })
    fireEvent.click(screen.getByRole("button", { name: "Replace mocked schedule" }))
    expect(screen.getByTestId("schedule").textContent).toBe("Lunch")
  })
})
