import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess, formatWarning } from "../../output.js"
import type { JudgeAddResponse } from "../../types.js"
import { formatQueueReason } from "../../notification-delivery.js"

interface JudgesAddOptions {
  email?: string
  userId?: string
  json?: boolean
}

export function parseJudgesAddOptions(args: string[]): JudgesAddOptions {
  const options: JudgesAddOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--email":
        options.email = args[++i]
        break
      case "--user-id":
        options.userId = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runJudgesAdd(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  const options = parseJudgesAddOptions(args)

  if (!options.email && !options.userId) {
    console.error("Error: provide --email or --user-id")
    process.exit(1)
  }

  const body: Record<string, string> = {}
  if (options.email) body.email = options.email
  if (options.userId) body.clerkUserId = options.userId

  const response = await client.post<JudgeAddResponse>(
    `/api/dashboard/hackathons/${hackathonId}/judging/judges`,
    body
  )

  if (options.json) {
    console.log(formatJson(response))
    return
  }

  if (options.email && response.invitation) {
    if (response.delivery === "failed") {
      console.log(formatWarning(`Saved judge invitation for ${response.invitation.email}, but email delivery could not be confirmed`))
      return
    }

    const message = response.queued
      ? `Saved judge invitation for ${response.invitation.email}. ${formatQueueReason(response.queueReason)}`
      : `Sent judge invitation to ${response.invitation.email}`
    console.log(formatSuccess(message))
    return
  }

  const judge = response.participant
  const judgeLabel = judge?.name ?? judge?.email ?? judge?.id ?? options.userId ?? options.email
  if (response.delivery === "failed") {
    console.log(formatWarning(`Added judge ${judgeLabel}, but email delivery could not be confirmed`))
    return
  }
  const message = response.queued
    ? `Added judge ${judgeLabel}. ${formatQueueReason(response.queueReason)}`
    : `Added judge ${judgeLabel}`
  console.log(formatSuccess(message))
}
