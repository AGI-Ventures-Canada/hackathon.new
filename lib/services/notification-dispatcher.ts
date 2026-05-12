import type {
  ChallengeSummary,
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
  challenges?: ChallengeSummary[]
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
  const hasChallenges = !!input.challenges && input.challenges.length > 0

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
          challenges: input.challenges,
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
    const timestamp = new Date().toISOString()
    triggerWebhooks(input.tenantId, webhookEvent, {
      event: webhookEvent,
      timestamp,
      data: {
        hackathonId: input.hackathonId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        trigger: input.trigger,
      },
    }).catch(console.error)

    if (hasChallenges) {
      triggerWebhooks(input.tenantId, "hackathon.challenges_released", {
        event: "hackathon.challenges_released",
        timestamp,
        data: {
          hackathonId: input.hackathonId,
          trigger: input.trigger,
          challengeCount: input.challenges?.length ?? 0,
          source: "transition",
          coincidentWith: webhookEvent,
        },
      }).catch(console.error)
    }
  } catch (err) {
    console.error(`Failed to trigger webhooks for ${input.type}:`, err)
  }
}

export type ChallengesReleasedTrigger =
  | "manual"
  | "scheduled"
  | "event_publish"
  | "event_start"

export type ChallengesReleasedDispatchInput = {
  hackathonId: string
  tenantId: string
  hackathon: { name: string; slug: string }
  challenges: ChallengeSummary[]
  trigger: ChallengesReleasedTrigger
}

export async function dispatchChallengesReleasedNotifications(
  input: ChallengesReleasedDispatchInput
): Promise<void> {
  if (input.challenges.length === 0) return

  const { getNotificationSettings } = await import("./notification-settings")
  const settings = await getNotificationSettings(input.hackathonId)
  const emailEnabled = settings.email_on_challenges_released

  if (emailEnabled) {
    try {
      const { start } = await import("workflow/api")
      const { sendChallengesReleasedNotificationsWorkflow } = await import(
        "@/lib/workflows/challenges-released"
      )
      start(sendChallengesReleasedNotificationsWorkflow, [
        {
          hackathonId: input.hackathonId,
          hackathonName: input.hackathon.name,
          hackathonSlug: input.hackathon.slug,
          recipientRoles: ["participant"],
          challenges: input.challenges,
        },
      ]).catch((err) => {
        console.error(
          `Failed to start challenges-released workflow for ${input.hackathonId}:`,
          err
        )
      })
    } catch (err) {
      console.error(
        `Failed to dispatch challenges-released emails for ${input.hackathonId}:`,
        err
      )
    }
  }

  try {
    const { triggerWebhooks } = await import("@/lib/services/webhooks")
    triggerWebhooks(input.tenantId, "hackathon.challenges_released", {
      event: "hackathon.challenges_released",
      timestamp: new Date().toISOString(),
      data: {
        hackathonId: input.hackathonId,
        trigger: input.trigger,
        challengeCount: input.challenges.length,
        source: "standalone",
      },
    }).catch(console.error)
  } catch (err) {
    console.error(
      `Failed to trigger challenges-released webhook for ${input.hackathonId}:`,
      err
    )
  }
}
