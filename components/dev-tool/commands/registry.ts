import type { LucideIcon } from "lucide-react"
import {
  Beaker,
  UserCircle2,
  UserPlus,
  GitBranch,
  Database,
  Trophy,
  Settings,
  Rocket,
  UserMinus,
  Clock,
  Users,
  FileText,
  Gavel,
  Zap,
  Award,
  Tags,
  DoorOpen,
  MessageCircle,
  Share2,
  Calculator,
  Send,
  Trash2,
  Workflow,
  RefreshCw,
} from "lucide-react"
import {
  SCENARIOS,
  CATEGORY_LABELS,
  type ScenarioCategory,
  type ScenarioDef,
} from "@/lib/dev/scenarios"
import type { SeedStatus } from "../tabs/event-shared"
import type { EventActionRunner } from "../use-event-actions"

export type CommandCategory =
  | "scenario"
  | "persona"
  | "role"
  | "lifecycle"
  | "seed"
  | "results"
  | "event"
  | "settings"

export type DevCommand = {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  category: CommandCategory
  keywords?: string
  badge?: string
  disabled?: boolean
  run: () => void | Promise<unknown>
}

export const CATEGORY_ORDER: CommandCategory[] = [
  "scenario",
  "persona",
  "role",
  "lifecycle",
  "seed",
  "results",
  "event",
  "settings",
]

export const CATEGORY_HEADERS: Record<CommandCategory, string> = {
  scenario: "Jump to state",
  persona: "Switch persona",
  role: "Assign role (this event)",
  lifecycle: "Change status / phase / timeline",
  seed: "Seed data",
  results: "Results",
  event: "Event sub-views",
  settings: "Settings",
}

type Persona = { key: string; name: string; configured: boolean }

const STATUS_OPTIONS = [
  { status: "draft", label: "Draft" },
  { status: "published", label: "Published" },
  { status: "registration_open", label: "Registration Open" },
  { status: "active", label: "Active" },
  { status: "judging", label: "Judging" },
  { status: "completed", label: "Completed" },
  { status: "archived", label: "Archived" },
] as const

const PHASE_OPTIONS = [
  { phase: null, label: "No phase" },
  { phase: "build", label: "Build" },
  { phase: "submission_open", label: "Submission Open" },
  { phase: "preliminaries", label: "Preliminaries" },
  { phase: "finals", label: "Finals" },
  { phase: "results_pending", label: "Results Pending" },
] as const

const TIMELINE_PRESETS = [
  { label: "Started 2h ago, ends in 6h", startsAt: -2, endsAt: 6 },
  { label: "Started 1h ago, ends in 30m", startsAt: -1, endsAt: 0.5 },
  { label: "Starts in 1h, ends in 24h", startsAt: 1, endsAt: 24 },
  { label: "Ended 1h ago", startsAt: -8, endsAt: -1 },
] as const

const PRIZE_TRACK_PRESETS = [
  { key: "standard", label: "Standard prize tracks", desc: "3 tracks: Grand Prize, Most Innovative, People's Choice" },
  { key: "sponsor_heavy", label: "Sponsor-heavy prize tracks", desc: "5 tracks: Grand Prize + 3 sponsor prizes + Crowd Favorite" },
  { key: "multi_round", label: "Multi-round prize tracks", desc: "3 tracks: Gate Check, Head-to-Head, Crowd Vote" },
  { key: "minimal", label: "Minimal prize tracks", desc: "1 track: single winner, bucket sort" },
  { key: "kitchen_sink", label: "Kitchen sink prize tracks", desc: "7 tracks: every judging style represented" },
] as const

const ROLE_OPTIONS = [
  { role: "participant", label: "Participant" },
  { role: "judge", label: "Judge" },
  { role: "organizer", label: "Organizer" },
  { role: "mentor", label: "Mentor" },
] as const

export type CommandBuilderArgs = {
  eventSlug: string | null
  eventHackathonId: string | null
  eventName: string | null
  eventStatus: string | null
  eventPhase: string | null
  eventSeedStatus: SeedStatus | null
  activeScenarios: { scenarioName: string; slug: string }[]
  personas: Persona[]
  currentRoles: string[]
  onRunScenario: (scenario: ScenarioDef) => void | Promise<void>
  onSwitchPersona: (persona: Persona) => void | Promise<void>
  onAssignRole: (role: string) => void | Promise<void>
  onRemoveRole: (role: string) => void | Promise<void>
  onEventAction: EventActionRunner | null
  onProcessAutoTransitions: () => void | Promise<void>
  onOpenSettings: () => void
  onOpenEventLifecycle: () => void
  onOpenEventSeed: () => void
  onOpenEventResults: () => void
}

