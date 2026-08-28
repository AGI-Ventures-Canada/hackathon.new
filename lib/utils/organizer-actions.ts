import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"
import {
  canPublishEventDates,
  getEventLifecycleAlerts,
} from "@/lib/utils/event-lifecycle-alerts"

export type ActionSeverity = "urgent" | "warning" | "scheduled" | "info"

export type CloseCondition =
  | { kind: "auto"; isComplete: boolean }
  | { kind: "manual" }
  | { kind: "dismiss" }
  | { kind: "transition" }

export type ActionItem = {
  id: string
  label: string
  hint?: string
  tooltip?: string
  severity: ActionSeverity
  tab?: string
  subtab?: string
  subtabKey?: string
  action?: string
  ctaLabel?: string
  close: CloseCondition
}

export const SEVERITY_GROUP_LABEL: Record<ActionSeverity, string> = {
  urgent: "BLOCKERS",
  warning: "WARNINGS",
  scheduled: "SCHEDULED",
  info: "OPTIONAL",
}

export function isCompleted(item: ActionItem): boolean {
  return item.close.kind === "auto" && item.close.isComplete
}

export function isTransition(item: ActionItem): boolean {
  return item.close.kind === "transition"
}

const ACTIONS_ALLOWED_WITHOUT_TARGET = new Set([
  "confirm-promote",
  "open-agenda-dialog",
  "open-showcase-dialog",
])

export function actionItemRequiresTarget(item: ActionItem): boolean {
  if (!item.action) return false
  if (item.action.startsWith("transition-to-")) return false
  return !ACTIONS_ALLOWED_WITHOUT_TARGET.has(item.action)
}

export function validateActionItemTargets(items: ActionItem[]): string[] {
  return items
    .filter((item) => actionItemRequiresTarget(item) && !item.tab)
    .map((item) => item.id)
}

type SharedFields = {
  id: string
  severity: ActionSeverity
  tab?: string
  subtab?: string
  subtabKey?: string
  action?: string
  ctaLabel?: string
  tooltip?: string
}

type LabeledState = {
  label: string
  hint: string
}

function autoAction(args: SharedFields & {
  isComplete: boolean
  pending: LabeledState
  completed: LabeledState
}): ActionItem {
  const { isComplete, pending, completed, ctaLabel, ...shared } = args
  const state = isComplete ? completed : pending
  return {
    ...shared,
    label: state.label,
    hint: state.hint,
    ctaLabel: isComplete ? undefined : ctaLabel,
    close: { kind: "auto", isComplete },
  }
}

function manualAction(args: SharedFields & LabeledState): ActionItem {
  const { label, hint, ...shared } = args
  return {
    ...shared,
    label,
    hint,
    close: { kind: "manual" },
  }
}

function dismissAction(args: SharedFields & LabeledState): ActionItem {
  const { label, hint, ...shared } = args
  return {
    ...shared,
    label,
    hint,
    close: { kind: "dismiss" },
  }
}

function transitionAction(args: SharedFields & LabeledState): ActionItem {
  const { label, hint, ...shared } = args
  return {
    ...shared,
    label,
    hint,
    close: { kind: "transition" },
  }
}

export type ActionItemsInput = {
  status: HackathonStatus
  storedStatus?: HackathonStatus
  phase: HackathonPhase | null
  submissionCount: number
  unassignedSubmissionCount: number
  participantCount: number
  teamCount: number
  pendingTeamApprovalCount: number
  judgingProgress: { totalAssignments: number; completedAssignments: number }
  judgeCount: number
  prizeCount: number
  judgeDisplayCount: number
  mentorQueue: { open: number }
  challengeReleased: boolean
  challengeExists: boolean
  challengeReleaseTime: string | null
  resultsPublishedAt: string | null
  description: string | null
  bannerUrl: string | null
  startsAt: string | null
  endsAt: string | null
  registrationClosesAt?: string | null
  allowLateRegistration?: boolean
  locationType: "in_person" | "virtual" | "hybrid" | null
  feedbackSurveyUrl: string | null
  feedbackSurveySentAt: string | null
  pendingJudgeInvitationCount: number
  unsentInvitationEmailCount?: number
  perkCount: number
  perksNone: boolean
  rounds: { plannedCount: number; activeCount: number; completeCount: number }
  communityUrl?: string | null
  termsContent?: string | null
  judgingSetupReady?: boolean
  registrationOpensAt?: string | null
  requireLocationVerification?: boolean
  now?: string
}

