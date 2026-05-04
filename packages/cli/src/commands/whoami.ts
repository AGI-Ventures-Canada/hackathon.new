import type { OatmealClient } from "../client.js"
import { formatDetail, formatJson } from "../output.js"
import type { WhoAmIResponse } from "../types.js"
import { formatWorkspace } from "../workspace.js"

export async function runWhoAmI(
  client: OatmealClient,
  options: { json?: boolean }
): Promise<void> {
  const whoami = await client.get<WhoAmIResponse>("/api/v1/whoami")

  if (options.json) {
    console.log(formatJson(whoami))
    return
  }

  console.log(
    formatDetail([
      { label: "Workspace", value: formatWorkspace(whoami) },
      { label: "Tenant ID", value: whoami.tenantId },
      { label: "Key ID", value: whoami.keyId },
      { label: "Key Name", value: whoami.keyName ?? undefined },
      { label: "Scopes", value: whoami.scopes.join(", ") },
    ])
  )
}
