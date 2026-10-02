export function getJudgingScenarioSettings(status: string, now = new Date(), timezone = "UTC") {
  return {
    judging_opens_at: status === "judging" ? new Date(now.getTime() - 3_600_000).toISOString() : null,
    judging_closes_at: status === "judging" ? new Date(now.getTime() + 48 * 3_600_000).toISOString() : null,
    judging_timezone: timezone,
    judging_instructions: "Review each project. Score every rule, then submit your review.",
    judging_browse_enabled: true,
    judging_target_reviews: 3,
    judging_reminders_enabled: true,
  }
}
