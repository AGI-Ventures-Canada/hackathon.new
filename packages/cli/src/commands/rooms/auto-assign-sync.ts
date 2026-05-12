import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"

interface SyncResult {
  submissionsProcessed: number
  totalAssignmentsCreated: number
  reasonCounts: Record<string, number>
  skipped?: "hackathon_status"
}

export async function runRoomsAutoAssignSync(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon rooms auto-assign sync <hackathon-id>")
    process.exit(1)
  }

  const result = await client.post<SyncResult>(
    `/api/dashboard/hackathons/${hackathonId}/auto-assign-by-room/sync`
  )

  if (options.json) {
    console.log(formatJson(result))
    return
  }

  if (result.skipped === "hackathon_status") {
    console.log("Skipped: hackathon is not live yet. Flip it to active first.")
    return
  }

  const created = result.totalAssignmentsCreated
  const processed = result.submissionsProcessed
  if (created === 0 && processed === 0) {
    console.log("Nothing to sync. No submissions in any room yet.")
    return
  }
  if (created === 0) {
    console.log(
      `Checked ${processed} submission${processed === 1 ? "" : "s"} — all judges already had them.`
    )
    return
  }
  console.log(
    formatSuccess(
      `Synced ${created} judge assignment${created === 1 ? "" : "s"} across ${processed} submission${processed === 1 ? "" : "s"}.`
    )
  )
}
