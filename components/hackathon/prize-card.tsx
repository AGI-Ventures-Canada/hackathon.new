import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import type { PrizeType, PrizeJudgingStyle, HackathonStatus } from "@/lib/db/hackathon-types"

interface PrizeCardProps {
  name: string
  description: string | null
  value: string | null
  type: PrizeType
  judgingStyle: PrizeJudgingStyle | null
  winner?: {
    submissionTitle: string
    teamName: string | null
  } | null
  hackathonSlug?: string
  hackathonStatus?: HackathonStatus
}

const judgingStyleLabels: Record<PrizeJudgingStyle, string> = {
  bucket_sort: "Judged",
  gate_check: "Gate Check",
  crowd_vote: "Crowd Vote",
  judges_pick: "Judge's Pick",
  weighted_score: "Weighted",
}

const typeLabels: Record<PrizeType, string> = {
  score: "Judged",
  criteria: "Judged",
  favorite: "Judged",
  crowd: "Crowd Vote",
}

function getBadgeLabel(judgingStyle: PrizeJudgingStyle | null, type: PrizeType): string {
  if (judgingStyle) return judgingStyleLabels[judgingStyle]
  return typeLabels[type]
}

export function PrizeCard({ name, description, value, type, judgingStyle, winner, hackathonSlug, hackathonStatus }: PrizeCardProps) {
  const isCrowd = judgingStyle === "crowd_vote" || type === "crowd"
  const showCrowdLink =
    isCrowd &&
    hackathonSlug &&
    hackathonStatus &&
    ["active", "judging"].includes(hackathonStatus)

  const badgeLabel = getBadgeLabel(judgingStyle, type)

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <h3 className="font-semibold leading-tight">{name}</h3>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>
        {showCrowdLink ? (
          <Link href={`/e/${hackathonSlug}/vote`}>
            <Badge variant="secondary" className="shrink-0 text-xs hover:bg-secondary/80 cursor-pointer">
              {badgeLabel}
            </Badge>
          </Link>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {badgeLabel}
          </Badge>
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
