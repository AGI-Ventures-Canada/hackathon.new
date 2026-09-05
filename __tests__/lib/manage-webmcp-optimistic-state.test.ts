import { describe, expect, it } from "bun:test"
import type { Prize } from "@/lib/db/hackathon-types"
import type { Announcement } from "@/lib/services/announcements"
import type { Challenge } from "@/lib/services/challenges"
import type { ScheduleItem } from "@/lib/services/schedule-items"
import {
  createManageWebMcpState,
  manageWebMcpStateReducer,
  selectManageWebMcpVisibleState,
  type ManageWebMcpCommittedChange,
  type ManageWebMcpOptimisticChange,
  type ManageWebMcpState,
  type ManageWebMcpVisibleState,
} from "@/lib/webmcp/manage-optimistic-state"

const createdAt = "2026-08-25T15:00:00.000Z"

function scheduleItem(id: string, title: string): ScheduleItem {
  return {
    id,
    hackathon_id: "event-1",
    title,
    description: null,
    starts_at: "2026-09-10T16:00:00.000Z",
    ends_at: null,
    location: null,
    sort_order: 0,
    trigger_type: null,
    linked_to: null,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function challenge(id: string, title: string): Challenge {
  return {
    id,
    hackathonId: "event-1",
    title,
    description: null,
    resources: [],
    sortOrder: 0,
    createdAt,
    updatedAt: createdAt,
  }
}

function prize(id: string, name: string): Prize {
  return {
    id,
    hackathon_id: "event-1",
    name,
    description: null,
    value: null,
    type: "favorite",
    rank: null,
    kind: "prize",
    monetary_value: null,
    currency: null,
    distribution_method: null,
    display_value: null,
    criteria_id: null,
    prize_track_id: null,
    judging_style: "judges_pick",
    round_id: null,
    assignment_mode: "organizer_assigned",
    max_picks: 3,
    is_screening: false,
    allowed_team_modes: null,
    display_order: 0,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function announcement(id: string, title: string): Announcement {
  return {
    id,
    hackathon_id: "event-1",
    title,
    body: "Review this draft.",
    priority: "normal",
    audience: "everyone",
    published_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function initialVisibleState(): ManageWebMcpVisibleState {
  return {
    details: { name: "Build Day", description: "Original details" },
    timeline: {
      startsAt: "2026-09-10T16:00:00.000Z",
      endsAt: "2026-09-11T21:00:00.000Z",
    },
    scheduleItems: [scheduleItem("schedule-1", "Opening")],
    challenges: [challenge("challenge-1", "Original challenge")],
    prizes: [prize("prize-1", "Original prize")],
    announcements: [announcement("announcement-1", "Original draft")],
  }
}

function begin(change: ManageWebMcpOptimisticChange): ManageWebMcpState {
  return manageWebMcpStateReducer(
    createManageWebMcpState(initialVisibleState()),
    { type: "begin", change },
  )
}

function commit(
  state: ManageWebMcpState,
  change: ManageWebMcpCommittedChange,
): ManageWebMcpState {
  return manageWebMcpStateReducer(state, { type: "commit", change })
}

function rollback(
  state: ManageWebMcpState,
  mutationId: string,
): ManageWebMcpState {
  return manageWebMcpStateReducer(state, { type: "rollback", mutationId })
}

describe("manage WebMCP optimistic state", () => {
  it("optimistically updates, commits, and rolls back details", () => {
    const optimistic: ManageWebMcpOptimisticChange = {
      mutationId: "details-1",
      kind: "details",
      href: "/manage?tab=edit",
      summary: "Updating details",
      patch: { name: "Agent Build Day", description: "Prepared details" },
    }
    const pending = begin(optimistic)
    expect(selectManageWebMcpVisibleState(pending).details).toEqual({
      name: "Agent Build Day",
      description: "Prepared details",
    })

    const committed = commit(pending, {
      mutationId: optimistic.mutationId,
      kind: "details",
      details: { name: "Saved Build Day", description: "Saved details" },
    })
    expect(selectManageWebMcpVisibleState(committed).details).toEqual({
      name: "Saved Build Day",
      description: "Saved details",
    })
    expect(committed.pending).toHaveLength(0)

    expect(
      selectManageWebMcpVisibleState(
        rollback(begin(optimistic), optimistic.mutationId),
      ).details,
    ).toEqual(initialVisibleState().details)
  })

  it("optimistically updates, commits, and rolls back the timeline", () => {
    const optimistic: ManageWebMcpOptimisticChange = {
      mutationId: "timeline-1",
      kind: "timeline",
      href: "/manage?tab=overview",
      summary: "Updating dates",
      timeline: {
        startsAt: "2026-09-12T16:00:00.000Z",
        endsAt: "2026-09-13T21:00:00.000Z",
      },
    }
    const pending = begin(optimistic)
    expect(selectManageWebMcpVisibleState(pending).timeline).toEqual(
      optimistic.timeline,
    )

    const savedTimeline = {
      startsAt: "2026-09-12T17:00:00.000Z",
      endsAt: "2026-09-13T22:00:00.000Z",
    }
    const committed = commit(pending, {
      mutationId: optimistic.mutationId,
      kind: "timeline",
      timeline: savedTimeline,
    })
    expect(selectManageWebMcpVisibleState(committed).timeline).toEqual(
      savedTimeline,
    )
    expect(
      selectManageWebMcpVisibleState(
        rollback(begin(optimistic), optimistic.mutationId),
      ).timeline,
    ).toEqual(initialVisibleState().timeline)
  })

  it("optimistically adds, commits, and rolls back a schedule item", () => {
    const optimisticItem = scheduleItem("schedule-temp", "Agent lunch")
    const optimistic: ManageWebMcpOptimisticChange = {
      mutationId: "schedule-change-1",
      kind: "schedule",
      href: "/manage?tab=overview",
      summary: "Adding lunch",
      item: optimisticItem,
    }
    const pending = begin(optimistic)
    expect(
      selectManageWebMcpVisibleState(pending).scheduleItems.map(
        (item) => item.id,
      ),
    ).toEqual(["schedule-1", "schedule-temp"])

    const savedItem = scheduleItem("schedule-2", "Saved lunch")
    const committed = commit(pending, {
      mutationId: optimistic.mutationId,
      kind: "schedule",
      item: savedItem,
    })
    expect(
      selectManageWebMcpVisibleState(committed).scheduleItems.map(
        (item) => item.id,
      ),
    ).toEqual(["schedule-1", "schedule-2"])
    expect(
      selectManageWebMcpVisibleState(
        rollback(begin(optimistic), optimistic.mutationId),
      ).scheduleItems,
    ).toEqual(initialVisibleState().scheduleItems)
  })

  it("optimistically adds, commits, and rolls back a challenge", () => {
    const optimisticChallenge = challenge("challenge-temp", "Agent challenge")
    const optimistic: ManageWebMcpOptimisticChange = {
      mutationId: "challenge-change-1",
      kind: "challenge",
      href: "/manage?tab=challenges",
      summary: "Adding challenge",
      challenge: optimisticChallenge,
    }
    const pending = begin(optimistic)
    expect(
      selectManageWebMcpVisibleState(pending).challenges.map((item) => item.id),
    ).toEqual(["challenge-1", "challenge-temp"])

    const savedChallenge = challenge("challenge-2", "Saved challenge")
    const committed = commit(pending, {
      mutationId: optimistic.mutationId,
      kind: "challenge",
      challenge: savedChallenge,
    })
    expect(
      selectManageWebMcpVisibleState(committed).challenges.map(
        (item) => item.id,
      ),
    ).toEqual(["challenge-1", "challenge-2"])
    expect(
      selectManageWebMcpVisibleState(
        rollback(begin(optimistic), optimistic.mutationId),
      ).challenges,
    ).toEqual(initialVisibleState().challenges)
  })

  it("optimistically adds, commits, and rolls back a prize", () => {
    const optimisticPrize = prize("prize-temp", "Agent prize")
    const optimistic: ManageWebMcpOptimisticChange = {
      mutationId: "prize-change-1",
      kind: "prize",
      href: "/manage?tab=judging&jtab=prizes",
      summary: "Adding prize",
      prize: optimisticPrize,
    }
    const pending = begin(optimistic)
    expect(
      selectManageWebMcpVisibleState(pending).prizes.map((item) => item.id),
    ).toEqual(["prize-1", "prize-temp"])

    const savedPrize = prize("prize-2", "Saved prize")
    const committed = commit(pending, {
      mutationId: optimistic.mutationId,
      kind: "prize",
      prize: savedPrize,
    })
    expect(
      selectManageWebMcpVisibleState(committed).prizes.map((item) => item.id),
    ).toEqual(["prize-1", "prize-2"])
    expect(
      selectManageWebMcpVisibleState(
        rollback(begin(optimistic), optimistic.mutationId),
      ).prizes,
    ).toEqual(initialVisibleState().prizes)
  })

  it("optimistically adds, commits, and rolls back an announcement draft", () => {
    const optimisticAnnouncement = announcement(
      "announcement-temp",
      "Agent draft",
    )
    const optimistic: ManageWebMcpOptimisticChange = {
      mutationId: "announcement-change-1",
      kind: "announcement",
      href: "/manage?tab=event",
      summary: "Drafting announcement",
      announcement: optimisticAnnouncement,
    }
    const pending = begin(optimistic)
    expect(
      selectManageWebMcpVisibleState(pending).announcements.map(
        (item) => item.id,
      ),
    ).toEqual(["announcement-temp", "announcement-1"])

    const savedAnnouncement = announcement("announcement-2", "Saved draft")
    const committed = commit(pending, {
      mutationId: optimistic.mutationId,
      kind: "announcement",
      announcement: savedAnnouncement,
    })
    expect(
      selectManageWebMcpVisibleState(committed).announcements.map(
        (item) => item.id,
      ),
    ).toEqual(["announcement-2", "announcement-1"])
    expect(
      selectManageWebMcpVisibleState(
        rollback(begin(optimistic), optimistic.mutationId),
      ).announcements,
    ).toEqual(initialVisibleState().announcements)
  })

  it("does not copy pending collection items into the saved base", () => {
    const changes: ManageWebMcpOptimisticChange[] = [
      {
        mutationId: "schedule-change",
        kind: "schedule",
        href: "/manage?tab=overview",
        summary: "Adding schedule item",
        item: scheduleItem("schedule-temp", "Agent lunch"),
      },
      {
        mutationId: "challenge-change",
        kind: "challenge",
        href: "/manage?tab=challenges",
        summary: "Adding challenge",
        challenge: challenge("challenge-temp", "Agent challenge"),
      },
      {
        mutationId: "prize-change",
        kind: "prize",
        href: "/manage?tab=judging&jtab=prizes",
        summary: "Adding prize",
        prize: prize("prize-temp", "Agent prize"),
      },
      {
        mutationId: "announcement-change",
        kind: "announcement",
        href: "/manage?tab=event",
        summary: "Adding announcement",
        announcement: announcement("announcement-temp", "Agent draft"),
      },
    ]
    let state = createManageWebMcpState(initialVisibleState())
    for (const change of changes) {
      state = manageWebMcpStateReducer(state, { type: "begin", change })
    }
    const visible = selectManageWebMcpVisibleState(state)
    state = manageWebMcpStateReducer(state, {
      type: "sync_schedule",
      scheduleItems: visible.scheduleItems,
    })
    state = manageWebMcpStateReducer(state, {
      type: "sync_challenges",
      challenges: visible.challenges,
    })
    state = manageWebMcpStateReducer(state, {
      type: "sync_prizes",
      prizes: visible.prizes,
    })
    state = manageWebMcpStateReducer(state, {
      type: "sync_announcements",
      announcements: visible.announcements,
    })
    for (const change of changes) {
      state = manageWebMcpStateReducer(state, {
        type: "rollback",
        mutationId: change.mutationId,
      })
    }

    expect(selectManageWebMcpVisibleState(state)).toEqual(initialVisibleState())
  })
})

describe("sponsor optimistic changes", () => {
  const sponsor = (id: string, name: string) => ({
    id, name, hackathon_id: "event-1", tier: "none" as const,
    custom_tier_label: null, website_url: null, logo_url: null, logo_url_dark: null,
    sponsor_tenant_id: null, tenant_sponsor_id: null, use_org_assets: false,
    display_order: 0, created_at: createdAt,
  })
  it("keeps another sponsor save when one overlapping change fails", () => {
    let state = createManageWebMcpState({ ...initialVisibleState(), sponsors: [] })
    const first = { kind: "sponsors" as const, mutationId: "first", sponsorId: "a", sponsor: sponsor("a", "First"), href: "/", summary: "Adding first" }
    const second = { ...first, mutationId: "second", sponsorId: "b", sponsor: sponsor("b", "Second") }
    state = manageWebMcpStateReducer(state, { type: "begin", change: first })
    state = manageWebMcpStateReducer(state, { type: "begin", change: second })
    expect(selectManageWebMcpVisibleState(state).sponsors?.map(item => item.name)).toEqual(["First", "Second"])
    state = manageWebMcpStateReducer(state, { type: "commit", change: second })
    state = manageWebMcpStateReducer(state, { type: "rollback", mutationId: "first" })
    expect(selectManageWebMcpVisibleState(state).sponsors?.map(item => item.name)).toEqual(["Second"])
  })
  it("removes only the selected sponsor and restores it on failure", () => {
    const original = [sponsor("a", "First"), sponsor("b", "Second")]
    let state = createManageWebMcpState({ ...initialVisibleState(), sponsors: original })
    state = manageWebMcpStateReducer(state, { type: "begin", change: { kind: "sponsors", mutationId: "remove", sponsorId: "a", sponsor: null, href: "/", summary: "Removing" } })
    expect(selectManageWebMcpVisibleState(state).sponsors).toEqual([original[1]])
    state = manageWebMcpStateReducer(state, { type: "rollback", mutationId: "remove" })
    expect(selectManageWebMcpVisibleState(state).sponsors).toEqual(original)
  })
})
