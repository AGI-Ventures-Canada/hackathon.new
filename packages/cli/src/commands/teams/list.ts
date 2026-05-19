import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { Team } from "../../types.js"

export async function runTeamsList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon teams list <hackathon-id>")
    process.exit(1)
  }

  const data = await client.get<{ teams: Team[] }>(
    `/api/dashboard/hackathons/${hackathonId}/teams`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.teams?.length) {
    console.log("No teams found.")
    return
  }

  const rows = data.teams.map((t) => ({
    name: t.name,
    status: t.status ?? "—",
    mode: t.mode ?? "—",
    members: t.members?.length ?? 0,
    room: t.roomName ?? "—",
    id: t.id,
  }))

  console.log(
    formatTable(rows, [
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
      { key: "mode", label: "Mode" },
      { key: "members", label: "Members" },
      { key: "room", label: "Room" },
      { key: "id", label: "ID" },
    ])
  )
}
