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
} from "lucide-react"
import {
  SCENARIOS,
  CATEGORY_LABELS,
  type ScenarioCategory,
  type ScenarioDef,
} from "@/lib/dev/scenarios"

export type CommandCategory =
  | "scenario"
  | "persona"
  | "role"
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
  run: () => void | Promise<void>
}

export const CATEGORY_ORDER: CommandCategory[] = [
  "scenario",
  "persona",
  "role",
  "event",
  "settings",
]

export const CATEGORY_HEADERS: Record<CommandCategory, string> = {
  scenario: "Jump to state",
  persona: "Switch persona",
  role: "Assign role (this event)",
  event: "Event actions",
  settings: "Settings",
}

type Persona = { key: string; name: string; configured: boolean }

export type CommandBuilderArgs = {
  eventSlug: string | null
  eventHackathonId: string | null
  eventName: string | null
  activeScenarios: { scenarioName: string; slug: string }[]
  personas: Persona[]
  currentRoles: string[]
  onRunScenario: (scenario: ScenarioDef) => void | Promise<void>
  onSwitchPersona: (persona: Persona) => void | Promise<void>
  onAssignRole: (role: string) => void | Promise<void>
  onRemoveRole: (role: string) => void | Promise<void>
  onOpenSettings: () => void
  onOpenEventLifecycle: () => void
  onOpenEventSeed: () => void
  onOpenEventResults: () => void
}

const ROLE_OPTIONS = [
  { role: "participant", label: "Participant" },
  { role: "judge", label: "Judge" },
  { role: "organizer", label: "Organizer" },
  { role: "mentor", label: "Mentor" },
]

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

  if (args.eventHackathonId) {
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

    commands.push(
      {
        id: "event:lifecycle",
        title: "Event lifecycle",
        subtitle: "Change status, phase, or timeline",
        icon: GitBranch,
        category: "event",
        keywords: "status phase timeline transitions draft active judging",
        run: args.onOpenEventLifecycle,
      },
      {
        id: "event:seed",
        title: "Event seed data",
        subtitle: "Add teams, submissions, criteria, prizes",
        icon: Database,
        category: "event",
        keywords: "seed teams submissions criteria prizes populate",
        run: args.onOpenEventSeed,
      },
      {
        id: "event:results",
        title: "Event results",
        subtitle: "Publish results, manage winners",
        icon: Trophy,
        category: "event",
        keywords: "results winners publish prize claim",
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
  event: GitBranch,
  settings: Settings,
}
