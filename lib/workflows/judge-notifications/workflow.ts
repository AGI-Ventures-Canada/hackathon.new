"use workflow"

export type SendJudgeNotificationsInput = {
  hackathonId: string
  hackathonName: string
  hackathonSlug: string
}

export async function sendJudgeNotificationsWorkflow(
  input: SendJudgeNotificationsInput
): Promise<{ sent: number }> {
  const { fetchPendingNotifications, sendJudgeNotification } = await import("./steps")

  const notifications = await fetchPendingNotifications(input.hackathonId)

  if (notifications.length === 0) return { sent: 0 }

  let sent = 0
  for (const notification of notifications) {
    try {
      await sendJudgeNotification({
        notification,
        hackathonName: input.hackathonName,
        hackathonSlug: input.hackathonSlug,
      })
      sent++
    } catch (err) {
      console.error(`Failed to send judge notification ${notification.id}:`, err)
    }
  }

  // Throw on partial success so the workflow runtime retries. Already-sent notifications
  // are filtered out by sent_at IS NULL in fetchPendingNotifications, making retries idempotent.
  if (sent < notifications.length) {
    throw new Error(`Only sent ${sent}/${notifications.length} judge notifications — workflow will retry unsent rows`)
  }

  return { sent }
}
