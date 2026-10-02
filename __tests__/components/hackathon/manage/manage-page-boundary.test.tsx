import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  Children,
  isValidElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react"

type Props = Record<string, unknown>

function boundary(name: string): ComponentType<Props> {
  function Boundary() {
    return null
  }
  Boundary.displayName = name
  return Boundary
}

const ActionItemsProvider = boundary("ActionItemsProvider")
const ManageHackathonWebMcpTools = boundary("ManageHackathonWebMcpTools")
const TestEventBanner = boundary("TestEventBanner")
const HackathonPreviewClient = boundary("HackathonPreviewClient")
const JudgingTabContent = boundary("JudgingTabContent")
const EventTabContent = boundary("EventTabContent")
const TeamsTab = boundary("TeamsTab")
const TabsUrlSync = boundary("TabsUrlSync")
const TabsPendingFallback = boundary("TabsPendingFallback")
const TabsList = boundary("TabsList")
const TabsContent = boundary("TabsContent")

const componentModules: Array<[string, Record<string, ComponentType<Props>>]> = [
  ["@/components/hackathon/judging/judging-setup-webmcp-tools", {JudgingSetupWebMcpTools: boundary("JudgingSetupWebMcpTools")}],
  ["@/components/hackathon/preview/hackathon-preview-client", { HackathonPreviewClient }],
  ["@/components/hackathon/hackathon-page-actions", { HackathonPageActions: boundary("HackathonPageActions") }],
  ["@/components/hackathon/lifecycle-stepper", { LifecycleStepper: boundary("LifecycleStepper") }],
  ["@/components/hackathon/organizer-overview", { OrganizerOverview: boundary("OrganizerOverview") }],
  ["@/components/hackathon/time-remaining-bar", { TimeRemainingBar: boundary("TimeRemainingBar") }],
  ["@/components/hackathon/manage/action-items-context", { ActionItemsProvider }],
  ["@/components/hackathon/manage/action-items-tab", { ActionItemsTab: boundary("ActionItemsTab") }],
  ["@/components/hackathon/manage/action-items-layout", { ActionItemsLayout: boundary("ActionItemsLayout") }],
  ["@/components/hackathon/manage/action-items-tab-badge", { ActionItemsTabBadge: boundary("ActionItemsTabBadge") }],
  ["@/components/hackathon/manage/manage-webmcp-tools", { ManageHackathonWebMcpTools }],
  ["@/components/hackathon/manage/test-event-banner", { TestEventBanner }],
  [
    "@/components/hackathon/manage/manage-hackathon-name",
    {
      ManageHackathonName: boundary("ManageHackathonName"),
      ManageHackathonTabCount: boundary("ManageHackathonTabCount"),
    },
  ],
  ["@/components/hackathon/manage/status-badge-menu", { StatusBadgeMenu: boundary("StatusBadgeMenu") }],
  ["@/components/hackathon/manage/challenges-tab", { ChallengesTab: boundary("ChallengesTab") }],
  ["@/components/hackathon/manage/perks-tab", { PerksTab: boundary("PerksTab") }],
  ["@/components/ui/tabs-url-sync", { TabsPendingFallback, TabsUrlSync }],
  [
    "@/components/ui/tabs",
    {
      TabsContent,
      TabsList,
      TabsTrigger: boundary("TabsTrigger"),
    },
  ],
  ["@/components/ui/tab-count", { TabCount: boundary("TabCount") }],
  ["@/app/(public)/e/[slug]/manage/_judging-tab", { JudgingTabContent }],
  ["@/app/(public)/e/[slug]/manage/_post-event-tab", { PostEventTabContent: boundary("PostEventTabContent") }],
  ["@/app/(public)/e/[slug]/manage/_event-tab", { EventTabContent }],
  ["@/app/(public)/e/[slug]/manage/_miscs-tab", { MiscsTabContent: boundary("MiscsTabContent") }],
  ["@/app/(public)/e/[slug]/manage/_teams-tab", { TeamsTab }],
  ["@/app/(public)/e/[slug]/manage/_people-tab", { PeopleTab: boundary("PeopleTab") }],
]

for (const [specifier, exports] of componentModules) {
  mock.module(specifier, () => exports)
}

let authUserId: string | null = "user-organizer"
let manageResult: Props

