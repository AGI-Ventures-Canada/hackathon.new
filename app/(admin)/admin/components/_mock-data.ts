import type {
  Hackathon,
  HackathonJudgeDisplay,
  HackathonSponsor,
  JudgingCriteria,
  Prize,
  Submission,
  TenantProfile,
} from "@/lib/db/hackathon-types"
import type { Challenge } from "@/lib/services/challenges"
import type { Perk } from "@/lib/services/perks"
import type { ScheduleItem } from "@/lib/services/schedule-items"
import type { PublicHackathon, PublicPrize } from "@/lib/services/public-hackathons"
import type { SponsorWithTenant } from "@/lib/services/sponsors"

export const MOCK_HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
export const MOCK_TENANT_ID = "22222222-2222-2222-2222-222222222222"
export const MOCK_SLUG = "sandbox-hackathon"

const now = new Date()
const iso = (d: Date) => d.toISOString()
const addDays = (days: number) => {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  return iso(d)
}

export const mockHackathon: Hackathon = {
  id: MOCK_HACKATHON_ID,
  tenant_id: MOCK_TENANT_ID,
  name: "Sandbox Hackathon",
  slug: MOCK_SLUG,
  description:
    "A two-day build-it-all hackathon showcased in the component library. Nothing here persists.",
  rules: null,
  starts_at: addDays(14),
  ends_at: addDays(16),
  registration_opens_at: addDays(-2),
  registration_closes_at: addDays(13),
  max_participants: 200,
  min_team_size: 1,
  max_team_size: 5,
  allow_solo: true,
  status: "registration_open",
  banner_url: null,
  location_type: "hybrid",
  location_name: "Toronto, ON",
  location_url: "https://example.com/venue",
  location_latitude: 43.6532,
  location_longitude: -79.3832,
  require_location_verification: false,
  anonymous_judging: false,
  judging_mode: "rubric",
  results_published_at: null,
  winner_emails_sent_at: null,
  results_announcement_sent_at: null,
  feedback_survey_sent_at: null,
  feedback_survey_url: null,
  phase: "build",
  challenge_released_at: null,
  perks_none: false,
  community_url: "https://discord.gg/example",
  community_label: "Discord",
  require_terms_acceptance: false,
  terms_content: null,
  translations: null,
  default_locale: null,
  metadata: {},
  created_at: iso(now),
  updated_at: iso(now),
}

export const mockOrganizer: Pick<
  TenantProfile,
  "id" | "name" | "slug" | "logo_url" | "logo_url_dark" | "clerk_org_id" | "clerk_user_id"
> = {
  id: MOCK_TENANT_ID,
  name: "Sandbox Org",
  slug: "sandbox-org",
  logo_url: null,
  logo_url_dark: null,
  clerk_org_id: null,
  clerk_user_id: null,
}

export const mockPrizes: Prize[] = [
  {
    id: "prize-1",
    hackathon_id: MOCK_HACKATHON_ID,
    name: "Grand prize",
    description: "For the project with the strongest overall build",
    value: "$5,000",
    type: "score",
    rank: 1,
    kind: "cash",
    monetary_value: 5000,
    currency: "USD",
    distribution_method: "bank",
    display_value: "$5,000",
    criteria_id: null,
    prize_track_id: null,
    judging_style: "judges_pick",
    round_id: null,
    assignment_mode: "organizer_assigned",
    max_picks: 1,
    is_screening: false,
    allowed_team_modes: null,
    display_order: 0,
    created_at: iso(now),
    updated_at: iso(now),
  },
  {
    id: "prize-2",
    hackathon_id: MOCK_HACKATHON_ID,
    name: "Crowd favorite",
    description: "Voted on by everyone at the event",
    value: "$500",
    type: "crowd",
    rank: null,
    kind: "cash",
    monetary_value: 500,
    currency: "USD",
    distribution_method: "bank",
    display_value: "$500",
    criteria_id: null,
    prize_track_id: null,
    judging_style: "crowd_vote",
    round_id: null,
    assignment_mode: "organizer_assigned",
    max_picks: 1,
    is_screening: false,
    allowed_team_modes: null,
    display_order: 1,
    created_at: iso(now),
    updated_at: iso(now),
  },
]

