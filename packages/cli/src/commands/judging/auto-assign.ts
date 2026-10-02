import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Prize } from "../../types.js"
import { runJudgingDistribution } from "./workspace.js"

export function parseAutoAssignOptions(args: string[]): { perJudge?: number; json?: boolean } {
  const index = args.indexOf("--per-judge")
  return { ...(index >= 0 ? { perJudge: Number(args[index + 1]) } : {}), ...(args.includes("--json") ? { json: true } : {}) }
}

export async function runAutoAssign(client: OatmealClient, hackathonId: string, args: string[]): Promise<void> {
  const options = parseAutoAssignOptions(args)
  if (options.perJudge === undefined) {
    await runJudgingDistribution(client, args.includes("--expected-version") ? "apply" : "preview", hackathonId, args)
    return
  }
  if (!Number.isInteger(options.perJudge) || options.perJudge < 1 || options.perJudge > 1000) throw new Error("--per-judge must be between 1 and 1,000")
  const { prizes } = await client.get<{ prizes: Prize[] }>(`/api/dashboard/hackathons/${hackathonId}/prizes`)
  let created = 0
  let prizeCount = 0
  for (const prize of prizes) {
    const style = prize.judgingStyle ?? prize.judging_style
    if (!style || style === "crowd_vote") continue
    const result = await client.post<{ assignedCount: number }>(`/api/dashboard/hackathons/${hackathonId}/prizes/${prize.id}/auto-assign`, { submissionsPerJudge: options.perJudge })
    created += result.assignedCount
    prizeCount++
  }
  console.log(options.json ? formatJson({ created, prizeCount }) : formatSuccess(`Created ${created} project reviews`))
}