const auth = mock(async () => ({ userId: authUserId }))
const getManageHackathon = mock(async () => manageResult)
const getHackathonSubmissions = mock(async () => [
  {
    id: "submission-1",
    title: "Private project",
    description: "A project summary.",
    submitter_name: "Private Team",
  },
])
const getJudgingProgress = mock(async () => ({
  totalAssignments: 4,
  completedAssignments: 2,
}))
const listPrizes = mock(async () => [
  {
    id: "prize-1",
    hackathon_id: "event-1",
    name: "Best project",
    description: null,
    value: "$500",
    judging_style: "judges_pick",
    judgeCount: 2,
    totalAssignments: 4,
    completedAssignments: 2,
  },
])
const countJudgeDisplayProfiles = mock(async () => 2)
const countJudges = mock(async () => 2)
const countUnassignedSubmissions = mock(async () => 1)
const getJudgingSetupStatus = mock(async () => ({
  isReady: false,
  issues: ["Assign every project"],
}))
const countPendingJudgeInvitations = mock(async () => 1)
const getManageOverviewStats = mock(async () => ({
  participantCount: 12,
  teamCount: 3,
  pendingTeamApprovalCount: 1,
  mentorQueue: { open: 2, claimed: 1, resolved: 3 },
  challengeReleased: false,
}))
const listScheduleItems = mock(async () => [
  {
    id: "schedule-1",
    hackathon_id: "event-1",
    title: "Challenge release",
    description: null,
    starts_at: "2026-09-10T18:00:00.000Z",
    ends_at: null,
    location: null,
    sort_order: 0,
    trigger_type: "challenge_release",
    linked_to: "event_start",
    created_at: "2026-08-26T15:00:00.000Z",
    updated_at: "2026-08-26T15:00:00.000Z",
  },
])
const getSubmissionDeadline = mock(async () => "2026-09-11T19:00:00.000Z")
const listChallenges = mock(async () => [
  {
    id: "challenge-1",
    hackathonId: "event-1",
    title: "Build safely",
    description: "Keep user data private.",
    resources: [{ label: "Guide", url: "https://example.com/guide" }],
    sortOrder: 0,
    createdAt: "2026-08-26T15:00:00.000Z",
    updatedAt: "2026-08-26T15:00:00.000Z",
  },
])
const listRounds = mock(async () => [
  {
    id: "round-1",
    name: "Finals",
    status: "planned",
    displayOrder: 0,
    advancement: null,
    advancementConfig: null,
    prizeCount: 1,
    submissionCount: 1,
    screeningPrizeId: null,
  },
])
const listPerks = mock(async () => [
  {
    id: "perk-1",
    name: "Credits",
    type: "code",
    releasedAt: null,
  },
])
const isPerkReleased = mock(() => false)
const listAnnouncements = mock(async () => [
  {
    id: "announcement-1",
    hackathon_id: "event-1",
    title: "Private organizer draft",
    body: "Review before publishing.",
    priority: "normal",
    audience: "everyone",
    published_at: null,
    created_at: "2026-08-26T15:00:00.000Z",
    updated_at: "2026-08-26T15:00:00.000Z",
  },
])
const getOrganizerActionItems = mock(() => [
  {
    label: "Assign every project",
    hint: "Give each project a judge.",
    severity: "urgent",
  },
])
const availableLocales = mock(() => ["en", "fr"])
const normalizeLocale = mock((locale: string | null) => locale?.toLowerCase() ?? null)
const applyHackathonTranslation = mock((hackathon: Props, locale: string) => ({
  ...hackathon,
  name: locale === "fr" ? "Journée de création" : hackathon.name,
}))
const notFound = mock((): never => {
  throw new Error("NEXT_NOT_FOUND")
})

