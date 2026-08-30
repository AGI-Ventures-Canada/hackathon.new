import type { HackathonStatus } from "@/lib/db/hackathon-types"

export const TEST_EVENT_STAGES = [
  "registration",
  "hacking",
  "judging",
  "results",
] as const

export type TestEventStage = (typeof TEST_EVENT_STAGES)[number]

export const TEST_EVENT_NAME = "Launch Lab Test Event"

export function getTestEventCreationName(creationId: string): string {
  return `${TEST_EVENT_NAME} ${creationId}`
}

export const TEST_EVENT_STAGE_OPTIONS: ReadonlyArray<{
  value: TestEventStage
  label: string
  description: string
}> = [
  {
    value: "registration",
    label: "Registration is open",
    description: "See sign-ups, teams, sponsors, and event setup before kickoff.",
  },
  {
    value: "hacking",
    label: "Hacking is underway",
    description: "See a live event with teams building and projects coming in.",
  },
  {
    value: "judging",
    label: "Judging is underway",
    description: "See judge assignments, scores, and work still in progress.",
  },
  {
    value: "results",
    label: "Results are ready",
    description: "See a finished event with scores, winners, and follow-up work.",
  },
]

export function isTestEventStage(value: unknown): value is TestEventStage {
  return typeof value === "string" && TEST_EVENT_STAGES.includes(value as TestEventStage)
}

export function getTestEventStagePlan(stage: TestEventStage) {
  const projectCount = TEST_EVENT_PROJECTS.length
  const assignmentsPerProject = 3
  if (stage === "registration") {
    return {
      submittedProjectCount: 0,
      pendingTeamCount: 3,
      weightedAssignmentCount: 0,
      pickAssignmentCount: 0,
      assignmentCount: 0,
      scoredAssignmentCount: 0,
      resultCount: 0,
    }
  }
  if (stage === "hacking") {
    const submittedProjectCount = 8
    return {
      submittedProjectCount,
      pendingTeamCount: 3,
      weightedAssignmentCount: submittedProjectCount * assignmentsPerProject,
      pickAssignmentCount: 0,
      assignmentCount: submittedProjectCount * assignmentsPerProject,
      scoredAssignmentCount: 0,
      resultCount: 0,
    }
  }
  const assignmentCount = projectCount * assignmentsPerProject
  if (stage === "judging") {
    const pickAssignmentCount = projectCount * 2
    return {
      submittedProjectCount: projectCount,
      pendingTeamCount: 0,
      weightedAssignmentCount: assignmentCount,
      pickAssignmentCount,
      assignmentCount: assignmentCount + pickAssignmentCount,
      scoredAssignmentCount: Math.ceil(assignmentCount * 0.6),
      resultCount: 0,
    }
  }
  return {
    submittedProjectCount: projectCount,
    pendingTeamCount: 0,
    weightedAssignmentCount: assignmentCount,
    pickAssignmentCount: projectCount * 2,
    assignmentCount: assignmentCount + projectCount * 2,
    scoredAssignmentCount: assignmentCount,
    resultCount: projectCount,
  }
}

export function getTestEventTeamInviteCode(creationId: string, index: number): string {
  return `test-${creationId.replaceAll("-", "").slice(0, 20)}-${String(index + 1).padStart(2, "0")}`
}

export function normalizeTestEventTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 100) return "UTC"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
    return value
  } catch {
    return "UTC"
  }
}

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

export function getTestEventTimeline(
  stage: TestEventStage,
  now = new Date(),
  requestedTimeZone?: string,
) {
  const at = (offset: number) => new Date(now.getTime() + offset).toISOString()
  const common = {
    registrationOpensAt: at(-7 * DAY),
    timezone: normalizeTestEventTimeZone(requestedTimeZone),
  }

  if (stage === "registration") {
    return {
      ...common,
      status: "registration_open" as HackathonStatus,
      phase: null,
      startsAt: at(3 * DAY),
      endsAt: at(5 * DAY),
      registrationClosesAt: at(2 * DAY),
      challengeReleasedAt: null,
      resultsPublishedAt: null,
    }
  }

  if (stage === "hacking") {
    return {
      ...common,
      status: "active" as HackathonStatus,
      phase: "build" as const,
      startsAt: at(-6 * HOUR),
      endsAt: at(2 * DAY),
      registrationClosesAt: at(-6 * HOUR),
      challengeReleasedAt: at(-6 * HOUR),
      resultsPublishedAt: null,
    }
  }

  if (stage === "judging") {
    return {
      ...common,
      status: "judging" as HackathonStatus,
      phase: "finals" as const,
      startsAt: at(-3 * DAY),
      endsAt: at(-1 * HOUR),
      registrationClosesAt: at(-3 * DAY),
      challengeReleasedAt: at(-3 * DAY),
      resultsPublishedAt: null,
    }
  }

  return {
    ...common,
    status: "completed" as HackathonStatus,
    phase: null,
    startsAt: at(-5 * DAY),
    endsAt: at(-2 * DAY),
    registrationClosesAt: at(-5 * DAY),
    challengeReleasedAt: at(-5 * DAY),
    resultsPublishedAt: at(-1 * DAY),
  }
}

