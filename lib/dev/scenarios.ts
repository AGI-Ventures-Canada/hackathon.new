export type ScenarioCategory = "lifecycle" | "judging" | "results" | "attendee"
export type ScenarioPersona = "organizer" | "participant" | "judge"

export type ScenarioDef = {
  name: string
  label: string
  description: string
  category: ScenarioCategory
  defaultPersona: ScenarioPersona
  defaultRoute: (slug: string) => string
}

export const SCENARIOS: ScenarioDef[] = [
  {
    name: "pre-registration",
    label: "Pre-Registration",
    description: "Hackathon not yet open (opens tomorrow)",
    category: "lifecycle",
    defaultPersona: "organizer",
    defaultRoute: (s) => `/e/${s}/manage`,
  },
  {
    name: "registered-no-team",
    label: "Registered (No Team)",
    description: "Registered, no team yet",
    category: "lifecycle",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "team-formed",
    label: "Team Formed",
    description: "Captain with 2 members + 1 invite",
    category: "lifecycle",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "submitted",
    label: "Project Submitted",
    description: "Team has a submitted project",
    category: "lifecycle",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "judging",
    label: "Judging (Fresh)",
    description: "5 teams, 3 judges, no scores",
    category: "judging",
    defaultPersona: "judge",
    defaultRoute: (s) => `/e/${s}/judge`,
  },
  {
    name: "judging-in-progress",
    label: "Judging (60% Scored)",
    description: "~60% of assignments scored",
    category: "judging",
    defaultPersona: "judge",
    defaultRoute: (s) => `/e/${s}/judge`,
  },
  {
    name: "results-ready",
    label: "Results Ready",
    description: "All scored, results calculated, 3 prizes",
    category: "results",
    defaultPersona: "organizer",
    defaultRoute: (s) => `/e/${s}/manage`,
  },
  {
    name: "attendee-captain-pending-invite",
    label: "Captain w/ pending invite",
    description: "Captain with a pending invite to an unknown email",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-invite-expired",
    label: "Invite expired",
    description: "Captain has an invite that expired 8 days ago",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-invite-declined",
    label: "Invite declined",
    description: "Captain has a declined invite record",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-team-at-capacity",
    label: "Team at capacity",
    description: "Captain of a max-size team with an extra pending invite",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-invited-to-team",
    label: "Invited to team",
    description: "Dev user has a pending invite from another captain",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-solo-submitted",
    label: "Solo submitted",
    description: "Dev user registered solo and submitted",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-submitted-then-left",
    label: "Submitted, then left team",
    description: "Dev user submitted, then left team (others remain)",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-announcements-audiences",
    label: "Announcements per audience",
    description: "7 announcements, one per audience enum value",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-perks-mixed",
    label: "Perks (mixed visibility)",
    description: "Released, scheduled-future, and hidden perks",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}`,
  },
  {
    name: "attendee-winner-pending-claim",
    label: "Winner pending claim",
    description: "Results published, dev user's team won 1st place",
    category: "attendee",
    defaultPersona: "participant",
    defaultRoute: (s) => `/e/${s}/winners`,
  },
]

export const SCENARIO_NAMES = SCENARIOS.map((s) => s.name)

export function getScenario(name: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.name === name)
}

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  lifecycle: "Lifecycle",
  judging: "Judging",
  results: "Results",
  attendee: "Attendee journeys",
}
