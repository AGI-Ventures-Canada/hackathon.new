interface PrizeCardProps {
  name: string
  description: string | null
  value: string | null
  winner?: {
    submissionTitle: string
    teamName: string | null
  } | null
}

export function PrizeCard({ name, description, value, winner }: PrizeCardProps) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="space-y-1 min-w-0">
        <h3 className="font-semibold leading-tight">{name}</h3>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
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