const ATTENDEE_NAMES = [
  "Avery Chen", "Jordan Patel", "Maya Thompson", "Noah Williams",
  "Sofia Garcia", "Ethan Kim", "Amara Okafor", "Leo Martin",
  "Priya Shah", "Lucas Brown", "Zoe Wilson", "Mateo Rodriguez",
  "Nina Park", "Owen Davis", "Layla Hassan", "Theo Nguyen",
  "Mia Anderson", "Kai Johnson", "Elena Rossi", "Sam Taylor",
  "Ivy Zhang", "Finn Murphy", "Aisha Rahman", "Max Dubois",
  "Chloe Evans", "Arjun Singh", "Lina Costa", "Ben Miller",
  "Sara Ibrahim", "Hugo Silva", "Emma Clark", "Daniel Lee",
  "Grace Young", "Julian Baker", "Fatima Ali", "Alex Morgan",
]

function seedId(name: string, index: number, role: "attendee" | "judge") {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  return `seed_user_sandbox_${role}_${slug}_${String(index + 1).padStart(2, "0")}`
}

export const TEST_EVENT_ATTENDEES = ATTENDEE_NAMES.map((name, index) => ({
  name,
  clerkUserId: seedId(name, index, "attendee"),
}))

export const TEST_EVENT_JUDGES = [
  { name: "Dr. Rowan Brooks", title: "AI Research Lead", organization: "Northstar Labs" },
  { name: "Camila Torres", title: "Product Director", organization: "Launchworks" },
  { name: "Marcus Green", title: "Engineering Manager", organization: "Cloud Harbor" },
  { name: "Yuki Tanaka", title: "Founder", organization: "Bright Path" },
  { name: "Riley Adams", title: "Design Lead", organization: "Pattern Studio" },
  { name: "Leila Mensah", title: "Investor", organization: "Seedline Ventures" },
].map((judge, index) => ({
  ...judge,
  clerkUserId: seedId(judge.name, index, "judge"),
}))

export const TEST_EVENT_TEAMS = [
  "Signal Forge", "Green Orbit", "Care Compass", "Civic Spark",
  "Pixel Pantry", "Open Atlas", "Clear Route", "Kindred Code",
  "Northwind", "Tiny Giants", "Daybreak Labs", "Common Thread",
] as const

export const TEST_EVENT_PROJECTS = [
  { title: "Signal Scout", description: "Finds the most useful updates in a noisy team chat." },
  { title: "WasteLess", description: "Helps restaurants share extra food before it is thrown away." },
  { title: "Care Notes", description: "Turns visit notes into a simple follow-up checklist." },
  { title: "Permit Pal", description: "Explains city permits in plain language and tracks next steps." },
  { title: "Shelf Sense", description: "Helps small stores plan stock with simple demand forecasts." },
  { title: "Open Trail", description: "Builds accessible trip plans from public transit data." },
  { title: "Route Ready", description: "Plans safer delivery routes when roads or weather change." },
  { title: "Study Circle", description: "Matches learners into small study groups and shared goals." },
  { title: "Grid Watch", description: "Shows buildings where energy use can be lowered first." },
  { title: "Quiet Coach", description: "Turns a big goal into short daily practice sessions." },
  { title: "Morning Brief", description: "Makes a verified daily briefing for local community teams." },
  { title: "Skill Swap", description: "Helps neighbors trade useful skills without spending money." },
] as const

export const TEST_EVENT_SPONSORS = [
  { name: "Northstar Cloud", tier: "custom", customTierLabel: "Title", websiteUrl: "https://example.com/northstar" },
  { name: "Bright Path AI", tier: "gold", customTierLabel: null, websiteUrl: "https://example.com/bright-path" },
  { name: "Launchworks", tier: "gold", customTierLabel: null, websiteUrl: "https://example.com/launchworks" },
  { name: "Pattern Studio", tier: "silver", customTierLabel: null, websiteUrl: "https://example.com/pattern" },
  { name: "Community Tech Fund", tier: "bronze", customTierLabel: null, websiteUrl: "https://example.com/community-tech" },
] as const

export const TEST_EVENT_CHALLENGES = [
  {
    title: "Make everyday work easier",
    description: "Build a tool that saves people time on a task they repeat every week.",
    resources: [
      { label: "Starter data", url: "https://example.com/resources/starter-data" },
      { label: "API guide", url: "https://example.com/resources/api-guide" },
    ],
  },
  {
    title: "Help a local community",
    description: "Build something that helps a school, nonprofit, or neighborhood group.",
    resources: [
      { label: "Community brief", url: "https://example.com/resources/community-brief" },
      { label: "Open city data", url: "https://example.com/resources/city-data" },
    ],
  },
  {
    title: "Build for everyone",
    description: "Make a product that works well for people with different needs and devices.",
    resources: [
      { label: "Accessibility checklist", url: "https://example.com/resources/accessibility" },
      { label: "Testing guide", url: "https://example.com/resources/testing" },
    ],
  },
] as const

