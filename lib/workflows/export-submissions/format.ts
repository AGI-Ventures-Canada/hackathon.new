import type {
  ExportSubmissionRow,
  ExportUserDirectory,
} from "@/lib/services/submission-exports"
import { isClerkUserId, isLikelyEmail } from "@/lib/utils/person-display"

function formatPerson(
  user: { name: string | null; email: string | null } | null | undefined,
  fallback: string
): string {
  const name = user?.name?.trim()
  const email = user?.email?.trim()
  const hasRealName = !!name && !isClerkUserId(name) && !isLikelyEmail(name)

  if (hasRealName && email) return `${name} <${email}>`
  if (hasRealName) return name as string
  if (email) return email
  return fallback
}

export function formatMemberLabel(
  member: { clerkUserId: string; role: string },
  users: ExportUserDirectory
): string {
  const label = formatPerson(users[member.clerkUserId], "Unknown member")
  const role = member.role !== "participant" ? ` (${member.role})` : ""
  return `${label}${role}`
}

export function formatMembers(
  submission: ExportSubmissionRow,
  users: ExportUserDirectory
): string {
  const members = submission.team?.members ?? []
  return members.map((m) => formatMemberLabel(m, users)).join(" | ")
}

export function formatJudgeLabel(
  judgeClerkUserId: string | null,
  users: ExportUserDirectory
): string {
  const user = judgeClerkUserId ? users[judgeClerkUserId] : null
  return formatPerson(user, "Unknown judge")
}

export function formatScores(
  submission: ExportSubmissionRow,
  users: ExportUserDirectory
): string {
  return submission.scores
    .map((s) => {
      const judge = formatJudgeLabel(s.judgeClerkUserId ?? null, users)
      return `${judge} — ${s.criteriaName}: ${s.score}`
    })
    .join(" | ")
}

export function formatJudgeNotes(
  submission: ExportSubmissionRow,
  users: ExportUserDirectory
): string {
  return submission.judgeNotes
    .map((n) => {
      const judge = formatJudgeLabel(n.judgeClerkUserId ?? null, users)
      return `[${judge}] ${n.notes}`
    })
    .join(" || ")
}