const STATUS_ORDER: HackathonStatus[] = ["draft", "published", "active", "judging", "completed"]

function statusIndex(status: HackathonStatus): number {
  if (status === "registration_open") return STATUS_ORDER.indexOf("published")
  return STATUS_ORDER.indexOf(status)
}

export function getOrganizerActionItems(input: ActionItemsInput): ActionItem[] {
  const currentIdx = statusIndex(input.status)
  if (currentIdx < 0) return []

  const itemMap = new Map<string, ActionItem>()
  for (let i = 0; i <= currentIdx; i++) {
    const phaseItems: ActionItem[] = []
    const phase = STATUS_ORDER[i]
    if (phase === "draft") addDraftActions(phaseItems, input)
    else if (phase === "published") addPublishedActions(phaseItems, input)
    else if (phase === "active") addActiveActions(phaseItems, input)
    else if (phase === "judging") addJudgingActions(phaseItems, input)
    else if (phase === "completed") addCompletedActions(phaseItems, input)

    for (const item of phaseItems) {
      if (item.close.kind === "transition" && i < currentIdx) continue
      itemMap.set(item.id, item)
    }
  }

  const items = Array.from(itemMap.values())
  addLifecycleHealthActions(items, input)
  const missingTargets = validateActionItemTargets(items)
  if (missingTargets.length > 0) {
    throw new Error(
      `Action items with feature-backed actions must include target tabs: ${missingTargets.join(", ")}`
    )
  }
  return items
}

function addLifecycleHealthActions(items: ActionItem[], input: ActionItemsInput) {
  const alerts = getEventLifecycleAlerts({
    storedStatus: input.storedStatus ?? input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    registrationOpensAt: input.registrationOpensAt,
    registrationClosesAt: input.registrationClosesAt,
    requireLocationVerification: input.requireLocationVerification,
    now: input.now,
  })

  for (const alert of alerts) {
    if (alert.action === "start_event" || alert.action === "finish_event") {
      const target = alert.action === "start_event" ? "active" : "completed"
      items.push(transitionAction({
        id: `lifecycle-${alert.code}`,
        label: alert.title,
        hint: alert.message,
        severity: alert.severity === "error" ? "urgent" : "warning",
        action: `transition-to-${target}`,
        ctaLabel: alert.action === "start_event" ? "Start" : "Finish",
      }))
    } else if (alert.action === "update_location") {
      items.push(manualAction({
        id: `lifecycle-${alert.code}`,
        label: alert.title,
        hint: alert.message,
        severity: "warning",
        tab: "edit",
        action: "open-location-dialog",
        ctaLabel: "Review",
      }))
    } else {
      items.push(manualAction({
        id: `lifecycle-${alert.code}`,
        label: alert.title,
        hint: alert.message,
        severity: alert.severity === "error" ? "urgent" : "warning",
        tab: "edit",
        action: "open-dates-dialog",
        ctaLabel: "Fix",
      }))
    }
  }

  const unsentCount = input.unsentInvitationEmailCount ?? 0
  if (
    unsentCount > 0 &&
    !["completed", "archived"].includes(input.status)
  ) {
    const isDraft = (input.storedStatus ?? input.status) === "draft"
    items.push(manualAction({
      id: "unsent-invitation-emails",
      label: isDraft
        ? `${unsentCount} invite email${unsentCount === 1 ? " is" : "s are"} saved`
        : `${unsentCount} invite email${unsentCount === 1 ? " hasn't" : "s haven't"} sent`,
      hint: isDraft
        ? "They'll send when you publish. Draft events don't send invite emails."
        : "We'll keep retrying. Open the invite lists to send them again now.",
      severity: isDraft ? "warning" : "urgent",
      tab: "teams",
      ctaLabel: "Review",
    }))
  }
}