export const TEST_EVENT_CRITERIA = [
  { name: "Problem and impact", description: "The team chose a real problem and shows who it helps.", weight: 30 },
  { name: "Working product", description: "The demo works and the main path is easy to follow.", weight: 30 },
  { name: "Original idea", description: "The project has a thoughtful or fresh approach.", weight: 20 },
  { name: "Clear presentation", description: "The team explains the idea, choices, and next steps well.", weight: 20 },
] as const

export const TEST_EVENT_PRIZES = [
  { name: "Grand Prize", description: "Best project across the full scorecard.", value: "$10,000", type: "score", kind: "cash", rank: 1, judgingStyle: "weighted_score" },
  { name: "Runner-up", description: "Second-highest project across the full scorecard.", value: "$5,000", type: "score", kind: "cash", rank: 2, judgingStyle: "weighted_score" },
  { name: "Best Community Impact", description: "The project with the clearest benefit for people.", value: "$2,500", type: "criteria", kind: "cash", rank: null, judgingStyle: "judges_pick" },
  { name: "Best Design", description: "The easiest and most welcoming product to use.", value: "Design support", type: "criteria", kind: "service", rank: null, judgingStyle: "judges_pick" },
  { name: "People's Choice", description: "The project picked by attendees.", value: "Team prize pack", type: "crowd", kind: "swag", rank: null, judgingStyle: "crowd_vote" },
] as const

export const TEST_EVENT_ROOMS = ["Maple Hall", "Harbor Room", "Studio One", "Demo Stage"] as const

export const TEST_EVENT_PERKS = [
  { name: "Cloud credits", description: "$100 in test cloud credits", type: "credit", code: "TEST-CLOUD-100" },
  { name: "Design review", description: "A 30-minute product review", type: "other", code: "TEST-DESIGN" },
  { name: "Deployment coupon", description: "A free test deployment upgrade", type: "coupon", code: "TEST-DEPLOY" },
  { name: "Office hours", description: "Book time with a mentor", type: "other", code: null },
] as const

export const TEST_EVENT_ANNOUNCEMENTS = [
  { title: "Welcome to Launch Lab", body: "Check the schedule, find your room, and meet your team.", priority: "normal", audience: "everyone" },
  { title: "Mentors are ready", body: "Open the help queue if your team gets stuck.", priority: "normal", audience: "attendees" },
  { title: "Project deadline reminder", body: "Save your links and submit before the deadline on the schedule.", priority: "urgent", audience: "attendees" },
] as const

export function getTestEventSchedule(
  stage: TestEventStage,
  now = new Date(),
  requestedTimeZone?: string,
) {
  const timeline = getTestEventTimeline(stage, now, requestedTimeZone)
  const start = new Date(timeline.startsAt)
  const end = new Date(timeline.endsAt)
  const at = (base: Date, hours: number) => new Date(base.getTime() + hours * HOUR).toISOString()
  return [
    { title: "Doors open and breakfast", description: "Pick up your badge and meet other builders.", startsAt: at(start, -1), endsAt: start.toISOString(), location: "Maple Hall", triggerType: null },
    { title: "Opening and challenge release", description: "Meet the team and learn what to build.", startsAt: start.toISOString(), endsAt: at(start, 0.5), location: "Demo Stage", triggerType: "challenge_release" },
    { title: "Team matching", description: "Find people with skills that fit your idea.", startsAt: at(start, 0.5), endsAt: at(start, 1.25), location: "Maple Hall", triggerType: null },
    { title: "Hacking begins", description: "Start building with your team.", startsAt: at(start, 1.25), endsAt: at(start, 1.5), location: "All rooms", triggerType: null },
    { title: "Mentor office hours", description: "Get help with product, code, or design.", startsAt: at(start, 3), endsAt: at(start, 5), location: "Harbor Room", triggerType: null },
    { title: "Midpoint check-in", description: "Share what works and what your team needs.", startsAt: at(start, 8), endsAt: at(start, 8.5), location: "Demo Stage", triggerType: null },
    { title: "Demo practice", description: "Try your pitch and get quick feedback.", startsAt: at(end, -4), endsAt: at(end, -3), location: "Studio One", triggerType: null },
    { title: "Projects are due", description: "Save your final project before this time.", startsAt: end.toISOString(), endsAt: end.toISOString(), location: null, triggerType: "submission_deadline" },
    { title: "Judging", description: "Judges review every assigned project.", startsAt: end.toISOString(), endsAt: at(end, 3), location: "Demo Stage", triggerType: null },
    { title: "Awards and closing", description: "Celebrate the teams and share what happens next.", startsAt: at(end, 3), endsAt: at(end, 4), location: "Demo Stage", triggerType: null },
  ] as const
}
