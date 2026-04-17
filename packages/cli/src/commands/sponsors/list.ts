import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { Sponsor } from "../../types.js"

export async function runSponsorsList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon sponsors list <hackathon-id>")
    process.exit(1)
  }

  const data = await client.get<{ sponsors: Sponsor[] }>(
    `/api/dashboard/hackathons/${hackathonId}/sponsors`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.sponsors?.length) {
    console.log("No sponsors found.")
    return
  }

  console.log(
    formatTable(data.sponsors, [
      { key: "name", label: "Name" },
      { key: "tier", label: "Tier" },
      { key: "websiteUrl", label: "Website" },
      { key: "id", label: "ID" },
    ])
  )
}
