import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { JudgingCriteria } from "../../types.js"

export async function runCriteriaList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  const data = await client.get<{ criteria: JudgingCriteria[] }>(
    `/api/dashboard/hackathons/${hackathonId}/core-criteria`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.criteria?.length) {
    console.log("No judging criteria found.")
    return
  }

  console.log(
    formatTable(data.criteria, [
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "maxScore", label: "Max Score" },
      { key: "weight", label: "Weight" },
      { key: "description", label: "Description" },
    ])
  )
}
