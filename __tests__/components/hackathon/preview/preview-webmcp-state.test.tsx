import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { useEffect, type ReactNode } from "react"
import type { PublicHackathon } from "@/lib/services/public-hackathons"
import type { ParticipantTeamInfo } from "@/lib/services/hackathons"
import { dispatchPrepareSponsorAction } from "@/lib/webmcp/client-events"

type Props = Record<string, unknown>

let captures: Record<string, Props> = {}
let editable = false
let editMode = false
let canInvite = true
let activeSection: string | null = null
const openSection = mock(() => {})

const manageView = {
  details: { name: "Agent Build Day", description: "Agent description" },
  timeline: {
    startsAt: "2026-09-12T16:00:00.000Z",
    endsAt: "2026-09-13T21:00:00.000Z",
  },
  scheduleItems: [
    {
      id: "schedule-agent",
      hackathon_id: "event-1",
      title: "Agent agenda",
      description: null,
      starts_at: "2026-09-12T16:30:00.000Z",
      ends_at: null,
      location: "Main Hall",
      sort_order: 0,
      trigger_type: null,
      linked_to: null,
      created_at: "2026-08-26T15:00:00.000Z",
      updated_at: "2026-08-26T15:00:00.000Z",
    },
  ],
  challenges: [
    {
      id: "challenge-agent",
      hackathonId: "event-1",
      title: "Agent challenge",
      description: null,
      resources: [],
      sortOrder: 0,
      createdAt: "2026-08-26T15:00:00.000Z",
      updatedAt: "2026-08-26T15:00:00.000Z",
    },
  ],
  prizes: [
    {
      id: "prize-agent",
      hackathon_id: "event-1",
      name: "Agent prize",
      description: null,
      value: "$500",
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
      created_at: "2026-08-26T15:00:00.000Z",
      updated_at: "2026-08-26T15:00:00.000Z",
    },
  ],
  announcements: [],
}

const actionItems = {
  manageWebMcpView: manageView,
  registerTabAction: mock(() => {}),
  unregisterTabAction: mock(() => {}),
}

