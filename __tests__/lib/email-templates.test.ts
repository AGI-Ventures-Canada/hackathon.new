import { describe, expect, it } from "bun:test"
import { renderEmail } from "@/lib/email/utils"
import TeamInvitationEmail from "@/emails/team-invitation"
import JudgeInvitationEmail from "@/emails/judge-invitation"
import JudgeAddedEmail from "@/emails/judge-added"
import ResultsAnnouncementEmail from "@/emails/results-announcement"
import FeedbackSurveyEmail from "@/emails/feedback-survey"
import TransitionNotificationEmail from "@/emails/transition-notification"
import ChallengesReleasedEmail from "@/emails/challenges-released"
import PostEventReminderEmail from "@/emails/post-event-reminder"
import WinnerNotificationEmail from "@/emails/winner-notification"
import AgentNotificationEmail from "@/emails/agent-notification"
import SponsorClaimNotificationEmail from "@/emails/sponsor-claim-notification"
import OrganizerClaimNotificationEmail from "@/emails/organizer-claim-notification"

describe("Email Template Rendering", () => {
  it("renders team-invitation", async () => {
    const { html, text } = await renderEmail(
      TeamInvitationEmail(TeamInvitationEmail.PreviewProps)
    )
    expect(html).toContain("Invited to Join a Team")
    expect(html).toContain("Neural Navigators")
    expect(html).toContain("Accept Invitation")
    expect(text).toContain("Neural Navigators")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders judge-invitation", async () => {
    const { html, text } = await renderEmail(
      JudgeInvitationEmail(JudgeInvitationEmail.PreviewProps)
    )
    expect(html).toContain("Invited to Judge")
    expect(html).toContain("Accept Invitation")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders judge-added", async () => {
    const { html, text } = await renderEmail(
      JudgeAddedEmail(JudgeAddedEmail.PreviewProps)
    )
    expect(html).toContain("Added as a Judge")
    expect(html).toContain("View Event")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders results-announcement", async () => {
    const { html, text } = await renderEmail(
      ResultsAnnouncementEmail(ResultsAnnouncementEmail.PreviewProps)
    )
    expect(html).toContain("Results Are In!")
    expect(html).toContain("View Results")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders feedback-survey", async () => {
    const { html, text } = await renderEmail(
      FeedbackSurveyEmail(FeedbackSurveyEmail.PreviewProps)
    )
    expect(html).toContain("Share Your Feedback")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders transition-notification for each event type", async () => {
    const events = [
      "hackathon_started",
      "judging_started",
      "results_published",
      "registration_opened",
    ] as const

    for (const event of events) {
      const { html, text } = await renderEmail(
        TransitionNotificationEmail({
          ...TransitionNotificationEmail.PreviewProps,
          event,
        })
      )
      expect(html.length).toBeGreaterThan(0)
      expect(text.length).toBeGreaterThan(0)
    }
  })

  it("renders transition-notification with merged challenges block", async () => {
    const { html, text } = await renderEmail(
      TransitionNotificationEmail({
        ...TransitionNotificationEmail.PreviewProps,
        event: "hackathon_started",
      })
    )
    expect(html).toContain("Here Are the Challenges")
    expect(html).toContain("Build a Smarter Inbox")
    expect(html).toContain("View Challenges")
    expect(text).toContain("Build a Smarter Inbox")
  })

  it("renders challenges-released", async () => {
    const { html, text } = await renderEmail(
      ChallengesReleasedEmail(ChallengesReleasedEmail.PreviewProps)
    )
    expect(html).toContain("Challenges Are Out")
    expect(html).toContain("Build a Smarter Inbox")
    expect(html).toContain("View Challenges")
    expect(text).toContain("Build a Smarter Inbox")
  })

  it("renders post-event-reminder", async () => {
    const { html, text } = await renderEmail(
      PostEventReminderEmail(PostEventReminderEmail.PreviewProps)
    )
    expect(html).toContain("Forget Your Prize")
    expect(html).toContain("View Results")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders winner-notification with prizes and claim links", async () => {
    const { html, text } = await renderEmail(
      WinnerNotificationEmail(WinnerNotificationEmail.PreviewProps)
    )
    expect(html).toContain("Congratulations!")
    expect(html).toContain("SmartRoute AI")
    expect(html).toContain("Best AI Application")
    expect(html).toContain("Claim Your Prize")
    expect(html).toContain("View Results")
    expect(text).toContain("SmartRoute AI")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders winner-notification without claim button when no claimable prizes", async () => {
    const { html } = await renderEmail(
      WinnerNotificationEmail({
        ...WinnerNotificationEmail.PreviewProps,
        primaryClaimUrl: null,
        prizes: [{ name: "Best Design", value: "$500", claimUrl: null }],
      })
    )
    expect(html).toContain("Congratulations!")
    expect(html).toContain("Best Design")
    expect(html).not.toContain("Claim Your Prize")
  })

  it("renders agent-notification for completed run with output", async () => {
    const { html, text } = await renderEmail(
      AgentNotificationEmail(AgentNotificationEmail.PreviewProps)
    )
    expect(html).toContain("Agent Run Notification")
    expect(html).toContain("Receipt Parser")
    expect(html).toContain("run_abc123def456")
    expect(html).toContain("Successfully parsed 3 receipts")
    expect(text.length).toBeGreaterThan(0)
  })

  it("renders agent-notification for failed run with error", async () => {
    const { html } = await renderEmail(
      AgentNotificationEmail({
        agentName: "Data Sync",
        runId: "run_err",
        type: "failed",
        error: "Connection timeout after 30s",
      })
    )
    expect(html).toContain("Data Sync")
    expect(html).toContain("Failed")
    expect(html).toContain("Connection timeout after 30s")
  })

  it("renders team-invitation with date range and team members", async () => {
    const { html } = await renderEmail(
      TeamInvitationEmail({
        ...TeamInvitationEmail.PreviewProps,
        hackathonStartsAt: "2026-04-20T08:30:00Z",
        hackathonEndsAt: "2026-04-22T17:00:00Z",
        teamMembers: ["Sarah Chen", "Marcus Rivera"],
      })
    )
    expect(html).toContain("Apr 20")
    expect(html).toContain("Sarah Chen")
    expect(html).toContain("Marcus Rivera")
  })

  it("renders judge-invitation with event dates", async () => {
    const { html } = await renderEmail(
      JudgeInvitationEmail({
        ...JudgeInvitationEmail.PreviewProps,
        hackathonStartsAt: "2026-04-20T08:30:00Z",
        hackathonEndsAt: "2026-04-22T17:00:00Z",
      })
    )
    expect(html).toContain("Apr 20")
  })

  it("renders judge-added with event dates", async () => {
    const { html } = await renderEmail(
      JudgeAddedEmail({
        ...JudgeAddedEmail.PreviewProps,
        hackathonStartsAt: "2026-04-20T08:30:00Z",
        hackathonEndsAt: "2026-04-22T17:00:00Z",
      })
    )
    expect(html).toContain("Apr 20")
  })

  it("renders sponsor-claim-notification with prizeValue", async () => {
    const { html } = await renderEmail(
      SponsorClaimNotificationEmail({
        ...SponsorClaimNotificationEmail.PreviewProps,
        prizeValue: "$2,000",
      })
    )
    expect(html).toContain("$2,000")
  })

  it("renders organizer-claim-notification with prizeValue", async () => {
    const { html } = await renderEmail(
      OrganizerClaimNotificationEmail({
        ...OrganizerClaimNotificationEmail.PreviewProps,
        prizeValue: "$5,000",
      })
    )
    expect(html).toContain("$5,000")
  })

  it("renders winner-notification with event dates", async () => {
    const { html } = await renderEmail(
      WinnerNotificationEmail({
        ...WinnerNotificationEmail.PreviewProps,
        hackathonStartsAt: "2026-04-20T08:30:00Z",
        hackathonEndsAt: "2026-04-22T17:00:00Z",
      })
    )
    expect(html).toContain("Apr 20")
  })
})
