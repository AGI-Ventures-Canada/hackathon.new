import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

interface UpdateMembersOptions {
  add?: string
  remove?: string
}

export async function runTeamsUpdateMembers(
  client: OatmealClient,
  hackathonId: string,
  teamId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !teamId) {
    console.error("Usage: hackathon teams update-members <hackathon-id> <team-id> --add email1,email2 --remove email3")
    process.exit(1)
  }

  const options: UpdateMembersOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--add":
        options.add = args[++i]
        break
      case "--remove":
        options.remove = args[++i]
        break
    }
  }

  const add = options.add?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  const remove = options.remove?.split(",").map((s) => s.trim()).filter(Boolean) ?? []

  if (add.length === 0 && remove.length === 0) {
    console.error("Error: provide --add or --remove with at least one email")
    process.exit(1)
  }

  const body: Record<string, unknown> = {}
  if (add.length) body.add = add
  if (remove.length) body.remove = remove

  await client.patch(
    `/api/dashboard/hackathons/${hackathonId}/teams/${teamId}/members`,
    body
  )

  const parts: string[] = []
  if (add.length) parts.push(`added ${add.length}`)
  if (remove.length) parts.push(`removed ${remove.length}`)
  console.log(formatSuccess(`Updated team members: ${parts.join(", ")}`))
}
