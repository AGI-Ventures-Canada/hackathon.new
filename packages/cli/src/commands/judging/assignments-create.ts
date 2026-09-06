import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"

interface AssignmentCreateOptions {
  judge?: string
  submission?: string
  prize?: string
  json?: boolean
}

export function parseAssignmentCreateOptions(args: string[]): AssignmentCreateOptions {
  const options: AssignmentCreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--judge":
        options.judge = args[++i]
        break
      case "--submission":
        options.submission = args[++i]
        break
      case "--prize":
        options.prize = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runAssignmentsCreate(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  const options = parseAssignmentCreateOptions(args)

  if (!options.judge || !options.submission) {
    console.error("Error: --judge and --submission are required")
    process.exit(1)
  }

  const assignment = await client.post<{ success: boolean; alreadyAssigned?: boolean }>(
    options.prize
      ? `/api/dashboard/hackathons/${hackathonId}/judging/judges/${encodeURIComponent(options.judge)}/submissions/${encodeURIComponent(options.submission)}?prizeId=${encodeURIComponent(options.prize)}`
      : `/api/dashboard/hackathons/${hackathonId}/judging/assignments`,
    options.prize ? {} : { judgeParticipantId: options.judge, submissionId: options.submission }
  )

  if (options.json) {
    console.log(formatJson(assignment))
    return
  }

  console.log(formatSuccess(assignment.alreadyAssigned ? "This project is already assigned" : "Assigned this project"))
}
