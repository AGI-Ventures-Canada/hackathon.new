import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { Webhook } from "../../types.js"

export async function runWebhooksList(
  client: OatmealClient,
  options: { json?: boolean }
): Promise<void> {
  const data = await client.get<{ webhooks: Webhook[] }>("/api/v1/webhooks")

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.webhooks?.length) {
    console.log("No webhooks found.")
    return
  }

  const rows = data.webhooks.map((w) => ({
    ...w,
    events_list: w.events.join(", "),
    active_str: w.isActive ? "Active" : "Inactive",
  }))

  console.log(
    formatTable(rows, [
      { key: "id", label: "ID" },
      { key: "url", label: "URL" },
      { key: "events_list", label: "Events" },
      { key: "active_str", label: "Status" },
    ])
  )
}
