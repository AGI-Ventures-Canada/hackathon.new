/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — types.ts needs regeneration via `bun update-types` after DB migrations
import { supabase as getSupabase } from "@/lib/db/client"
import type { Webhook, WebhookDelivery, WebhookEvent } from "@/lib/db/hackathon-types"
import type { Json } from "@/lib/db/types"
import {
  fetchAllowedWebhookUrl,
  isAllowedHttpsUrl,
  redactFetchErrorForLogs,
  readResponseText,
} from "@/lib/utils/safe-fetch-url"
import { generateWebhookSecret, signWebhookPayload } from "./encryption"

export type CreateWebhookInput = {
  tenantId: string
  url: string
  events: WebhookEvent[]
}

export interface WebhookDeliveryResult {
  success: boolean
  status?: number
  body?: string
  error?: string
}

export type WebhookDeliveryOptions = {
  idempotencyKey?: string
}

export type TriggerWebhooksOptions = WebhookDeliveryOptions & {
  requireRecorded?: boolean
}

export async function createWebhook(
  input: CreateWebhookInput
): Promise<{ webhook: Webhook; secret: string } | null> {
  if (!isAllowedHttpsUrl(input.url)) return null

  const secret = generateWebhookSecret()

  const { data, error } = await getSupabase()
    .from("webhooks")
    .insert({
      tenant_id: input.tenantId,
      url: input.url,
      secret,
      events: input.events,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to create webhook:", error)
    return null
  }

  return { webhook: data as Webhook, secret }
}

export async function getWebhookById(webhookId: string): Promise<Webhook | null> {
  const { data } = await getSupabase()
    .from("webhooks")
    .select("*")
    .eq("id", webhookId)
    .single()

  return data as Webhook | null
}

export async function listWebhooks(tenantId: string): Promise<Webhook[]> {
  const { data } = await getSupabase()
    .from("webhooks")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })

  return (data as Webhook[] | null) ?? []
}

export async function listActiveWebhooks(
  tenantId: string,
  event: WebhookEvent,
  options: { throwOnError?: boolean } = {},
): Promise<Webhook[]> {
  const { data, error } = await getSupabase()
    .from("webhooks")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .contains("events", [event])

  if (error) {
    if (options.throwOnError) {
      throw new Error(`Failed to list active webhooks: ${error.message}`)
    }
    return []
  }

  return (data as Webhook[] | null) ?? []
}

export async function deleteWebhook(
  webhookId: string,
  tenantId: string
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("webhooks")
    .delete()
    .eq("id", webhookId)
    .eq("tenant_id", tenantId)
    .select("id")

  if (error) {
    console.error("Failed to delete webhook:", error)
    return false
  }

  return (data ?? []).length > 0
}

export async function disableWebhook(webhookId: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from("webhooks")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", webhookId)

  if (error) {
    console.error("Failed to disable webhook:", error)
    return false
  }

  return true
}

export async function incrementFailureCount(webhookId: string): Promise<boolean> {
  const { data: webhook } = await getSupabase()
    .from("webhooks")
    .select("failure_count")
    .eq("id", webhookId)
    .single()

  if (!webhook) return false

  const { error } = await getSupabase()
    .from("webhooks")
    .update({
      failure_count: (webhook.failure_count ?? 0) + 1,
      last_failure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", webhookId)

  return !error
}

export async function resetFailureCount(webhookId: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from("webhooks")
    .update({
      failure_count: 0,
      last_success_at: new Date().toISOString(),
      last_triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", webhookId)

  return !error
}

export async function recordDelivery(
  webhookId: string,
  event: WebhookEvent,
  payload: Json,
  result: WebhookDeliveryResult,
  attempt: number
): Promise<WebhookDelivery | null> {
  const { data, error } = await getSupabase()
    .from("webhook_deliveries")
    .insert({
      webhook_id: webhookId,
      event,
      payload,
      response_status: result.status ?? null,
      response_body: result.body ?? result.error ?? null,
      attempt,
      delivered_at: result.success ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to record delivery:", error)
    return null
  }

  return data as WebhookDelivery
}

async function hasSuccessfulDelivery(
  webhookId: string,
  event: WebhookEvent,
  idempotencyKey: string,
  throwOnError: boolean,
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("webhook_deliveries")
    .select("id")
    .eq("webhook_id", webhookId)
    .eq("event", event)
    .not("delivered_at", "is", null)
    .contains("payload", { idempotencyKey })
    .limit(1)

  if (error) {
    if (throwOnError) {
      throw new Error(`Failed to check webhook delivery history: ${error.message}`)
    }
    return false
  }

  return Boolean(data?.length)
}

export async function deliverWebhook(
  webhook: Webhook,
  event: WebhookEvent,
  payload: Json,
  options: WebhookDeliveryOptions = {},
): Promise<WebhookDeliveryResult> {
  if (!isAllowedHttpsUrl(webhook.url)) {
    return { success: false, error: "Unsafe webhook URL" }
  }

  const body = JSON.stringify(payload)
  const signature = signWebhookPayload(webhook.secret, body)

  try {
    const response = await fetchAllowedWebhookUrl(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": event,
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": new Date().toISOString(),
        ...(options.idempotencyKey
          ? { "X-Webhook-Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body,
    })
    if (!response) return { success: false, error: "Unsafe webhook URL" }

    const responseBody = await readResponseText(response, 64 * 1024)
    if (responseBody === null) {
      return { success: false, status: response.status, error: "Webhook response was too large" }
    }

    if (response.ok) {
      await resetFailureCount(webhook.id)
      return { success: true, status: response.status, body: responseBody }
    }

    return { success: false, status: response.status, body: responseBody }
  } catch (err) {
    return {
      success: false,
      error: redactFetchErrorForLogs(err, [webhook.url]).message,
    }
  }
}

export async function triggerWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: Json,
  options: TriggerWebhooksOptions = {},
): Promise<void> {
  const webhooks = await listActiveWebhooks(tenantId, event, {
    throwOnError: options.requireRecorded,
  })
  let unrecorded = false

  for (const webhook of webhooks) {
    if (
      options.idempotencyKey &&
      await hasSuccessfulDelivery(
        webhook.id,
        event,
        options.idempotencyKey,
        options.requireRecorded === true,
      )
    ) continue

    const result = await deliverWebhook(webhook, event, payload, options)
    const delivery = await recordDelivery(webhook.id, event, payload, result, 1)

    if (!result.success) {
      await incrementFailureCount(webhook.id)
    }
    if (!delivery) unrecorded = true
  }

  if (options.requireRecorded && unrecorded) {
    throw new Error("One or more webhook delivery attempts could not be recorded")
  }
}
