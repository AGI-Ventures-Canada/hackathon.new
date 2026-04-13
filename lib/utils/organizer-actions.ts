import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"

export type ActionSeverity = "urgent" | "warning" | "info"

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
  dismissible?: boolean
  ctaLabel?: string
  completed?: boolean
  variant?: "transition"
}

export const SEVERITY_GROUP_LABEL: Record<ActionSeverity, string> = {
  urgent: "BLOCKERS",
  warning: "WARNINGS",
  info: "OPTIONAL",
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
  locationType: "in_person" | "virtual" | null
  feedbackSurveyUrl: string | null
  feedbackSurveySentAt: string | null
  pendingJudgeInvitationCount: number
}

export function getOrganizerActionItems(input: ActionItemsInput): ActionItem[] {
  const items: ActionItem[] = []
  const { status } = input

  if (status === "draft") {
    addDraftActions(items, input)
  } else if (status === "published" || status === "registration_open") {
    addPublishedActions(items, input)
  } else if (status === "active") {
    addActiveActions(items, input)
  } else if (status === "judging") {
    addJudgingActions(items, input)
  } else if (status === "completed") {
    addCompletedActions(items, input)
  }

  return items
}

const CHALLENGE_TOOLTIP = "The challenge is the problem statement or theme that participants build around. Without it, teams won't know what to work on. You can schedule it to release at a specific time or publish it immediately."

