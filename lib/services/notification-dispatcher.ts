import type {
  TransitionEvent,
  TransitionTrigger,
  WebhookEvent,
} from "@/lib/db/hackathon-types"

export type DispatchInput = {
  type: TransitionEvent
  hackathonId: string
  tenantId: string
  hackathon: { name: string; slug: string; starts_at?: string | null; ends_at?: string | null }
  trigger: TransitionTrigger
  triggeredBy: string
  fromStatus: string
  toStatus: string
}

const EVENT_TO_WEBHOOK: Record<TransitionEvent, WebhookEvent> = {
  registration_opened: "hackathon.registration_opened",
  hackathon_started: "hackathon.started",
  judging_started: "hackathon.judging_started",
  results_published: "hackathon.completed",
}

const EVENT_TO_ROLES: Record<TransitionEvent, string[]> = {
  registration_opened: [],
  hackathon_started: ["participant"],
  judging_started: ["participant", "judge"],
  results_published: ["participant", "judge"],
}

const EVENT_TO_SETTING_KEY: Record<TransitionEvent, string> = {
  registration_opened: "email_on_registration_open",
  hackathon_started: "email_on_hackathon_active",
  judging_started: "email_on_judging_started",
  results_published: "email_on_results_published",
}

export async function dispatchTransitionNotifications(
  input: DispatchInput
): Promise<void> {
  const { getNotificationSettings } = await import("./notification-settings")
  const settings = await getNotificationSettings(input.hackathonId)

  const settingKey = EVENT_TO_SETTING_KEY[input.type] as keyof typeof settings
  const emailEnabled = settings[settingKey] as boolean
  const roles = EVENT_TO_ROLES[input.type]

  if (emailEnabled && roles.length > 0) {
    try {
      const { start } = await import("workflow/api")
      const { sendTransitionNotificationsWorkflow } = await import(
        "@/lib/workflows/transition-notifications"
      )
      start(sendTransitionNotificationsWorkflow, [
        {
          hackathonId: input.hackathonId,
          hackathonName: input.hackathon.name,
          hackathonSlug: input.hackathon.slug,
          hackathonStartsAt: input.hackathon.starts_at ?? null,
          hackathonEndsAt: input.hackathon.ends_at ?? null,
          event: input.type,
          recipientRoles: roles,
        },
      ]).catch((err) => {
        console.error(
          `Failed to start transition notification workflow for ${input.type}:`,
          err
        )
      })
    } catch (err) {
      console.error(
        `Failed to dispatch transition emails for ${input.type}:`,
        err
      )
    }
  }

  const webhookEvent = EVENT_TO_WEBHOOK[input.type]
  try {
    const { triggerWebhooks } = await import("@/lib/services/webhooks")
    triggerWebhooks(input.tenantId, webhookEvent, {
      event: webhookEvent,
      timestamp: new Date().toISOString(),
      data: {
        hackathonId: input.hackathonId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        trigger: input.trigger,
      },
    }).catch(console.error)
  } catch (err) {
    console.error(`Failed to trigger webhooks for ${input.type}:`, err)
  }
}
