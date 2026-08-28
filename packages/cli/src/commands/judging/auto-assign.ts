import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Prize } from "../../types.js"

interface AutoAssignOptions {
  perJudge?: number
  json?: boolean
}

export function parseAutoAssignOptions(args: string[]): AutoAssignOptions {
  const options: AutoAssignOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--per-judge":
        options.perJudge = parseInt(args[++i], 10)
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runAutoAssign(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  const options = parseAutoAssignOptions(args)

  if (!options.perJudge) {
    console.error("Error: --per-judge is required")
    process.exit(1)
  }

  const { prizes } = await client.get<{ prizes: Prize[] }>(
    `/api/dashboard/hackathons/${hackathonId}/prizes`,
  )
  const assignablePrizes = prizes.filter(
    (prize) =>
      (prize.judgingStyle ?? prize.judging_style) !== "weighted_score" &&
      (prize.judgingStyle ?? prize.judging_style) !== "crowd_vote",
  )
  const assignments = await Promise.all(
    assignablePrizes.map((prize) =>
      client.post<{ assignedCount: number }>(
        `/api/dashboard/hackathons/${hackathonId}/prizes/${prize.id}/auto-assign`,
        { submissionsPerJudge: options.perJudge },
      ),
    ),
  )
  const result = {
    created: assignments.reduce((total, item) => total + item.assignedCount, 0),
    prizeCount: assignablePrizes.length,
  }

  if (options.json) {
    console.log(formatJson(result))
    return
  }

  console.log(formatSuccess(`Created ${result.created} assignments`))
}