export const mockPublicPrizes = mockPrizes.map(({
  distribution_method: _distributionMethod,
  monetary_value: _monetaryValue,
  currency: _currency,
  ...rest
}) => rest) satisfies PublicPrize[]

export const mockCriteria: JudgingCriteria[] = [
  {
    id: "crit-1",
    hackathon_id: MOCK_HACKATHON_ID,
    name: "Impact",
    description: "How much does this move the needle?",
    max_score: 10,
    weight: 1,
    category: "core",
    display_order: 0,
    created_at: iso(now),
    updated_at: iso(now),
  },
  {
    id: "crit-2",
    hackathon_id: MOCK_HACKATHON_ID,
    name: "Craft",
    description: "How well is it built?",
    max_score: 10,
    weight: 1,
    category: "core",
    display_order: 1,
    created_at: iso(now),
    updated_at: iso(now),
  },
]

export const mockSponsors: SponsorWithTenant[] = [
  {
    id: "sponsor-1",
    hackathon_id: MOCK_HACKATHON_ID,
    sponsor_tenant_id: null,
    tenant_sponsor_id: null,
    use_org_assets: false,
    name: "Acme Robotics",
    logo_url: null,
    logo_url_dark: null,
    website_url: "https://acme.example",
    tier: "gold",
    custom_tier_label: null,
    display_order: 0,
    created_at: iso(now),
    tenant: null,
  },
  {
    id: "sponsor-2",
    hackathon_id: MOCK_HACKATHON_ID,
    sponsor_tenant_id: null,
    tenant_sponsor_id: null,
    use_org_assets: false,
    name: "Lorem Labs",
    logo_url: null,
    logo_url_dark: null,
    website_url: "https://lorem.example",
    tier: "silver",
    custom_tier_label: null,
    display_order: 1,
    created_at: iso(now),
    tenant: null,
  },
]

export const mockRawSponsors: HackathonSponsor[] = mockSponsors.map(({ tenant: _t, ...rest }) => rest)

export const mockJudges: HackathonJudgeDisplay[] = [
  {
    id: "judge-1",
    hackathon_id: MOCK_HACKATHON_ID,
    name: "Priya Patel",
    title: "Principal Engineer",
    organization: "Acme Robotics",
    headshot_url: null,
    clerk_user_id: null,
    participant_id: "participant-judge-1",
    display_order: 0,
    created_at: iso(now),
    updated_at: iso(now),
  },
  {
    id: "judge-2",
    hackathon_id: MOCK_HACKATHON_ID,
    name: "Marcus Lee",
    title: "Head of Product",
    organization: "Lorem Labs",
    headshot_url: null,
    clerk_user_id: null,
    participant_id: "participant-judge-2",
    display_order: 1,
    created_at: iso(now),
    updated_at: iso(now),
  },
]

export const mockChallenges: Challenge[] = [
  {
    id: "challenge-1",
    hackathonId: MOCK_HACKATHON_ID,
    title: "Best AI agent",
    description: "Build the most useful agent we've seen.",
    resources: [{ label: "Starter kit", url: "https://example.com/starter" }],
    sortOrder: 0,
    createdAt: iso(now),
    updatedAt: iso(now),
  },
  {
    id: "challenge-2",
    hackathonId: MOCK_HACKATHON_ID,
    title: "Delightful UX",
    description: "Ship something that feels effortless.",
    resources: [],
    sortOrder: 1,
    createdAt: iso(now),
    updatedAt: iso(now),
  },
]

