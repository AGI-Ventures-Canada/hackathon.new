/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — types.ts needs regeneration via `bun update-types` after DB migrations
import { supabase as getSupabase } from "@/lib/db/client"
import type { Webhook, WebhookDelivery, WebhookEvent } from "@/lib/db/hackathon-types"
import type { Json } from "@/lib/db/types"
import { isAllowedHttpsUrl, readResponseText } from "@/lib/utils/safe-fetch-url"
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
  event: WebhookEvent
): Promise<Webhook[]> {
  const { data } = await getSupabase()
    .from("webhooks")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .contains("events", [event])

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

export async function deliverWebhook(
  webhook: Webhook,
  event: WebhookEvent,
  payload: Json
): Promise<WebhookDeliveryResult> {
  if (!isAllowedHttpsUrl(webhook.url)) {
    return { success: false, error: "Unsafe webhook URL" }
  }

  const body = JSON.stringify(payload)
  const signature = signWebhookPayload(webhook.secret, body)

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": event,
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": new Date().toISOString(),
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    })

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
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export async function triggerWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: Json
): Promise<void> {
  const webhooks = await listActiveWebhooks(tenantId, event)

  for (const webhook of webhooks) {
    const result = await deliverWebhook(webhook, event, payload)
    await recordDelivery(webhook.id, event, payload, result, 1)

    if (!result.success) {
      await incrementFailureCount(webhook.id)
    }
  }
}
