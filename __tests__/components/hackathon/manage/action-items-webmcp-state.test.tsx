import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect, type ReactNode } from "react"
import type { Challenge } from "@/lib/services/challenges"
import type { ScheduleItem } from "@/lib/services/schedule-items"
import type { ActionItem } from "@/lib/utils/organizer-actions"
import type { OrganizerActionStateSnapshot } from "@/lib/services/organizer-action-items"

let overviewScheduleProps: Record<string, unknown> = {}

mock.module("@/components/hackathon/overview-schedule", () => ({
  OverviewSchedule: (props: Record<string, unknown>) => {
    overviewScheduleProps = props
    return <div data-testid="overview-schedule" />
  },
}))

const refreshPoll = mock(() => {})
let organizerPollData: Record<string, unknown> | null = null
mock.module("@/hooks/use-organizer-poll", () => ({
  useOrganizerPoll: () => ({ data: organizerPollData, isStale: false, refresh: refreshPoll }),
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
    actionItems: ActionItem[]
    persistedActionState: OrganizerActionStateSnapshot
  }> = {},
) {
  return (
    <ActionItemsProvider
      actionItems={overrides.actionItems ?? []}
      hackathonId="11111111-1111-1111-1111-111111111111"
      slug="build-day"
      name={overrides.name ?? "Build Day"}
      status="draft"
      storedStatus="draft"
      phase={null}
      persistedActionState={overrides.persistedActionState ?? { generated: [], custom: [] }}
      challengeExists
      challengeReleasedAt={null}
      challenges={overrides.challenges ?? [initialChallenge]}
      prizes={[]}
      announcements={[]}
      challengeReleaseItem={null}
      scheduleItems={overrides.scheduleItems ?? [initialSchedule]}
      startsAt={overrides.startsAt ?? "2026-09-10T16:00:00.000Z"}
      endsAt={overrides.endsAt ?? "2026-09-11T23:00:00.000Z"}
      registrationOpensAt="2026-08-30T12:00:00.000Z"
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
      requiresJudgeScoring
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
  organizerPollData = null
})

afterEach(() => {
  cleanup()
})

describe("ActionItemsProvider WebMCP state", () => {
  it("keeps a regressed auto task pending even when old shared state says completed", async () => {
    const autoTask: ActionItem = {
      id: "send-judge-emails",
      label: "Send judge emails",
      severity: "urgent",
      close: { kind: "auto", isComplete: false },
    }
    render(provider(<ContextProbe />, {
      actionItems: [autoTask],
      persistedActionState: {
        generated: [{
          hackathon_id: "11111111-1111-1111-1111-111111111111",
          action_id: autoTask.id,
          item_kind: "generated",
          state: "completed",
          item: { ...autoTask, close: { kind: "auto", isComplete: true } },
          updated_at: "2026-08-30T12:00:00.000Z",
        }],
        custom: [],
      },
    }))

    await waitFor(() => expect(currentContext).not.toBeNull())
    expect(currentContext?.activeItems.map((item) => item.id)).toContain(autoTask.id)
    expect(currentContext?.completedItems.map((item) => item.id)).not.toContain(autoTask.id)
  })

  it("sends the shared version from the UI and reloads a stale task", async () => {
    const manualTask: ActionItem = {
      id: "review-team-settings",
      label: "Review team settings",
      severity: "info",
      close: { kind: "manual" },
    }
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      if (init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({
          error: "That task changed. Refresh the list and try again.",
          code: "stale_action",
        }), { status: 409, headers: { "Content-Type": "application/json" } }))
      }
      return Promise.resolve(new Response(JSON.stringify({
        event: { name: "Build Day", slug: "build-day" },
        totalCount: 1,
        pendingCount: 0,
        completedCount: 1,
        dismissedCount: 0,
        offset: 0,
        limit: 50,
        hasMore: false,
        nextOffset: null,
        items: [{
          taskRef: manualTask.id,
          label: manualTask.label,
          hint: null,
          tooltip: null,
          severity: manualTask.severity,
          state: "completed",
          completionPolicy: "manual",
          custom: false,
          destination: "action_items",
          inspectUrl: "/e/build-day/manage?tab=action-items",
          ctaLabel: null,
          blocksProgress: false,
          updatedAt: "2026-08-30T13:00:00.000Z",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
    }) as typeof fetch

    try {
      render(provider(<ContextProbe />, {
        actionItems: [manualTask],
        persistedActionState: {
          generated: [{
            hackathon_id: "11111111-1111-1111-1111-111111111111",
            action_id: manualTask.id,
            item_kind: "generated",
            state: "completed",
            item: manualTask,
            updated_at: "2026-08-30T12:00:00.000Z",
          }],
          custom: [],
        },
      }))
      await waitFor(() => expect(currentContext).not.toBeNull())

      act(() => currentContext?.toggleComplete(manualTask.id))
      await waitFor(() => expect(requests.some((request) => !request.init?.method)).toBe(true))

      const patchRequest = requests.find((request) => request.init?.method === "PATCH")
      expect(JSON.parse(String(patchRequest?.init?.body))).toMatchObject({
        state: "pending",
        expectedUpdatedAt: "2026-08-30T12:00:00.000Z",
      })
      await waitFor(() => {
        expect(currentContext?.completedItems.map((item) => item.id)).toContain(manualTask.id)
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("sends the shared version when removing a custom task", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      if (init?.method === "DELETE") {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }))
      }
      return Promise.resolve(new Response(JSON.stringify({
        event: { name: "Build Day", slug: "build-day" },
        totalCount: 0,
        pendingCount: 0,
        completedCount: 0,
        dismissedCount: 0,
        offset: 0,
        limit: 50,
        hasMore: false,
        nextOffset: null,
        items: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
    }) as typeof fetch

    try {
      render(provider(<ContextProbe />, {
        persistedActionState: {
          generated: [],
          custom: [{
            id: "custom-call-venue",
            hackathon_id: "11111111-1111-1111-1111-111111111111",
            label: "Call the venue",
            severity: "warning",
            completed_at: null,
            updated_at: "2026-08-30T12:00:00.000Z",
          }],
        },
      }))
      await waitFor(() => expect(currentContext?.customItems).toHaveLength(1))

      act(() => currentContext?.removeCustomItem("custom-call-venue"))
      await waitFor(() => expect(requests.some((request) => request.init?.method === "DELETE")).toBe(true))

      const deleteRequest = requests.find((request) => request.init?.method === "DELETE")
      expect(deleteRequest?.url).toContain(
        "expectedUpdatedAt=2026-08-30T12%3A00%3A00.000Z",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("does not truncate shared tasks after ten pages", async () => {
    organizerPollData = {}
    const originalFetch = globalThis.fetch
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://hackathon.new")
      const offset = Number(url.searchParams.get("offset") ?? "0")
      const pageNumber = offset / 50
      const isLastPage = pageNumber === 10
      const items = Array.from({ length: isLastPage ? 1 : 50 }, (_, index) => ({
        taskRef: isLastPage ? "custom-after-page-ten" : `saved-${offset + index}`,
        label: isLastPage ? "Task after page ten" : `Saved ${offset + index}`,
        hint: null,
        tooltip: null,
        severity: "info",
        state: "pending",
        completionPolicy: "manual",
        custom: isLastPage,
        destination: "action_items",
        inspectUrl: "/e/build-day/manage?tab=action-items",
        ctaLabel: null,
        blocksProgress: false,
        updatedAt: "2026-08-30T12:00:00.000Z",
      }))
      return Promise.resolve(new Response(JSON.stringify({
        event: { name: "Build Day", slug: "build-day" },
        totalCount: 501,
        pendingCount: 501,
        completedCount: 0,
        dismissedCount: 0,
        offset,
        limit: 50,
        hasMore: !isLastPage,
        nextOffset: isLastPage ? null : offset + 50,
        items,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    try {
      render(provider(<ContextProbe />))
      await waitFor(() => {
        expect(
          currentContext?.activeItems.some(
            (item) => item.id === "custom-after-page-ten",
          ),
        ).toBe(true)
      })
      expect(fetchMock).toHaveBeenCalledTimes(11)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("does not apply a partial refresh when custom tasks exceed the shared cap", async () => {
    organizerPollData = {}
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://hackathon.new")
      const offset = Number(url.searchParams.get("offset") ?? "0")
      const isLastPage = offset === 500
      const items = Array.from({ length: isLastPage ? 1 : 50 }, (_, index) => ({
        taskRef: `custom-${offset + index}`,
        label: `Custom ${offset + index}`,
        hint: null,
        tooltip: null,
        severity: "info",
        state: "pending",
        completionPolicy: "manual",
        custom: true,
        destination: "action_items",
        inspectUrl: "/e/build-day/manage?tab=action-items",
        ctaLabel: null,
        blocksProgress: false,
        updatedAt: "2026-08-30T12:00:00.000Z",
      }))
      return Promise.resolve(new Response(JSON.stringify({
        event: { name: "Build Day", slug: "build-day" },
        totalCount: 501,
        pendingCount: 501,
        completedCount: 0,
        dismissedCount: 0,
        offset,
        limit: 50,
        hasMore: !isLastPage,
        nextOffset: isLastPage ? null : offset + 50,
        items,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
    }) as typeof fetch

    try {
      render(provider(<ContextProbe />))
      await waitFor(() => {
        expect(currentContext?.actionItemsError).toContain("more than 500 custom tasks")
      })
      expect(currentContext?.customItems).toEqual([])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

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