export const mockPerks: Perk[] = [
  {
    id: "perk-1",
    hackathonId: MOCK_HACKATHON_ID,
    sponsorId: "sponsor-1",
    name: "Acme API credits",
    description: "$500 in API credits for hackers",
    type: "credit",
    code: "ACME-HACK-2026",
    redemptionUrl: "https://acme.example/redeem",
    instructions: "Paste the code at checkout.",
    scheduledReleaseAt: null,
    releasedAt: iso(now),
    sortOrder: 0,
    createdAt: iso(now),
    updatedAt: iso(now),
  },
]

export const mockScheduleItems: ScheduleItem[] = [
  {
    id: "schedule-1",
    hackathon_id: MOCK_HACKATHON_ID,
    title: "Opening ceremony",
    description: "Welcome and rules walkthrough.",
    starts_at: addDays(14),
    ends_at: null,
    location: null,
    sort_order: 0,
    trigger_type: null,
    linked_to: "event_start",
    created_at: iso(now),
    updated_at: iso(now),
  },
  {
    id: "schedule-2",
    hackathon_id: MOCK_HACKATHON_ID,
    title: "Challenge drop",
    description: "Challenges go live.",
    starts_at: addDays(14),
    ends_at: null,
    location: null,
    sort_order: 1,
    trigger_type: "challenge_release",
    linked_to: null,
    created_at: iso(now),
    updated_at: iso(now),
  },
  {
    id: "schedule-3",
    hackathon_id: MOCK_HACKATHON_ID,
    title: "Submission deadline",
    description: "Projects must be submitted.",
    starts_at: addDays(16),
    ends_at: null,
    location: null,
    sort_order: 2,
    trigger_type: "submission_deadline",
    linked_to: "event_end",
    created_at: iso(now),
    updated_at: iso(now),
  },
]

export const mockSubmissions: Submission[] = [
  {
    id: "submission-1",
    hackathon_id: MOCK_HACKATHON_ID,
    participant_id: null,
    team_id: "team-1",
    title: "Loopback",
    description: "A tool that replays your day so you can debug your habits.",
    github_url: "https://github.com/example/loopback",
    live_app_url: "https://loopback.example",
    demo_video_url: null,
    screenshot_url: null,
    status: "submitted",
    metadata: {},
    created_at: iso(now),
    updated_at: iso(now),
  },
  {
    id: "submission-2",
    hackathon_id: MOCK_HACKATHON_ID,
    participant_id: null,
    team_id: "team-2",
    title: "Oatbot",
    description: "An agent that helps you plan your next hackathon.",
    github_url: "https://github.com/example/oatbot",
    live_app_url: null,
    demo_video_url: null,
    screenshot_url: null,
    status: "submitted",
    metadata: {},
    created_at: iso(now),
    updated_at: iso(now),
  },
]

export const mockPublicHackathon: PublicHackathon = {
  ...mockHackathon,
  organizer: mockOrganizer,
  sponsors: mockSponsors,
  judges: mockJudges,
  prizes: mockPublicPrizes,
  terms_hash: null,
}

export interface ShowcaseData {
  hackathon: Hackathon
  publicHackathon: PublicHackathon
  organizer: typeof mockOrganizer
  prizes: Prize[]
  publicPrizes: PublicPrize[]
  criteria: JudgingCriteria[]
  sponsors: SponsorWithTenant[]
  rawSponsors: HackathonSponsor[]
  judges: HackathonJudgeDisplay[]
  challenges: Challenge[]
  perks: Perk[]
  scheduleItems: ScheduleItem[]
  submissions: Submission[]
  isLive: boolean
}

export const mockShowcaseData: ShowcaseData = {
  hackathon: mockHackathon,
  publicHackathon: mockPublicHackathon,
  organizer: mockOrganizer,
  prizes: mockPrizes,
  publicPrizes: mockPublicPrizes,
  criteria: mockCriteria,
  sponsors: mockSponsors,
  rawSponsors: mockRawSponsors,
  judges: mockJudges,
  challenges: mockChallenges,
  perks: mockPerks,
  scheduleItems: mockScheduleItems,
  submissions: mockSubmissions,
  isLive: false,
}
