import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess, formatWarning } from "../../output.js"
import type { Webhook } from "../../types.js"

interface WebhookCreateOptions {
  url?: string
  events?: string[]
  json?: boolean
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function parseWebhookCreateOptions(args: string[]): WebhookCreateOptions {
  const options: WebhookCreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        options.url = args[++i]
        break
      case "--events":
        options.events = args[++i]?.split(",").map((s) => s.trim())
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runWebhooksCreate(
  client: OatmealClient,
  args: string[]
): Promise<void> {
  const options = parseWebhookCreateOptions(args)

  let url = options.url
  let events = options.events

  if (!url && process.stdout.isTTY) {
    const result = await p.text({ message: "Webhook URL:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(result)) return
    url = result
  }

  if (!url) {
    console.error("Error: --url is required")
    process.exit(1)
  }

  if (!events?.length && process.stdout.isTTY) {
    const result = await p.text({ message: "Events (comma-separated):" })
    if (p.isCancel(result)) return
    events = result.split(",").map((s: string) => s.trim())
  }

  const webhook = await client.post<Webhook>("/api/v1/webhooks", {
    url: normalizeUrl(url),
    events,
  })

  if (options.json) {
    console.log(formatJson(webhook))
    return
  }

  console.log(formatSuccess(`Created webhook ${webhook.id}`))
  if (webhook.secret) {
    console.log(formatWarning("Save this signing secret — it won't be shown again:"))
    console.log(webhook.secret)
  }
}