export function buildCommands(args: CommandBuilderArgs): DevCommand[] {
  const commands: DevCommand[] = []

  const scenariosByCategory = groupByCategory(SCENARIOS)
  for (const cat of Object.keys(scenariosByCategory) as ScenarioCategory[]) {
    for (const scenario of scenariosByCategory[cat]) {
      const active = args.activeScenarios.find(
        (a) => a.scenarioName === scenario.name
      )
      commands.push({
        id: `scenario:${scenario.name}`,
        title: scenario.label,
        subtitle: scenario.description,
        icon: Rocket,
        category: "scenario",
        keywords: [
          scenario.name,
          CATEGORY_LABELS[cat],
          scenario.description,
          scenario.defaultPersona,
        ].join(" "),
        badge: active ? "seeded" : undefined,
        run: () => args.onRunScenario(scenario),
      })
    }
  }

  for (const persona of args.personas) {
    commands.push({
      id: `persona:${persona.key}`,
      title: persona.name,
      subtitle: `Sign in as ${persona.key}`,
      icon: UserCircle2,
      category: "persona",
      keywords: [persona.key, persona.name, "switch user"].join(" "),
      run: () => args.onSwitchPersona(persona),
    })
  }

  if (args.eventHackathonId && args.onEventAction) {
    for (const { role, label } of ROLE_OPTIONS) {
      const active = args.currentRoles.includes(role)
      commands.push({
        id: `role:${role}`,
        title: active ? `Remove "${label}" role` : `Assign "${label}" role`,
        subtitle: active
          ? `You currently have the ${label.toLowerCase()} role`
          : `Give yourself the ${label.toLowerCase()} role on this event`,
        icon: active ? UserMinus : UserPlus,
        category: "role",
        keywords: `${role} ${label} assign remove`,
        badge: active ? "on" : undefined,
        run: () =>
          active ? args.onRemoveRole(role) : args.onAssignRole(role),
      })
    }

    for (const { status, label } of STATUS_OPTIONS) {
      const current = status === args.eventStatus
      commands.push({
        id: `status:${status}`,
        title: `Switch status to ${label}`,
        subtitle: current ? "Current status" : `Set event status to ${label.toLowerCase()}`,
        icon: GitBranch,
        category: "lifecycle",
        keywords: `status ${status} ${label} transition lifecycle`,
        badge: current ? "now" : undefined,
        disabled: current,
        run: () => {
          if (current) return
          return args.onEventAction!("/status", "PATCH", { status })
        },
      })
    }

    for (const { phase, label } of PHASE_OPTIONS) {
      const current = (phase ?? null) === (args.eventPhase ?? null)
      const phaseKey = phase ?? "none"
      commands.push({
        id: `phase:${phaseKey}`,
        title: `Set phase: ${label}`,
        subtitle: current ? "Current phase" : undefined,
        icon: GitBranch,
        category: "lifecycle",
        keywords: `phase ${phaseKey} ${label}`,
        badge: current ? "now" : undefined,
        disabled: current,
        run: () => {
          if (current) return
          return args.onEventAction!("/phase", "PATCH", { phase })
        },
      })
    }

    for (const preset of TIMELINE_PRESETS) {
      commands.push({
        id: `timeline:${preset.label}`,
        title: preset.label,
        subtitle: "Set event timeline",
        icon: Clock,
        category: "lifecycle",
        keywords: `timeline ${preset.label} starts ends simulated`,
        run: () => {
          const now = Date.now()
          return args.onEventAction!("/timeline", "PATCH", {
            startsAt: new Date(now + preset.startsAt * 3600000).toISOString(),
            endsAt: new Date(now + preset.endsAt * 3600000).toISOString(),
            registrationOpensAt: new Date(now - 7 * 86400000).toISOString(),
            registrationClosesAt: new Date(
              now + preset.startsAt * 3600000
            ).toISOString(),
          })
        },
      })
    }

    commands.push({
      id: "lifecycle:auto-transitions",
      title: "Process auto-transitions",
      subtitle: "Fire any overdue timeline-based transitions",
      icon: RefreshCw,
      category: "lifecycle",
      keywords: "cron auto transitions overdue timeline",
      run: args.onProcessAutoTransitions,
    })

    const seedStatus = args.eventSeedStatus
    const hasTeams = (seedStatus?.teams ?? 0) > 0
    const hasSubmissions = (seedStatus?.submissions ?? 0) > 0
    const hasJudging =
      (seedStatus?.criteria ?? 0) > 0 && (seedStatus?.assignments ?? 0) > 0

    commands.push(
      {
        id: "seed:all",
        title: "Seed full pipeline",
        subtitle: "Teams, submissions, judging, prizes, rooms",
        icon: Zap,
        category: "seed",
        keywords: "seed full pipeline everything populate demo",
        run: () => args.onEventAction!("/seed-all"),
      },
      {
        id: "seed:teams",
        title: "Seed 5 teams",
        subtitle:
          seedStatus && seedStatus.teams > 0
            ? `${seedStatus.teams} teams already seeded`
            : "Create 5 test teams",
        icon: Users,
        category: "seed",
        keywords: "seed teams participants",
        badge: seedStatus && seedStatus.teams > 0 ? `${seedStatus.teams}` : undefined,
        run: () => args.onEventAction!("/seed-teams", "POST", { count: 5 }),
      },
      {
        id: "seed:submissions",
        title: "Seed submissions",
        subtitle: hasTeams
          ? "One submission per team"
          : "Needs teams first",
        icon: FileText,
        category: "seed",
        keywords: "seed submissions projects",
        badge:
          seedStatus && seedStatus.submissions > 0
            ? `${seedStatus.submissions}`
            : undefined,
        disabled: !hasTeams,
        run: () => args.onEventAction!("/seed-submissions"),
      },
      {
        id: "seed:judging",
        title: "Seed judging setup",
        subtitle: hasSubmissions
          ? "3 criteria, 3 judges, assign all"
          : "Needs submissions first",
        icon: Gavel,
        category: "seed",
        keywords: "seed judging criteria judges assignments",
        badge:
          seedStatus && seedStatus.assignments > 0
            ? `${seedStatus.assignments}`
            : undefined,
        disabled: !hasSubmissions,
        run: () => args.onEventAction!("/seed-judging"),
      },
      {
        id: "seed:scores-60",
        title: "Seed scores (60%)",
        subtitle: hasJudging ? "Partial scoring" : "Needs judging first",
        icon: Trophy,
        category: "seed",
        keywords: "seed scores partial judging 60 percent",
        disabled: !hasJudging,
        run: () =>
          args.onEventAction!("/seed-scores", "POST", { percentage: 60 }),
      },
      {
        id: "seed:scores-100",
        title: "Seed scores (100%)",
        subtitle: hasJudging ? "Full scoring" : "Needs judging first",
        icon: Trophy,
        category: "seed",
        keywords: "seed scores full complete 100 percent",
        disabled: !hasJudging,
        run: () =>
          args.onEventAction!("/seed-scores", "POST", { percentage: 100 }),
      }
    )

    for (const preset of PRIZE_TRACK_PRESETS) {
      commands.push({
        id: `seed:tracks:${preset.key}`,
        title: preset.label,
        subtitle: preset.desc,
        icon: Workflow,
        category: "seed",
        keywords: `seed prize tracks ${preset.key} ${preset.label}`,
        run: () =>
          args.onEventAction!("/seed-prizes", "POST", {
            preset: preset.key,
            assignJudges: hasJudging,
            scorePercentage: 0,
          }),
      })
    }

    commands.push(
      {
        id: "seed:challenge",
        title: "Seed challenge",
        subtitle: seedStatus?.challengeReleased
          ? "Challenge already released"
          : "Release a sample challenge",
        icon: FileText,
        category: "seed",
        keywords: "seed challenge release",
        run: () => args.onEventAction!("/seed-challenge"),
      },
      {
        id: "seed:prizes-3",
        title: "Seed 3 prizes",
        subtitle: "Add standalone prizes",
        icon: Award,
        category: "seed",
        keywords: "seed prizes awards",
        badge:
          seedStatus && seedStatus.prizes > 0
            ? `${seedStatus.prizes}`
            : undefined,
        run: () => args.onEventAction!("/seed-prizes"),
      },
      {
        id: "seed:categories",
        title: "Seed 3 categories",
        subtitle: "Add project categories",
        icon: Tags,
        category: "seed",
        keywords: "seed categories tags",
        badge:
          seedStatus && seedStatus.categories > 0
            ? `${seedStatus.categories}`
            : undefined,
        run: () => args.onEventAction!("/seed-categories"),
      },
      {
        id: "seed:rooms",
        title: "Seed 3 rooms",
        subtitle: "Rooms with team assignments",
        icon: DoorOpen,
        category: "seed",
        keywords: "seed rooms venues",
        badge:
          seedStatus && seedStatus.rooms > 0 ? `${seedStatus.rooms}` : undefined,
        run: () =>
          args.onEventAction!("/seed-rooms", "POST", {
            count: 3,
            assignTeams: true,
          }),
      },
      {
        id: "seed:mentors",
        title: "Seed mentor requests",
        subtitle: "Populate mentor queue",
        icon: MessageCircle,
        category: "seed",
        keywords: "seed mentors requests",
        badge:
          seedStatus && seedStatus.mentorRequests > 0
            ? `${seedStatus.mentorRequests}`
            : undefined,
        run: () => args.onEventAction!("/seed-mentors"),
      },
      {
        id: "seed:social",
        title: "Seed social posts",
        subtitle: "Add sample team social posts",
        icon: Share2,
        category: "seed",
        keywords: "seed social posts",
        run: () => args.onEventAction!("/seed-social"),
      },
      {
        id: "seed:clear",
        title: "Clear all seed data",
        subtitle: "Delete all SEED_USERS data for this event",
        icon: Trash2,
        category: "seed",
        keywords: "clear reset delete seed data wipe",
        run: () => args.onEventAction!("/seed-data", "DELETE"),
      }
    )

    commands.push(
      {
        id: "results:calculate",
        title: "Calculate results",
        subtitle: (seedStatus?.scoredAssignments ?? 0) > 0
          ? "Aggregate scores and rank submissions"
          : "Needs scores first",
        icon: Calculator,
        category: "results",
        keywords: "calculate results aggregate rank",
        disabled: (seedStatus?.scoredAssignments ?? 0) === 0,
        run: () => args.onEventAction!("/calculate-results"),
      },
      {
        id: "results:publish",
        title: "Publish results",
        subtitle: seedStatus?.resultsPublished
          ? "Results already published"
          : "Make results visible and notify participants",
        icon: Send,
        category: "results",
        keywords: "publish results announce winners",
        badge: seedStatus?.resultsPublished ? "live" : undefined,
        disabled:
          !!seedStatus?.resultsPublished ||
          (seedStatus?.scoredAssignments ?? 0) === 0,
        run: () => args.onEventAction!("/publish-results"),
      }
    )

    commands.push(
      {
        id: "event:lifecycle",
        title: "Open lifecycle sub-view",
        subtitle: "Rich view with simulation + auto-transitions",
        icon: GitBranch,
        category: "event",
        keywords: "simulate lifecycle status phase timeline view",
        run: args.onOpenEventLifecycle,
      },
      {
        id: "event:seed",
        title: "Open seed sub-view",
        subtitle: "Grouped view with counts and dependency hints",
        icon: Database,
        category: "event",
        keywords: "seed data sub-view pipeline extras danger",
        run: args.onOpenEventSeed,
      },
      {
        id: "event:results",
        title: "Open results sub-view",
        subtitle: "Calculate / publish results inline",
        icon: Trophy,
        category: "event",
        keywords: "results sub-view calculate publish winners",
        run: args.onOpenEventResults,
      }
    )
  }

  commands.push({
    id: "settings:all",
    title: "Settings: Org ID, Dev User ID, Test Users",
    subtitle: "Edit Dev Tool configuration in place",
    icon: Settings,
    category: "settings",
    keywords:
      "org user config scenario_org_id scenario_dev_user_id test users env",
    run: args.onOpenSettings,
  })

  return commands
}

function groupByCategory(list: ScenarioDef[]): Record<ScenarioCategory, ScenarioDef[]> {
  const grouped = {} as Record<ScenarioCategory, ScenarioDef[]>
  for (const s of list) {
    if (!grouped[s.category]) grouped[s.category] = []
    grouped[s.category].push(s)
  }
  return grouped
}

export const ICON_BY_CATEGORY: Record<CommandCategory, LucideIcon> = {
  scenario: Beaker,
  persona: UserCircle2,
  role: UserPlus,
  lifecycle: GitBranch,
  seed: Database,
  results: Trophy,
  event: GitBranch,
  settings: Settings,
}
