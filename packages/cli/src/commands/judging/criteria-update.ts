import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { JudgingCriteria } from "../../types.js"

interface CriteriaUpdateOptions {
  name?: string
  description?: string
  minScore?: number
  maxScore?: number
  weight?: number
  category?: "core" | "bonus"
  json?: boolean
}

export function parseCriteriaUpdateOptions(args: string[]): CriteriaUpdateOptions {
  const options: CriteriaUpdateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i]
        break
      case "--description":
        options.description = args[++i]
        break
      case "--min-score":
        options.minScore = Number(args[++i])
        break
      case "--max-score":
        options.maxScore = parseInt(args[++i], 10)
        break
      case "--weight":
        options.weight = parseFloat(args[++i])
        break
      case "--category":
        options.category = args[++i] as "core" | "bonus"
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runCriteriaUpdate(
  client: OatmealClient,
  hackathonId: string,
  criteriaId: string,
  args: string[]
): Promise<void> {
  if (!criteriaId) {
    console.error("Usage: hackathon judging criteria update <hackathon-id> <criteria-id> [--name ...] [--category ...]")
    process.exit(1)
  }

  const options = parseCriteriaUpdateOptions(args)

  if (options.category !== undefined && options.category !== "core" && options.category !== "bonus") {
    console.error("Error: --category must be 'core' or 'bonus'")
    process.exit(1)
  }

  const body: Record<string, unknown> = {}
  if (options.name) body.name = options.name
  if (options.description !== undefined) body.description = options.description
  if (options.category === "bonus") throw new Error("Prize bonus categories need a prize. Use judging scorecards update <event> <prize> --file scorecard.json")
  if (options.minScore !== undefined) body.minScore = options.minScore
  if (options.maxScore !== undefined) body.maxScore = options.maxScore
  if (options.weight !== undefined) body.weight = options.weight

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const response = await client.patch<{ criterion: JudgingCriteria } | JudgingCriteria>(
    `/api/dashboard/hackathons/${hackathonId}/core-criteria/${criteriaId}`,
    body
  )

  const criteria = "criterion" in response ? response.criterion : response

  if (options.json) {
    console.log(formatJson(criteria))
    return
  }

  console.log(formatSuccess(`Updated criteria "${criteria.name}"`))
}
