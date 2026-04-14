import type { OatmealClient } from "../../client.js"
import { formatDetail, formatJson } from "../../output.js"
import type { Hackathon } from "../../types.js"
import { resolveHackathonId } from "./resolve.js"

export async function runHackathonsGet(
  client: OatmealClient,
  idOrSlug: string,
  options: { json?: boolean }
): Promise<void> {
  if (!idOrSlug) {
    console.error("Usage: hackathon events get <id-or-slug>")
    process.exit(1)
  }

  const id = await resolveHackathonId(client, idOrSlug)
  const hackathon = await client.get<Hackathon>(`/api/dashboard/hackathons/${id}`)

  if (options.json) {
    console.log(formatJson(hackathon))
    return
  }

  console.log(
    formatDetail([
      { label: "ID", value: hackathon.id },
      { label: "Name", value: hackathon.name },
      { label: "Slug", value: hackathon.slug },
      { label: "Status", value: hackathon.status },
      { label: "Description", value: hackathon.description },
      { label: "Starts", value: hackathon.startsAt },
      { label: "Ends", value: hackathon.endsAt },
      { label: "Created", value: hackathon.createdAt },
    ])
  )
}