mock.module("next/navigation", () => ({ notFound, redirect: (href: string) => {throw new Error(`Redirect: ${href}`)} }))
mock.module("@clerk/nextjs/server", () => ({ auth }))
mock.module("@/lib/services/manage-hackathon", () => ({ getManageHackathon }))
mock.module("@/lib/services/submissions", () => ({
  getHackathonSubmissions,
  isSubmissionWindowOpen: mock(() => Promise.resolve(true)),
}))
mock.module("@/lib/services/judging-setup", () => ({getJudgingSetup: async () => ({readiness: {isReady: false, issues: [{code: "unassigned", message: "Assign every project", editor: "assignments"}], requiresJudgeScoring: true}})}))
mock.module("@/lib/services/judging", () => ({
  countJudges,
  countUnassignedSubmissions,
  getJudgingProgress,
  getJudgingSetupStatus,
  listPrizes,
  listRounds,
}))
mock.module("@/lib/services/judge-invitations", () => ({
  countPendingJudgeInvitations,
}))
mock.module("@/lib/services/judge-display", () => ({ countJudgeDisplayProfiles }))
mock.module("@/lib/services/manage-overview", () => ({ getManageOverviewStats }))
mock.module("@/lib/services/challenges", () => ({ listChallenges }))
mock.module("@/lib/services/announcements", () => ({ listAnnouncements }))
mock.module("@/lib/services/perks", () => ({ isPerkReleased, listPerks }))
mock.module("@/lib/services/schedule-items", () => ({
  listScheduleItems,
  getSubmissionDeadline,
}))
mock.module("@/lib/utils/organizer-actions", () => ({ getOrganizerActionItems }))
mock.module("@/lib/utils/language", () => ({
  availableLocales,
  normalizeLocale,
  applyHackathonTranslation,
}))

const { default: ManagePage } = await import(
  "@/app/(public)/e/[slug]/manage/page"
)

const baseHackathon: Props = {
  id: "event-1",
  tenant_id: "tenant-1",
  name: "Build Day",
  slug: "build-day",
  description: "Build something useful.",
  rules: null,
  starts_at: "2026-09-10T16:00:00.000Z",
  ends_at: "2026-09-11T21:00:00.000Z",
  registration_opens_at: "2026-08-26T15:00:00.000Z",
  registration_closes_at: "2026-09-09T21:00:00.000Z",
  allow_late_registration: false,
  max_participants: 100,
  min_team_size: 1,
  max_team_size: 5,
  allow_solo: true,
  require_team_approval: true,
  status: "draft",
  stored_status: "draft",
  banner_url: null,
  location_type: "hybrid",
  location_name: "Main Hall",
  location_url: null,
  location_latitude: null,
  location_longitude: null,
  require_location_verification: false,
  anonymous_judging: true,
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
  updated_at: "2026-08-26T17:00:00.000Z",
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
}

const serviceMocks = [
  auth,
  getManageHackathon,
  getHackathonSubmissions,
  getJudgingProgress,
  listPrizes,
  countJudgeDisplayProfiles,
  countJudges,
  countUnassignedSubmissions,
  getJudgingSetupStatus,
  countPendingJudgeInvitations,
  getManageOverviewStats,
  listScheduleItems,
  getSubmissionDeadline,
  listChallenges,
  listRounds,
  listPerks,
  isPerkReleased,
  listAnnouncements,
  getOrganizerActionItems,
  availableLocales,
  normalizeLocale,
  applyHackathonTranslation,
  notFound,
]

function findElement(
  node: ReactNode,
  type: ComponentType<Props>,
): ReactElement<Props> {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue
    if (child.type === type) return child
    const nested = findElementOrNull(child.props.children, type)
    if (nested) return nested
  }
  throw new Error(`Expected ${type.displayName ?? type.name}`)
}

function findElementOrNull(
  node: ReactNode,
  type: ComponentType<Props>,
): ReactElement<Props> | null {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue
    if (child.type === type) return child
    const nested = findElementOrNull(child.props.children, type)
    if (nested) return nested
  }
  return null
}

beforeEach(() => {
  authUserId = "user-organizer"
  manageResult = { ok: true, hackathon: { ...baseHackathon } }
  for (const fn of serviceMocks) fn.mockClear()
})

