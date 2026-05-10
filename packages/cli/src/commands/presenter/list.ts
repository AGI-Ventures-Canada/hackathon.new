import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { PresenterView } from "../../types.js"

export async function runPresenterList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon presenter list <hackathon-id>")
    process.exit(1)
  }

  const data = await client.get<{ views: PresenterView[] }>(
    `/api/dashboard/hackathons/${hackathonId}/presenter-views`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.views?.length) {
    console.log("No saved presenter views.")
    return
  }

  console.log(
    formatTable(
      data.views.map((v) => ({
        id: v.id,
        name: v.name,
        kind: v.config.kind,
        target:
          v.config.kind === "round_finalists"
            ? `round=${v.config.roundId}`
            : `${v.config.submissionIds.length} project(s)`,
        updated_at: v.updated_at,
      })),
      [
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "kind", label: "Kind" },
        { key: "target", label: "Target" },
        { key: "updated_at", label: "Updated" },
      ]
    )
  )
}
