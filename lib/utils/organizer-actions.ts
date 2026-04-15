import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"

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
  phase: HackathonPhase | null
  submissionCount: number
  participantCount: number
  teamCount: number
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
  locationType: "in_person" | "virtual" | "hybrid" | null
  feedbackSurveyUrl: string | null
  feedbackSurveySentAt: string | null
  pendingJudgeInvitationCount: number
  perkCount: number
  perksNone: boolean
  rounds: { plannedCount: number; activeCount: number; completeCount: number }
  communityUrl?: string | null
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

  return Array.from(itemMap.values())
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

const JUDGES_TOOLTIP = "Judges review and score submissions after the hackathon ends. Invite them early so they can prepare. You can assign judges to specific prize categories and they'll receive email notifications when judging begins."
const PRIZES_TOOLTIP = "Prizes motivate participation and give teams a clear goal. Define categories like Best Overall, Most Creative, or domain-specific tracks. Each prize can have its own judging criteria."

function addDraftActions(items: ActionItem[], input: ActionItemsInput) {
  const hasDates = !!input.startsAt && !!input.endsAt
  items.push(autoAction({
    id: "no-dates",
    severity: "urgent",
    tab: "edit",
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
    action: "open-submission-deadline-dialog",
    ctaLabel: "Check",
    tooltip: "The submission deadline is an automated agenda item that locks submissions and starts the judging phase. Make sure the time is correct — once it passes, participants can no longer submit or edit their projects.",
  }))

  addCommunityLinkAction(items, input)

  if (hasDates && hasLocation) {
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
    action: "open-community-dialog",
    ctaLabel: "Add",
    tooltip: "Drop a link to your Discord, Slack, Telegram, or help doc. Registered attendees will see it on the event page so they can ask questions and meet other builders.",
  }))
}

function addPublishedActions(items: ActionItem[], input: ActionItemsInput) {
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
      items.push(autoAction({
        id: "starting-soon",
        severity: "info",
        tooltip: "Review your schedule, challenge, judges, and prizes. Make sure your communication channels are set up and your team is briefed on the run-of-show.",
        isComplete: false,
        pending: { label: "Event starts in less than 24 hours", hint: "Double-check everything is ready" },
        completed: { label: "Event starts in less than 24 hours", hint: "Double-check everything is ready" },
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
  if (hasDates && hasLocation) {
    items.push(transitionAction({
      id: "ready-to-go-live",
      label: "Ready to go live",
      hint: "The essentials are in place — you can finish the rest later",
      severity: "info",
      action: "transition-to-active",
      ctaLabel: "Start the main event",
    }))
  }
}

function addActiveActions(items: ActionItem[], input: ActionItemsInput) {
  addChallengeActions(items, input)

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
    ctaLabel: "Invite",
    tooltip: "Judges are needed to evaluate submissions once the hackathon ends. Without judges, you won't be able to score projects and determine winners. Invite them now so they're ready when judging begins.",
    isComplete: hasJudges,
    pending: { label: "No judges assigned yet", hint: "You'll need judges before starting the judging phase" },
    completed: { label: "Judges assigned", hint: "Ready to evaluate submissions when the time comes" },
  }))

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

  if (input.submissionCount > 0 && hasJudges && input.challengeReleased) {
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