function addChallengeActions(items: ActionItem[], input: ActionItemsInput) {
  if (input.challengeReleased) {
    items.push({ id: "create-challenge", label: "Challenge released", hint: "Participants can see the problem statement", severity: "info", completed: true, tooltip: CHALLENGE_TOOLTIP })
    return
  }
  if (!input.challengeExists) {
    items.push({ id: "create-challenge", label: "Create your challenge", hint: "Define the problem participants will solve", severity: "warning", action: "open-challenge-dialog", ctaLabel: "Add", tooltip: CHALLENGE_TOOLTIP })
  } else if (input.challengeReleaseTime) {
    const time = new Date(input.challengeReleaseTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    items.push({ id: "release-challenge", label: `Challenge releases at ${time}`, hint: "Scheduled — click to release now instead", severity: "warning", action: "release-challenge", ctaLabel: "Release", tooltip: CHALLENGE_TOOLTIP })
  } else {
    items.push({ id: "release-challenge", label: "Release your challenge", hint: "Make the problem statement visible to participants", severity: "warning", action: "release-challenge", ctaLabel: "Release", tooltip: CHALLENGE_TOOLTIP })
  }
}

function judgesLabel(input: ActionItemsInput): string {
  const pending = input.pendingJudgeInvitationCount
  if (pending > 0) return `Judges invited (${pending} pending)`
  return "Judges invited"
}

function addDraftActions(items: ActionItem[], input: ActionItemsInput) {
  const hasDates = !!input.startsAt && !!input.endsAt
  items.push(hasDates
    ? { id: "no-dates", label: "Event dates set", hint: "Start and end times are configured", severity: "urgent", tab: "edit", completed: true, tooltip: "Event dates determine when registration opens, when the hackathon goes live, and when submissions close. All scheduling and countdown timers depend on these dates." }
    : { id: "no-dates", label: "Set event start and end dates", hint: "Required before you can publish", severity: "urgent", tab: "edit", ctaLabel: "Edit", tooltip: "Event dates determine when registration opens, when the hackathon goes live, and when submissions close. All scheduling and countdown timers depend on these dates." }
  )

  const hasDescription = !!input.description
  items.push(hasDescription
    ? { id: "no-description", label: "Event description added", hint: "Participants can see what the event is about", severity: "info", tab: "edit", completed: true, tooltip: "The description appears on your public event page and helps potential participants decide whether to sign up. Include the theme, format, who should join, and what they'll get out of it." }
    : { id: "no-description", label: "Add an event description", hint: "Tell participants what the event is about", severity: "info", tab: "edit", ctaLabel: "Edit", tooltip: "The description appears on your public event page and helps potential participants decide whether to sign up. Include the theme, format, who should join, and what they'll get out of it." }
  )

  const hasLocation = !!input.locationType
  items.push(hasLocation
    ? { id: "no-location", label: "Location set", hint: "Participants know where to attend", severity: "urgent", tab: "edit", completed: true, tooltip: "Setting the location type (in-person or virtual) is required to publish. For in-person events, include the venue address. For virtual events, you can add a link to the video call or platform later." }
    : { id: "no-location", label: "Set event location", hint: "Required before you can publish", severity: "urgent", tab: "edit", ctaLabel: "Set", tooltip: "Setting the location type (in-person or virtual) is required to publish. For in-person events, include the venue address. For virtual events, you can add a link to the video call or platform later." }
  )

  const hasBanner = !!input.bannerUrl
  items.push(hasBanner
    ? { id: "no-banner", label: "Banner image uploaded", hint: "Your event page has a visual identity", severity: "info", tab: "edit", completed: true, tooltip: "The banner image is the first thing participants see on your event page. A good banner sets the tone and makes your hackathon look professional. Recommended size is 1200x630px." }
    : { id: "no-banner", label: "Upload a banner image", hint: "Give your event page a visual identity", severity: "info", tab: "edit", ctaLabel: "Add", tooltip: "The banner image is the first thing participants see on your event page. A good banner sets the tone and makes your hackathon look professional. Recommended size is 1200x630px." }
  )

  addChallengeActions(items, input)

  const hasPrizes = input.prizeCount > 0
  items.push(hasPrizes
    ? { id: "no-prizes", label: `${input.prizeCount} prize${input.prizeCount !== 1 ? "s" : ""} defined`, hint: "Teams know what they're competing for", severity: "warning", tab: "judging", completed: true, tooltip: "Prizes motivate participation and give teams a clear goal. Define categories like Best Overall, Most Creative, or domain-specific tracks. Each prize can have its own judging criteria." }
    : { id: "no-prizes", label: "Add prizes", hint: "Define what teams are competing for", severity: "warning", tab: "judging", ctaLabel: "Add", tooltip: "Prizes motivate participation and give teams a clear goal. Define categories like Best Overall, Most Creative, or domain-specific tracks. Each prize can have its own judging criteria." }
  )

  const hasJudges = input.judgeDisplayCount > 0 || input.judgeCount > 0
  items.push(hasJudges
    ? { id: "no-judges", label: judgesLabel(input), hint: "Your judging panel is being assembled", severity: "warning", tab: "judging", completed: true, tooltip: "Judges review and score submissions after the hackathon ends. Invite them early so they can prepare. You can assign judges to specific prize categories and they'll receive email notifications when judging begins." }
    : { id: "no-judges", label: "Invite judges", hint: "Assemble your judging panel", severity: "warning", tab: "judging", ctaLabel: "Invite", tooltip: "Judges review and score submissions after the hackathon ends. Invite them early so they can prepare. You can assign judges to specific prize categories and they'll receive email notifications when judging begins." }
  )

  items.push({ id: "add-schedule", label: "Review and customize your agenda", hint: "The default schedule is auto-generated — add your own items", severity: "warning", action: "open-agenda-dialog", ctaLabel: "Review", tooltip: "New events come with a default agenda. Review it and add sessions like workshops, meal breaks, sponsor demos, or networking time. Participants see the schedule on the event page." })

  items.push({ id: "check-submission-deadline", label: "Confirm submission close time", hint: "This controls when submissions lock and judging begins", severity: "warning", action: "open-submission-deadline-dialog", ctaLabel: "Check", tooltip: "The submission deadline is an automated agenda item that locks submissions and starts the judging phase. Make sure the time is correct — once it passes, participants can no longer submit or edit their projects." })

  if (hasDates && hasLocation) {
    items.push({ id: "ready-to-publish", label: "Ready to publish your event", hint: "All prerequisites are met", severity: "info", action: "transition-to-published", ctaLabel: "Publish", variant: "transition" })
  }
}

function addPublishedActions(items: ActionItem[], input: ActionItemsInput) {
  items.push({ id: "promote-event", label: "Promote your event", hint: "Spread the word and attract participants", severity: "info", action: "confirm-promote", tooltip: "Share your event link on social media, Slack communities, university mailing lists, and relevant forums. The more visibility your hackathon gets before it starts, the better the turnout and quality of submissions." })

  const hasJudges = input.judgeDisplayCount > 0 || input.judgeCount > 0
  items.push(hasJudges
    ? { id: "no-judges", label: judgesLabel(input), hint: "Your judging panel is being assembled", severity: "warning", tab: "judging", completed: true, tooltip: "Judges review and score submissions after the hackathon ends. Invite them early so they can prepare. You can assign judges to specific prize categories and they'll receive email notifications when judging begins." }
    : { id: "no-judges", label: "No judges invited yet", hint: "You'll need judges to evaluate submissions", severity: "warning", tab: "judging", ctaLabel: "Invite", tooltip: "Judges review and score submissions after the hackathon ends. Invite them early so they can prepare. You can assign judges to specific prize categories and they'll receive email notifications when judging begins." }
  )

  const hasPrizes = input.prizeCount > 0
  items.push(hasPrizes
    ? { id: "no-prizes", label: `${input.prizeCount} prize${input.prizeCount !== 1 ? "s" : ""} defined`, hint: "Teams know what they're competing for", severity: "warning", tab: "judging", completed: true, tooltip: "Prizes motivate participation and give teams a clear goal. Define categories like Best Overall, Most Creative, or domain-specific tracks. Each prize can have its own judging criteria." }
    : { id: "no-prizes", label: "No prizes defined", hint: "Teams don't know what they're competing for yet", severity: "warning", tab: "judging", ctaLabel: "Add", tooltip: "Prizes motivate participation and give teams a clear goal. Define categories like Best Overall, Most Creative, or domain-specific tracks. Each prize can have its own judging criteria." }
  )

  addChallengeActions(items, input)

  if (input.startsAt) {
    const hoursUntilStart = (new Date(input.startsAt).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilStart > 0 && hoursUntilStart <= 24) {
      items.push({ id: "starting-soon", label: "Event starts in less than 24 hours", hint: "Double-check everything is ready", severity: "info", tooltip: "Review your schedule, challenge, judges, and prizes. Make sure your communication channels are set up and your team is briefed on the run-of-show." })
    }
  }

  items.push({ id: "verify-automated-times", label: "Double-check automated times", hint: "Verify challenge release and submission close times", severity: "info", action: "open-agenda-dialog", ctaLabel: "Review", dismissible: true, tooltip: "The challenge release and submission deadline are automated events that trigger at specific times. Review the agenda to make sure these times are correct before the event goes live." })

  items.push({ id: "ready-to-go-live", label: "Ready to go live", hint: "The essentials are in place — you can finish the rest later", severity: "info", action: "transition-to-active", ctaLabel: "Go Live", variant: "transition" })
}

function addActiveActions(items: ActionItem[], input: ActionItemsInput) {
  addChallengeActions(items, input)

  if (input.mentorQueue.open > 0) {
    items.push({ id: "mentor-requests", label: `${input.mentorQueue.open} mentor request${input.mentorQueue.open !== 1 ? "s" : ""} pending`, hint: "Teams are waiting for help", severity: "info", tab: "event", subtab: "mentors", subtabKey: "etab", ctaLabel: "Review", tooltip: "Participants can request help from mentors during the hackathon. Responding quickly keeps teams unblocked and productive. You can assign mentors or respond directly." })
  }

  const hasJudges = input.judgeCount > 0
  items.push(hasJudges
    ? { id: "no-judges-active", label: "Judges assigned", hint: "Ready to evaluate submissions when the time comes", severity: "warning", tab: "judging", completed: true, tooltip: "Judges are assigned and will be notified when the judging phase begins. They'll score submissions based on the rubrics you've defined for each prize category." }
    : { id: "no-judges-active", label: "No judges assigned yet", hint: "You'll need judges before starting the judging phase", severity: "warning", tab: "judging", ctaLabel: "Invite", tooltip: "Judges are needed to evaluate submissions once the hackathon ends. Without judges, you won't be able to score projects and determine winners. Invite them now so they're ready when judging begins." }
  )

  if (input.submissionCount > 0 && hasJudges && input.challengeReleased) {
    items.push({ id: "ready-for-judging", label: "Ready to start judging", hint: "Submissions received and judges are assigned", severity: "info", action: "transition-to-judging", ctaLabel: "Start Judging", variant: "transition" })
  }
}

function addJudgingActions(items: ActionItem[], input: ActionItemsInput) {
  const { totalAssignments, completedAssignments } = input.judgingProgress
  const judgingTooltip = "Each judge is assigned submissions to review and score. Track progress here to know when all evaluations are in. You can nudge judges who haven't completed their reviews."
  if (totalAssignments > 0 && completedAssignments < totalAssignments) {
    const pct = Math.round((completedAssignments / totalAssignments) * 100)
    items.push({ id: "judging-incomplete", label: `Judging ${pct}% complete (${completedAssignments}/${totalAssignments})`, hint: "Judges are still reviewing submissions", severity: "info", tab: "judging", ctaLabel: "View", tooltip: judgingTooltip })
  } else if (totalAssignments > 0) {
    items.push({ id: "judging-incomplete", label: "All judging complete", hint: "Every submission has been scored", severity: "info", tab: "judging", completed: true, tooltip: judgingTooltip })
  }

  if (input.mentorQueue.open > 0) {
    items.push({ id: "mentor-requests", label: `${input.mentorQueue.open} mentor request${input.mentorQueue.open !== 1 ? "s" : ""} still pending`, hint: "Close out remaining requests before wrapping up", severity: "info", tab: "event", subtab: "mentors", subtabKey: "etab", ctaLabel: "Review", tooltip: "Some mentor requests are still open from the hacking phase. Resolve or close them so participants aren't left waiting." })
  }

  const judgingDone = totalAssignments > 0 && completedAssignments >= totalAssignments
  items.push({
    id: "ready-to-complete",
    label: judgingDone ? "Ready to wrap up" : "Complete event early",
    hint: judgingDone ? "All judging is complete — publish results" : "Judging is still in progress",
    severity: "info",
    action: "transition-to-completed",
    ctaLabel: "Complete Event",
    variant: "transition",
  })
}

function addCompletedActions(items: ActionItem[], input: ActionItemsInput) {
  const resultsPublished = !!input.resultsPublishedAt
  items.push(resultsPublished
    ? { id: "results-not-published", label: "Results published", hint: "Winners announced and notification emails sent", severity: "urgent", tab: "judging", completed: true, tooltip: "Publishing results calculates final scores, assigns prizes to top submissions, and sends notification emails to winners and participants. This is the culmination of the entire event." }
    : { id: "results-not-published", label: "Results not yet published", hint: "Publishing announces winners and automatically emails them", severity: "urgent", tab: "judging", ctaLabel: "Publish", tooltip: "Publishing results calculates final scores, assigns prizes to top submissions, and automatically sends notification emails to winners and all participants. Review the scores to make sure everything looks right before publishing." }
  )

  if (input.feedbackSurveyUrl) {
    const surveySent = !!input.feedbackSurveySentAt
    items.push(surveySent
      ? { id: "feedback-survey-not-sent", label: "Feedback survey sent", hint: "Participants have been asked for feedback", severity: "info", tab: "post-event", completed: true, tooltip: "Post-event feedback helps you understand what worked and what to improve for next time. Response rates are highest within 24 hours of the event ending." }
      : { id: "feedback-survey-not-sent", label: "Send feedback survey", hint: "Learn what worked and what to improve", severity: "info", tab: "post-event", ctaLabel: "Send", tooltip: "Post-event feedback helps you understand what worked and what to improve for next time. Response rates are highest within 24 hours of the event ending, so send it soon." }
    )
  }
}