describe("manage page boundary", () => {
  it("assembles one role-safe visible state for organizer UI and WebMCP", async () => {
    const result = await ManagePage({
      params: Promise.resolve({ slug: "build-day" }),
      searchParams: Promise.resolve({ tab: "edit", lang: "fr" }),
    })

    const provider = findElement(result, ActionItemsProvider)
    expect(provider.props).toMatchObject({
      hackathonId: "event-1",
      slug: "build-day",
      name: "Journée de création",
      status: "draft",
      challenges: [expect.objectContaining({ title: "Build safely" })],
      prizes: [expect.objectContaining({ name: "Best project" })],
      announcements: [
        expect.objectContaining({ title: "Private organizer draft" }),
      ],
      startsAt: "2026-09-10T16:00:00.000Z",
      endsAt: "2026-09-11T21:00:00.000Z",
    })

    const webMcp = findElement(result, ManageHackathonWebMcpTools)
    expect(webMcp.props.context).toMatchObject({
      hackathon: {
        name: "Journée de création",
        status: "draft",
        storedStatus: "draft",
        eventVersion: "2026-08-26T17:00:00.000Z",
      },
      stats: {
        attendeeCount: 12,
        teamCount: 3,
        pendingTeamApprovalCount: 1,
        projectCount: 1,
      },
      actionItems: [
        {
          label: "Assign every project",
          hint: "Give each project a judge.",
          severity: "urgent",
        },
      ],
      projects: [
        {
          title: "Private project",
          description: "A project summary.",
          submitterName: "Private Team",
        },
      ],
      perks: [{ name: "Credits", type: "code", released: false }],
      announcements: [
        {
          title: "Private organizer draft",
          audience: "everyone",
          priority: "normal",
          publishedAt: null,
        },
      ],
    })

    const preview = findElement(result, HackathonPreviewClient)
    expect(preview.props).toMatchObject({
      isEditable: true,
      currentUserId: "user-organizer",
      currentLocale: "fr",
    })
    const judging = findElement(result, JudgingTabContent)
    expect(judging.props.submissions).toEqual([
      { id: "submission-1", title: "Private project" },
    ])
    expect(JSON.stringify(judging.props.submissions)).not.toContain("Private Team")
    expect(findElement(result, TabsUrlSync).props.value).toBe("edit")
    expect(findElement(result, TabsPendingFallback).props.serverValue).toBe(
      "edit",
    )
    expect(findElement(result, TabsList).props.className).toContain("flex-wrap")
    expect(findElementOrNull(result, TeamsTab)).toBeNull()
    expect(findElementOrNull(result, EventTabContent)).toBeNull()
    const mountedTabValues = Children.toArray(
      findElement(result, TabsUrlSync).props.children,
    )
      .flatMap((child) =>
        isValidElement<Props>(child)
          ? Children.toArray(child.props.children)
          : [],
      )
      .filter(
        (child): child is ReactElement<Props> =>
          isValidElement<Props>(child) && child.type === TabsContent,
      )
      .map((child) => child.props.value)
    expect(mountedTabValues).toEqual(["edit", "judging", "post-event"])
    expect(getOrganizerActionItems).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        mentorQueue: { open: 2, claimed: 1, resolved: 3 },
        unassignedSubmissionCount: 1,
        judgingSetupReady: false,
      }),
    )
  })

  it("fails closed before organizer data fan-out when access is denied", async () => {
    authUserId = null
    manageResult = { ok: false, error: "not_found" }

    await expect(
      ManagePage({
        params: Promise.resolve({ slug: "private-event" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")

    expect(notFound).toHaveBeenCalledTimes(1)
    expect(getHackathonSubmissions).not.toHaveBeenCalled()
    expect(getManageOverviewStats).not.toHaveBeenCalled()
    expect(listAnnouncements).not.toHaveBeenCalled()
  })

  it("falls back to the primary locale and safe default tab", async () => {
    const result = await ManagePage({
      params: Promise.resolve({ slug: "build-day" }),
      searchParams: Promise.resolve({ tab: "unknown", lang: "de" }),
    })

    expect(findElement(result, TabsUrlSync).props.value).toBe("action-items")
    expect(findElementOrNull(result, HackathonPreviewClient)).toBeNull()
    expect(applyHackathonTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event-1" }),
      "en",
    )
  })

  it("mounts the selected settings section without mounting other heavy tabs", async () => {
    const result = await ManagePage({
      params: Promise.resolve({ slug: "build-day" }),
      searchParams: Promise.resolve({ tab: "teams" }),
    })

    expect(findElement(result, TeamsTab).props.hackathonStatus).toBe("draft")
    expect(findElementOrNull(result, EventTabContent)).toBeNull()
    expect(findElementOrNull(result, HackathonPreviewClient)).toBeNull()
  })
})