mock.module("@/components/hackathon/manage/action-items-context", () => ({
  useActionItemsOptional: () => actionItems,
}))
mock.module("@/components/hackathon/preview/edit-context", () => ({
  EditProvider: ({
    children,
    isEditable,
  }: {
    children: ReactNode
    isEditable: boolean
  }) => {
    editable = isEditable
    return <>{children}</>
  },
  useEdit: () => ({
    isEditable: editable,
    editMode,
    activeSection,
    openSection,
    closeDrawer: mock(() => {}),
  }),
  SECTION_ORDER: ["name", "dates", "location", "about"],
}))
mock.module("@/hooks/use-is-client", () => ({ useIsClient: () => false }))
mock.module("@/hooks/use-team-rename", () => ({
  useTeamRename: () => ({ isEditing: false }),
}))
mock.module("@/hooks/use-optimistic-mutation", () => ({
  useOptimisticMutation: () => ({
    execute: mock(async () => {}),
    error: null,
  }),
}))
mock.module("@/lib/utils/team-invite", () => ({
  canInviteTeamMembers: () => canInvite,
}))
mock.module("@/components/hackathon/preview/editable-section", () => ({
  EditableSection: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
mock.module("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

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

mock.module("@/components/hackathon/event-hero", () => ({
  EventHero: capture("event-hero"),
}))
mock.module("@/components/hackathon/sponsor-section", () => ({
  SponsorSection: capture("sponsors"),
}))
mock.module("@/components/hackathon/judge-section", () => ({
  JudgeSection: capture("judges"),
}))
mock.module("@/components/hackathon/prize-section", () => ({
  PrizeSection: capture("prizes"),
}))
mock.module("@/components/hackathon/challenge-section", () => ({
  ChallengeSection: capture("challenges"),
}))
mock.module("@/components/hackathon/submission-gallery", () => ({
  SubmissionGallery: capture("submissions"),
}))
mock.module("@/components/hackathon/judging/judging-setup-dialog", () => ({
  JudgingSetupDialog: capture("judging-dialog"),
}))
mock.module("@/components/hackathon/preview/participant-team-header", () => ({
  ParticipantTeamHeader: capture("team-header"),
}))
mock.module("@/components/hackathon/results/public-results", () => ({
  PublicResults: capture("public-results"),
}))
mock.module("@/components/hackathon/perks-section", () => ({
  PerksSection: capture("perks"),
}))
mock.module("@/components/hackathon/preview/floating-action-bar", () => ({
  FloatingActionBar: capture("floating-bar"),
}))
mock.module("@/components/hackathon/organizer-logo-prompt", () => ({
  OrganizerLogoPrompt: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
mock.module("@/components/ui/markdown-content", () => ({
  MarkdownContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
mock.module("@/components/hackathon/preview/truncatable-content", () => ({
  TruncatableContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
mock.module("@/components/hackathon/banner-upload", () => ({
  BannerUpload: capture("banner-upload"),
}))
mock.module("@/components/hackathon/edit-drawer/name-edit-form", () => ({
  NameEditForm: capture("name-form"),
}))
mock.module("@/components/hackathon/edit-drawer/about-edit-form", () => ({
  AboutEditForm: capture("about-form"),
}))
mock.module("@/components/hackathon/edit-drawer/timeline-edit-form", () => ({
  TimelineEditForm: capture("timeline-form"),
}))
mock.module("@/components/hackathon/edit-drawer/location-edit-form", () => ({
  LocationEditForm: capture("location-form"),
}))
mock.module("@/components/hackathon/edit-drawer/sponsors-edit-form", () => ({
  SponsorsEditForm: capture("sponsors-form"),
}))
mock.module("@/components/hackathon/edit-drawer/community-edit-form", () => ({
  CommunityEditForm: capture("community-form"),
}))

const { HackathonPreviewClient } = await import(
  "@/components/hackathon/preview/hackathon-preview-client"
)

const baseHackathon = {
  id: "event-1",
  tenant_id: "tenant-1",
  name: "Server Build Day",
  slug: "build-day",
  description: "Server description",
  rules: null,
  starts_at: "2026-09-10T16:00:00.000Z",
  ends_at: "2026-09-11T21:00:00.000Z",
  registration_opens_at: null,
  registration_closes_at: null,
  allow_late_registration: false,
  max_participants: null,
  min_team_size: 1,
  max_team_size: 5,
  allow_solo: true,
  require_team_approval: false,
  status: "draft",
  banner_url: null,
  location_type: "hybrid",
  location_name: "Main Hall",
  location_url: null,
  location_latitude: null,
  location_longitude: null,
  require_location_verification: false,
  anonymous_judging: false,
  judging_mode: "single_round",
  results_published_at: null,
  winner_emails_sent_at: null,
  results_announcement_sent_at: null,
  feedback_survey_sent_at: null,
  feedback_survey_url: null,
  phase: null,
  challenge_released_at: null,
  perks_none: false,
  community_url: null,
  community_label: null,
  require_terms_acceptance: false,
  terms_content: null,
  translations: null,
  default_locale: "en",
  metadata: {},
  created_at: "2026-08-26T15:00:00.000Z",
  updated_at: "2026-08-26T15:00:00.000Z",
  organizer: {
    id: "tenant-1",
    name: "Oatmeal",
    slug: "oatmeal",
    logo_url: null,
    logo_url_dark: null,
    clerk_org_id: "org-1",
    clerk_user_id: null,
  },
  sponsors: [],
  judges: [],
  prizes: [],
  terms_hash: null,
} as PublicHackathon

function preview(
  hackathon: PublicHackathon,
  isEditable: boolean,
) {
  return (
    <HackathonPreviewClient
      hackathon={hackathon}
      isEditable={isEditable}
      scheduleItems={[
        {
          ...manageView.scheduleItems[0],
          id: "schedule-server",
          title: "Server agenda",
        },
      ]}
      challenges={[
        {
          ...manageView.challenges[0],
          id: "challenge-server",
          title: "Server challenge",
        },
      ]}
    />
  )
}

beforeEach(() => {
  captures = {}
  editable = false
  editMode = false
  canInvite = true
  activeSection = null
  actionItems.registerTabAction.mockClear()
  actionItems.unregisterTabAction.mockClear()
  openSection.mockClear()
})

afterEach(cleanup)

describe("HackathonPreviewClient WebMCP convergence", () => {
  it("hides an empty Community tab outside edit mode", () => {
    render(preview(baseHackathon, true))

    expect(screen.queryByRole("button", { name: "Community" })).toBeNull()
  })

  it("shows the empty Community tab while the organizer is editing", () => {
    editMode = true
    render(preview(baseHackathon, true))

    expect(screen.getByRole("button", { name: "Community" })).toBeDefined()
  })

  it("prepares a sponsor only for the organizer preview", async () => {
    const view = render(preview(baseHackathon, false))
    expect(dispatchPrepareSponsorAction("Acme")).toMatchObject({
      ok: false,
      error: { code: "preparation_unavailable" },
    })
    expect(openSection).not.toHaveBeenCalled()

    view.rerender(preview(baseHackathon, true))
    expect(dispatchPrepareSponsorAction("Acme")).toEqual({ ok: true })
    expect(openSection).toHaveBeenCalledWith("sponsors")
    activeSection = "sponsors"
    editMode = true
    view.rerender(preview(baseHackathon, true))
    await waitFor(() => {
      expect(captures["sponsors-form"].preparedName).toBe("Acme")
    })
  })

  it("does not tell captains they can invite after invitations close", () => {
    canInvite = false
    const teamInfo = {
      team: {
        id: "team-1",
        name: "Team Maple",
        status: "forming",
        inviteCode: "maple",
        captainClerkUserId: "user-1",
        mode: null,
      },
      members: [],
      pendingInvitations: [],
      isCaptain: true,
      room: null,
    } satisfies NonNullable<ParticipantTeamInfo>

    render(
      <HackathonPreviewClient
        hackathon={baseHackathon}
        isEditable={false}
        isRegistered
        participantRole="participant"
        teamInfo={teamInfo}
      />,
    )

    const statusSlot = captures["event-hero"].statusSlot as ReactNode
    cleanup()
    render(<>{statusSlot}</>)
    expect(screen.getByText("You’re the team captain — you can rename your team.")).toBeDefined()
    expect(screen.queryByText(/invite members and rename/)).toBeNull()
  })

  it("renders the same optimistic details, dates, schedule, challenges, and prizes organizers review", () => {
    render(preview(baseHackathon, true))

    expect(captures["event-hero"]).toMatchObject({
      name: "Agent Build Day",
      startsAt: "2026-09-12T16:00:00.000Z",
      endsAt: "2026-09-13T21:00:00.000Z",
    })
    expect(screen.getByText("Agent description")).toBeDefined()
    expect(screen.getByText("Agent agenda")).toBeDefined()
    expect(captures.challenges.challenges).toEqual(manageView.challenges)
    expect(captures.prizes.prizes).toEqual([
      expect.objectContaining({ id: "prize-agent", name: "Agent prize" }),
    ])
    expect(actionItems.registerTabAction).toHaveBeenCalledWith(
      "no-dates",
      expect.any(Function),
    )
    expect(actionItems.registerTabAction).toHaveBeenCalledWith(
      "no-description",
      expect.any(Function),
    )
  })

  it("does not leak organizer-only optimistic state onto the public preview", () => {
    render(preview(baseHackathon, false))

    expect(captures["event-hero"]).toMatchObject({
      name: "Server Build Day",
      startsAt: "2026-09-10T16:00:00.000Z",
      endsAt: "2026-09-11T21:00:00.000Z",
    })
    expect(screen.getByText("Server description")).toBeDefined()
    expect(screen.getByText("Server agenda")).toBeDefined()
    expect(captures.challenges.challenges).toEqual([
      expect.objectContaining({ title: "Server challenge" }),
    ])
    expect(captures.prizes.prizes).toEqual([])
    expect(actionItems.registerTabAction).not.toHaveBeenCalled()
  })

  it("shows resource links with released attendee challenges", () => {
    const releasedHackathon = {
      ...baseHackathon,
      status: "active",
      challenge_released_at: "2026-09-10T16:00:00.000Z",
    } as PublicHackathon

    render(preview(releasedHackathon, false))

    expect(captures.challenges).toMatchObject({
      releasedAt: "2026-09-10T16:00:00.000Z",
      showResources: true,
    })
  })

  it("removes an optimistic judge by stable display identity when the server confirms it", async () => {
    const view = render(preview(baseHackathon, true))
    const onJudgeAdded = captures["judging-dialog"].onJudgeAdded as (judge: {
      displayName: string
      imageUrl: string | null
      participantId: string
    }) => void

    act(() => {
      onJudgeAdded({
        displayName: "Alex Judge",
        imageUrl: "https://example.com/alex.png",
        participantId: "participant-private",
      })
    })
    expect(captures.judges.judges).toEqual([
      expect.objectContaining({
        name: "Alex Judge",
        participant_id: null,
      }),
    ])

    const confirmedHackathon = {
      ...baseHackathon,
      judges: [
        {
          id: "judge-server",
          hackathon_id: "event-1",
          name: "Alex Judge",
          title: null,
          organization: null,
          headshot_url: "https://example.com/alex.png",
          clerk_user_id: null,
          participant_id: "participant-private",
          display_order: 0,
          created_at: "2026-08-26T15:00:00.000Z",
          updated_at: "2026-08-26T15:00:00.000Z",
        },
      ],
    }
    view.rerender(preview(confirmedHackathon, true))
    await waitFor(() =>
      expect(captures.judges.judges).toEqual([
        expect.objectContaining({ id: "judge-server", name: "Alex Judge" }),
      ]),
    )
  })
})
