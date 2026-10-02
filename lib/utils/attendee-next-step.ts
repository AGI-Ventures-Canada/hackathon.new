import type { HackathonStatus } from "@/lib/db/hackathon-types"

export function getAttendeeNextStep(input: {
  status: HackathonStatus
  teamStatus: string | null
  hasTeam: boolean
  allowSolo: boolean
  submitted: boolean
  deadlinePassed: boolean
  resultsPublished: boolean
}): string {
  if (input.resultsPublished)
    return "Your results are ready. Check the results and any prizes on this page."
  if (input.status === "completed" || input.status === "archived")
    return "The event has ended. Watch your email for results and follow-up steps."
  if (input.status === "judging")
    return "Judges are reviewing the projects. We'll email you when results are ready."
  if (input.teamStatus === "disbanded")
    return "Your team is no longer active. Ask the organizer for help joining another team."
  if (input.teamStatus === "pending_approval")
    return "Your team is waiting for approval. You can invite teammates and prepare your project."
  if (input.submitted)
    return "Your project is submitted. Check the schedule for what happens next."
  if (input.deadlinePassed)
    return "The project deadline has passed. Check the schedule for judging and results."
  if (!input.hasTeam)
    return input.allowSolo
      ? "You can take part on your own, or ask a teammate to send you an invite."
      : "Ask a teammate to send you an invite, or contact the organizer to join a team."
  if (input.status === "active")
    return "Build with your team, then open Submit Project to send your work before the deadline."
  return "Check your team and the schedule. We'll email you before the event starts."
}
