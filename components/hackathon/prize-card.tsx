import Link from "next/link"
import { Vote } from "lucide-react"
import type { HackathonStatus, PrizeJudgingStyle, PrizeType } from "@/lib/db/hackathon-types"

interface PrizeCardProps {
  name: string
  description: string | null
  value: string | null
  type?: PrizeType
  judgingStyle?: PrizeJudgingStyle | null
  hackathonSlug?: string
  hackathonStatus?: HackathonStatus
  winner?: {
    submissionTitle: string
    teamName: string | null
  } | null
}

export function PrizeCard({
  name,
  description,
  value,
  type,
  judgingStyle,
  hackathonSlug,
  hackathonStatus,
  winner,
}: PrizeCardProps) {
  const isCrowd = judgingStyle === "crowd_vote" || type === "crowd"
  const showVoteLink =
    isCrowd &&
    hackathonSlug &&
    hackathonStatus &&
    ["active", "judging"].includes(hackathonStatus)

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <h3 className="font-semibold leading-tight">{name}</h3>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>
        {showVoteLink && (
          <Link
            href={`/e/${hackathonSlug}/vote`}
            className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Vote className="size-3" />
            Vote
          </Link>
        )}
      </div>
      {value && (
        <p className="text-sm font-medium">{value}</p>
      )}
      {winner && (
        <div className="pt-1 border-t">
          <p className="text-xs text-muted-foreground">
            Winner: <span className="font-medium text-foreground">{winner.submissionTitle}</span>
            {winner.teamName && <> by {winner.teamName}</>}
          </p>
        </div>
      )}
    </div>
  )
}