const CHALLENGE_TOOLTIP = "The challenge is the problem statement or theme that participants build around. Without it, teams won't know what to work on. You can schedule it to release at a specific time or publish it immediately."

function addChallengeActions(items: ActionItem[], input: ActionItemsInput) {
  if (input.challengeReleased) {
    items.push(autoAction({
      id: "create-challenge",
      severity: "info",
      tooltip: CHALLENGE_TOOLTIP,
      isComplete: true,
      pending: { label: "Create your challenge", hint: "Define the problem participants will solve" },
      completed: { label: "Challenge released", hint: "Participants can see the problem statement" },
    }))
    return
  }
  if (!input.challengeExists) {
    items.push(autoAction({
      id: "create-challenge",
      severity: "warning",
      tab: "challenges",
      action: "open-challenge-dialog",
      ctaLabel: "Add",
      tooltip: CHALLENGE_TOOLTIP,
      isComplete: false,
      pending: { label: "Create your challenge", hint: "Define the problem participants will solve" },
      completed: { label: "Challenge created", hint: "Now release it so participants can see it" },
    }))
  } else {
    items.push(autoAction({
      id: "create-challenge",
      severity: "info",
      tooltip: CHALLENGE_TOOLTIP,
      isComplete: true,
      pending: { label: "Create your challenge", hint: "Define the problem participants will solve" },
      completed: { label: "Challenge created", hint: "Now release it so participants can see it" },
    }))
  }
  if (input.challengeExists && input.challengeReleaseTime) {
    const time = new Date(input.challengeReleaseTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    items.push(autoAction({
      id: "release-challenge",
      severity: "scheduled",
      tab: "challenges",
      action: "release-challenge",
      ctaLabel: "Release now",
      tooltip: CHALLENGE_TOOLTIP,
      isComplete: false,
      pending: { label: `Challenge releases at ${time}`, hint: "Scheduled — click to release now instead" },
      completed: { label: "Challenge released", hint: "Participants can see the problem statement" },
    }))
  } else if (input.challengeExists) {
    items.push(autoAction({
      id: "release-challenge",
      severity: "warning",
      tab: "challenges",
      action: "release-challenge",
      ctaLabel: "Release",
      tooltip: CHALLENGE_TOOLTIP,
      isComplete: false,
      pending: { label: "Release your challenge", hint: "Make the problem statement visible to participants" },
      completed: { label: "Challenge released", hint: "Participants can see the problem statement" },
    }))
  }
}

const PERKS_TOOLTIP = "Perks are sponsor API keys, credits, or coupons that registered teams can use during the event. Add them here and they'll show up on the event page once released. If your event doesn't have any, mark it so we stop nagging you."

function addPerksAction(items: ActionItem[], input: ActionItemsInput) {
  const hasPerks = input.perkCount > 0 || input.perksNone
  const label = input.perksNone
    ? "No perks for this event"
    : input.perkCount > 0
      ? `${input.perkCount} perk${input.perkCount === 1 ? "" : "s"} added`
      : "Add sponsor perks"
  const completedHint = input.perksNone
    ? "You said this event has no perks"
    : "Teams will see these on the event page"
  items.push(autoAction({
    id: "add-perks",
    severity: "info",
    tab: "perks",
    action: hasPerks ? undefined : "open-perk-dialog",
    ctaLabel: "Add",
    tooltip: PERKS_TOOLTIP,
    isComplete: hasPerks,
    pending: { label: "Add sponsor perks", hint: "API keys, credits, or coupons teams can use. Or mark that you don't have any." },
    completed: { label, hint: completedHint },
  }))
}

function judgesLabel(input: ActionItemsInput): string {
  const pending = input.pendingJudgeInvitationCount
  if (pending > 0) return `Judges invited (${pending} pending)`
  return "Judges invited"
}

function addPendingTeamApprovalAction(items: ActionItem[], input: ActionItemsInput) {
  const count = input.pendingTeamApprovalCount
  if (count <= 0) return
  if (input.status === "judging" || input.status === "completed" || input.status === "archived") return

  items.push(autoAction({
    id: "review-pending-teams",
    severity: "urgent",
    tab: "teams",
    ctaLabel: "Review",
    isComplete: false,
    pending: {
      label: `${count} team${count === 1 ? "" : "s"} waiting for approval`,
      hint: "Approve or deny them before they can submit",
    },
    completed: { label: "No teams waiting for approval", hint: "Every team is handled" },
  }))
}

function addLateRegistrationAction(items: ActionItem[], input: ActionItemsInput) {
  if (input.allowLateRegistration !== false) return
  if (!input.startsAt || !input.registrationClosesAt) return

  const now = Date.now()
  const startsAt = new Date(input.startsAt).getTime()
  const closesAt = new Date(input.registrationClosesAt).getTime()
  const endsAt = input.endsAt ? new Date(input.endsAt).getTime() : null

  if (now < startsAt || now <= closesAt) return
  if (endsAt && now > endsAt) return

  items.push(autoAction({
    id: "allow-late-registration",
    severity: "urgent",
    tab: "edit",
    action: "open-dates-dialog",
    ctaLabel: "Fix",
    tooltip: "People can still join after the event starts when late signups are on. Turn this on for walk-ins and last-minute teams.",
    isComplete: false,
    pending: {
      label: "People can't join after the event starts",
      hint: "Turn on late signups if walk-ins should join",
    },
    completed: {
      label: "Late signups are on",
      hint: "People can join while the event is live",
    },
  }))
}

const JUDGES_TOOLTIP = "Judges review and score submissions after the hackathon ends. Invite them early so they can prepare. You can assign judges to specific prize categories and they'll receive email notifications when judging begins."
const PRIZES_TOOLTIP = "Prizes motivate participation and give teams a clear goal. Define categories like Best Overall, Most Creative, or domain-specific tracks. Each prize can have its own judging criteria."

function addDraftActions(items: ActionItem[], input: ActionItemsInput) {
  const hasDates = !!input.startsAt && !!input.endsAt
  items.push(autoAction({
    id: "no-dates",
    severity: "urgent",
    tab: "edit",
    action: hasDates ? undefined : "open-dates-dialog",
    ctaLabel: "Edit",
    tooltip: "Event dates determine when registration opens, when the hackathon goes live, and when submissions close. All scheduling and countdown timers depend on these dates.",
    isComplete: hasDates,
    pending: { label: "Set event start and end dates", hint: "Required before you can publish" },
    completed: { label: "Event dates set", hint: "Start and end times are configured" },
  }))

  const hasDescription = !!input.description
  items.push(autoAction({
    id: "no-description",
    severity: "info",
    tab: "edit",
    action: hasDescription ? undefined : "open-description-dialog",
    ctaLabel: "Edit",
    tooltip: "The description appears on your public event page and helps potential participants decide whether to sign up. Include the theme, format, who should join, and what they'll get out of it.",
    isComplete: hasDescription,
    pending: { label: "Add an event description", hint: "Tell participants what the event is about" },
    completed: { label: "Event description added", hint: "Participants can see what the event is about" },
  }))

  const hasLocation = !!input.locationType
  items.push(autoAction({
    id: "no-location",
    severity: "urgent",
    tab: "edit",
    action: hasLocation ? undefined : "open-location-dialog",
    ctaLabel: "Set",
    tooltip: "Setting the location type (in-person or virtual) is required to publish. For in-person events, include the venue address. For virtual events, you can add a link to the video call or platform later.",
    isComplete: hasLocation,
    pending: { label: "Set event location", hint: "Required before you can publish" },
    completed: { label: "Location set", hint: "Participants know where to attend" },
  }))

  const hasBanner = !!input.bannerUrl
  items.push(autoAction({
    id: "no-banner",
    severity: "info",
    tab: "edit",
    action: hasBanner ? undefined : "open-banner-dialog",
    ctaLabel: "Add",
    tooltip: "The banner image is the first thing participants see on your event page. A good banner sets the tone and makes your hackathon look professional. Recommended size is 1200x630px.",
    isComplete: hasBanner,
    pending: { label: "Upload a banner image", hint: "Give your event page a visual identity" },
    completed: { label: "Banner image uploaded", hint: "Your event page has a visual identity" },
  }))

  addChallengeActions(items, input)

  addPerksAction(items, input)

  const hasPrizes = input.prizeCount > 0
  items.push(autoAction({
    id: "no-prizes",
    severity: "warning",
    tab: "judging",
    subtab: hasPrizes ? undefined : "setup",
    subtabKey: hasPrizes ? undefined : "jtab",
    action: hasPrizes ? undefined : "open-prize-dialog",
    ctaLabel: "Add",
    tooltip: PRIZES_TOOLTIP,
    isComplete: hasPrizes,
    pending: { label: "Add prizes", hint: "Define what teams are competing for" },
    completed: {
      label: `${input.prizeCount} prize${input.prizeCount !== 1 ? "s" : ""} defined`,
      hint: "Teams know what they're competing for",
    },
  }))

  const hasJudges = input.judgeDisplayCount > 0 || input.judgeCount > 0
  items.push(autoAction({
    id: "no-judges",
    severity: "warning",
    tab: "judging",
    subtab: hasJudges ? undefined : "setup",
    subtabKey: hasJudges ? undefined : "jtab",
    action: hasJudges ? undefined : "open-judge-dialog",
    ctaLabel: "Invite",
    tooltip: JUDGES_TOOLTIP,
    isComplete: hasJudges,
    pending: { label: "Invite judges", hint: "Assemble your judging panel" },
    completed: { label: judgesLabel(input), hint: "Your judging panel is being assembled" },
  }))

  items.push(manualAction({
    id: "review-team-settings",
    label: "Review team size settings",
    hint: "Decide how big teams can be and whether solo is allowed",
    severity: "info",
    tab: "teams",
    action: "open-team-settings-dialog",
    ctaLabel: "Review",
    tooltip: "Team size limits control how many people can join a team. You can allow solo participants, require pairs, or set a custom range. These settings affect registration and team formation.",
  }))

  items.push(manualAction({
    id: "add-schedule",
    label: "Review and customize your agenda",
    hint: "The default schedule is auto-generated — add your own items",
    severity: "warning",
    action: "open-agenda-dialog",
    ctaLabel: "Review",
    tooltip: "New events come with a default agenda. Review it and add sessions like workshops, meal breaks, sponsor demos, or networking time. Participants see the schedule on the event page.",
  }))

  items.push(manualAction({
    id: "check-submission-deadline",
    label: "Confirm submission close time",
    hint: "This controls when submissions lock and judging begins",
    severity: "warning",
    tab: "edit",
    action: "open-submission-deadline-dialog",
    ctaLabel: "Check",
    tooltip: "The submission deadline is an automated agenda item that locks submissions and starts the judging phase. Make sure the time is correct — once it passes, participants can no longer submit or edit their projects.",
  }))

  const hasTerms = !!input.termsContent && input.termsContent.trim().length > 0
  items.push(autoAction({
    id: "add-terms-and-conditions",
    severity: "info",
    tab: "miscs",
    subtab: "terms",
    subtabKey: "mtab",
    ctaLabel: "Add",
    tooltip: "Add custom terms participants must agree to before they register or accept an invite. Useful for code of conduct, IP, photo release, or anything sponsors require.",
    isComplete: hasTerms,
    pending: { label: "Add terms and conditions (optional)", hint: "Make attendees and judges agree before they join" },
    completed: { label: "Terms and conditions added", hint: "Attendees and judges will see and agree to your terms" },
  }))

  addCommunityLinkAction(items, input)

  if (
    hasDates &&
    hasLocation &&
    canPublishEventDates({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      now: input.now,
    })
  ) {
    items.push(transitionAction({
      id: "ready-to-publish",
      label: "Ready to publish your event",
      hint: "All prerequisites are met",
      severity: "info",
      action: "transition-to-published",
      ctaLabel: "Publish",
    }))
  }
}

function addCommunityLinkAction(items: ActionItem[], input: ActionItemsInput) {
  if (input.communityUrl) return
  items.push(manualAction({
    id: "add-community-link",
    label: "Add a community/help link",
    hint: "Share a Discord, Slack, or help link with registered attendees",
    severity: "info",
    tab: "edit",
    action: "open-community-dialog",
    ctaLabel: "Add",
    tooltip: "Drop a link to your Discord, Slack, Telegram, or help doc. Registered attendees will see it on the event page so they can ask questions and meet other builders.",
  }))
}

function addPublishedActions(items: ActionItem[], input: ActionItemsInput) {
  addPendingTeamApprovalAction(items, input)

  items.push(manualAction({
    id: "promote-event",
    label: "Promote your event",
    hint: "Spread the word and attract participants",
    severity: "info",
    action: "confirm-promote",
    tooltip: "Share your event link on social media, Slack communities, university mailing lists, and relevant forums. The more visibility your hackathon gets before it starts, the better the turnout and quality of submissions.",
  }))

  const hasJudges = input.judgeDisplayCount > 0 || input.judgeCount > 0
  items.push(autoAction({
    id: "no-judges",
    severity: "warning",
    tab: "judging",
    subtab: hasJudges ? undefined : "setup",
    subtabKey: hasJudges ? undefined : "jtab",
    action: hasJudges ? undefined : "open-judge-dialog",
    ctaLabel: "Invite",
    tooltip: JUDGES_TOOLTIP,
    isComplete: hasJudges,
    pending: { label: "No judges invited yet", hint: "You'll need judges to evaluate submissions" },
    completed: { label: judgesLabel(input), hint: "Your judging panel is being assembled" },
  }))

  const hasPrizes = input.prizeCount > 0
  items.push(autoAction({
    id: "no-prizes",
    severity: "warning",
    tab: "judging",
    subtab: hasPrizes ? undefined : "setup",
    subtabKey: hasPrizes ? undefined : "jtab",
    action: hasPrizes ? undefined : "open-prize-dialog",
    ctaLabel: "Add",
    tooltip: PRIZES_TOOLTIP,
    isComplete: hasPrizes,
    pending: { label: "No prizes defined", hint: "Teams don't know what they're competing for yet" },
    completed: {
      label: `${input.prizeCount} prize${input.prizeCount !== 1 ? "s" : ""} defined`,
      hint: "Teams know what they're competing for",
    },
  }))

  addChallengeActions(items, input)

  addPerksAction(items, input)

  if (input.startsAt) {
    const hoursUntilStart = (new Date(input.startsAt).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilStart > 0 && hoursUntilStart <= 24) {
      items.push(dismissAction({
        id: "starting-soon",
        label: "Event starts in less than 24 hours",
        hint: "Double-check everything is ready",
        severity: "info",
        tooltip: "Review your schedule, challenge, judges, and prizes. Make sure your communication channels are set up and your team is briefed on the run-of-show.",
      }))
    }
  }

  addCommunityLinkAction(items, input)

  items.push(dismissAction({
    id: "verify-automated-times",
    label: "Double-check automated times",
    hint: "Verify challenge release and submission close times",
    severity: "info",
    action: "open-agenda-dialog",
    ctaLabel: "Review",
    tooltip: "The challenge release and submission deadline are automated events that trigger at specific times. Review the agenda to make sure these times are correct before the event goes live.",
  }))

  const hasDates = !!input.startsAt && !!input.endsAt
  const hasLocation = !!input.locationType
  const eventHasStarted = !!input.startsAt && new Date(input.startsAt).getTime() <= Date.now()
  if (hasDates && hasLocation && !eventHasStarted) {
    items.push(transitionAction({
      id: "ready-to-go-live",
      label: "Ready to start",
      hint: "The essentials are in place — you can finish the rest later",
      severity: "info",
      action: "transition-to-active",
      ctaLabel: "Start event",
    }))
  }
}

function addShowcaseAction(items: ActionItem[], input: ActionItemsInput) {
  if (input.submissionCount === 0) return
  items.push(manualAction({
    id: "open-showcase",
    label: "Show projects on the big screen",
    hint: "Pick a round or specific projects, then open the link on a projector.",
    severity: "info",
    action: "open-showcase-dialog",
    ctaLabel: "Set up",
    tooltip: "Make a showcase view to project on the big screen during demos. You can pick a whole round of projects or hand-pick a few. Saved views stick around so you can re-open them anytime.",
  }))
}

function addActiveActions(items: ActionItem[], input: ActionItemsInput) {
  addPendingTeamApprovalAction(items, input)
  addLateRegistrationAction(items, input)

  addChallengeActions(items, input)
  addShowcaseAction(items, input)

  if (input.mentorQueue.open > 0) {
    items.push(autoAction({
      id: "mentor-requests",
      severity: "info",
      tab: "event",
      subtab: "mentors",
      subtabKey: "etab",
      ctaLabel: "Review",
      tooltip: "Participants can request help from mentors during the hackathon. Responding quickly keeps teams unblocked and productive. You can assign mentors or respond directly.",
      isComplete: false,
      pending: {
        label: `${input.mentorQueue.open} mentor request${input.mentorQueue.open !== 1 ? "s" : ""} pending`,
        hint: "Teams are waiting for help",
      },
      completed: { label: "Mentor queue clear", hint: "No teams waiting for help" },
    }))
  }

  const hasJudges = input.judgeCount > 0
  items.push(autoAction({
    id: "no-judges",
    severity: "warning",
    tab: "judging",
    subtab: hasJudges ? undefined : "setup",
    subtabKey: hasJudges ? undefined : "jtab",
    action: hasJudges ? undefined : "open-judge-dialog",
    ctaLabel: "Invite",
    tooltip: "Judges are needed to evaluate submissions once the hackathon ends. Without judges, you won't be able to score projects and determine winners. Invite them now so they're ready when judging begins.",
    isComplete: hasJudges,
    pending: { label: "No judges assigned yet", hint: "You'll need judges before starting the judging phase" },
    completed: { label: "Judges assigned", hint: "Ready to evaluate submissions when the time comes" },
  }))

  if (input.submissionCount > 0) {
    const count = input.unassignedSubmissionCount
    items.push(autoAction({
      id: "unassigned-submissions",
      severity: "urgent",
      tab: "judging",
      ctaLabel: "Assign",
      tooltip: "Every submitted project needs a judge. Without an assignment, no one will score it and the project won't show up in results. Open the Judging tab to assign judges.",
      isComplete: count === 0,
      pending: {
        label: `${count} project${count === 1 ? "" : "s"} waiting for a judge`,
        hint: "Assign judges so they can start scoring",
      },
      completed: { label: "Every project has a judge", hint: "Judges are ready to score" },
    }))
  }

  if (
    input.rounds.plannedCount > 0 &&
    input.rounds.activeCount === 0 &&
    input.rounds.completeCount === 0
  ) {
    items.push(autoAction({
      id: "activate-first-round",
      severity: "warning",
      tab: "judging",
      subtab: "rounds",
      subtabKey: "jtab",
      ctaLabel: "Activate",
      tooltip: "Activating a round opens scoring for the judges assigned to its prizes. You can activate early if judges are ready to review as submissions come in.",
      isComplete: false,
      pending: {
        label: "Activate your first judging round when you're ready",
        hint: "Judges can start scoring as soon as you flip this on.",
      },
      completed: {
        label: "First judging round activated",
        hint: "Judges can now score submissions",
      },
    }))
  }

  if (input.judgingSetupReady === false) {
    items.push(autoAction({
      id: "finish-scoring-setup",
      severity: "urgent",
      tab: "judging",
      subtab: "setup",
      subtabKey: "jtab",
      ctaLabel: "Review scoring",
      isComplete: false,
      pending: {
        label: "Finish scoring setup",
        hint: "Fix the scoring rules before judging starts",
      },
      completed: {
        label: "Scoring setup is ready",
        hint: "Judges have complete scoring rules",
      },
    }))
  }

  if (
    input.submissionCount > 0 &&
    hasJudges &&
    input.challengeReleased &&
    input.judgingSetupReady !== false
  ) {
    items.push(transitionAction({
      id: "ready-for-judging",
      label: "Ready to start judging",
      hint: "Submissions received and judges are assigned",
      severity: "info",
      action: "transition-to-judging",
      ctaLabel: "Start Judging",
    }))
  }
}

function addJudgingActions(items: ActionItem[], input: ActionItemsInput) {
  addShowcaseAction(items, input)
  if (
    input.rounds.plannedCount > 0 &&
    input.rounds.activeCount === 0 &&
    input.rounds.completeCount === 0
  ) {
    items.push(autoAction({
      id: "activate-first-round",
      severity: "urgent",
      tab: "judging",
      subtab: "rounds",
      subtabKey: "jtab",
      ctaLabel: "Activate",
      tooltip: "Activating a round opens scoring for the judges assigned to its prizes. Judging can't begin until a round is active.",
      isComplete: false,
      pending: {
        label: "Start your first judging round",
        hint: "Judging won't begin until you activate a round.",
      },
      completed: {
        label: "First judging round activated",
        hint: "Judges can now score submissions",
      },
    }))
  }

  const { totalAssignments, completedAssignments } = input.judgingProgress
  const judgingTooltip = "Each judge is assigned submissions to review and score. Track progress here to know when all evaluations are in. You can nudge judges who haven't completed their reviews."
  if (totalAssignments > 0) {
    const pct = Math.round((completedAssignments / totalAssignments) * 100)
    items.push(autoAction({
      id: "judging-incomplete",
      severity: "info",
      tab: "judging",
      ctaLabel: "View",
      tooltip: judgingTooltip,
      isComplete: completedAssignments >= totalAssignments,
      pending: {
        label: `Judging ${pct}% complete (${completedAssignments}/${totalAssignments})`,
        hint: "Judges are still reviewing submissions",
      },
      completed: { label: "All judging complete", hint: "Every submission has been scored" },
    }))
  }

  if (input.mentorQueue.open > 0) {
    items.push(autoAction({
      id: "mentor-requests",
      severity: "info",
      tab: "event",
      subtab: "mentors",
      subtabKey: "etab",
      ctaLabel: "Review",
      tooltip: "Some mentor requests are still open from the hacking phase. Resolve or close them so participants aren't left waiting.",
      isComplete: false,
      pending: {
        label: `${input.mentorQueue.open} mentor request${input.mentorQueue.open !== 1 ? "s" : ""} still pending`,
        hint: "Close out remaining requests before wrapping up",
      },
      completed: { label: "Mentor queue clear", hint: "No teams waiting for help" },
    }))
  }

  const judgingDone = totalAssignments > 0 && completedAssignments >= totalAssignments
  items.push(transitionAction({
    id: "ready-to-complete",
    label: judgingDone ? "Ready to wrap up" : "Complete event early",
    hint: judgingDone ? "All judging is complete — publish results" : "Judging is still in progress",
    severity: "info",
    action: "transition-to-completed",
    ctaLabel: "Complete Event",
  }))
}

function addCompletedActions(items: ActionItem[], input: ActionItemsInput) {
  addShowcaseAction(items, input)
  const resultsPublished = !!input.resultsPublishedAt
  items.push(autoAction({
    id: "results-not-published",
    severity: "urgent",
    tab: "judging",
    ctaLabel: "Publish",
    tooltip: "Publishing results calculates final scores, assigns prizes to top submissions, and automatically sends notification emails to winners and all participants. Review the scores to make sure everything looks right before publishing.",
    isComplete: resultsPublished,
    pending: { label: "Results not yet published", hint: "Publishing announces winners and automatically emails them" },
    completed: { label: "Results published", hint: "Winners announced and notification emails sent" },
  }))

  if (input.feedbackSurveyUrl) {
    const surveySent = !!input.feedbackSurveySentAt
    items.push(autoAction({
      id: "feedback-survey-not-sent",
      severity: "info",
      tab: "post-event",
      ctaLabel: "Send",
      tooltip: "Post-event feedback helps you understand what worked and what to improve for next time. Response rates are highest within 24 hours of the event ending, so send it soon.",
      isComplete: surveySent,
      pending: { label: "Send feedback survey", hint: "Learn what worked and what to improve" },
      completed: { label: "Feedback survey sent", hint: "Participants have been asked for feedback" },
    }))
  }
}
