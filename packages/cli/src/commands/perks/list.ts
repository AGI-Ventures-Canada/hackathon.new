import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { Perk } from "../../types.js"

export async function runPerksList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  const data = await client.get<{ perks: Perk[] }>(
    `/api/dashboard/hackathons/${hackathonId}/perks`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.perks?.length) {
    console.log("No perks found.")
    return
  }

  const rows = data.perks.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.releasedAt
      ? "released"
      : p.scheduledReleaseAt
        ? `scheduled ${new Date(p.scheduledReleaseAt).toISOString().slice(0, 16).replace("T", " ")}`
        : "default (event start)",
  }))

  console.log(
    formatTable(rows, [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "status", label: "Release" },
    ])
  )
}
