"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Lock } from "lucide-react"
import { assertOkJson } from "@/lib/utils/fetch"

type SummaryEntry = {
  submissionId: string
  title: string
  teamName: string | null
  score: number
}

type Summary =
  | { unlocked: false; total: number; completed: number }
  | {
      unlocked: true
      total: number
      completed: number
      prizeRankings: { prizeId: string; prizeName: string; top: SummaryEntry[] }[]
      coreRanking: { top: SummaryEntry[] }
    }

interface JudgeSummaryViewProps {
  hackathonSlug: string
}

export function JudgeSummaryView({ hackathonSlug }: JudgeSummaryViewProps) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/public/hackathons/${hackathonSlug}/judging/my-summary`)
      .then(assertOkJson<Summary>)
      .then((data) => {
        if (!cancelled) {
          setSummary(data)
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [hackathonSlug])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!summary) return null

  if (!summary.unlocked) {
    const remaining = Math.max(0, summary.total - summary.completed)
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4" />
              Locked
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Finish {remaining} more {remaining === 1 ? "project" : "projects"} to unlock your top picks.
            </p>
            <p className="text-xs text-muted-foreground">
              Done {summary.completed} of {summary.total}.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/e/${hackathonSlug}/judge`}>Back to projects</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const cards: { title: string; entries: SummaryEntry[] }[] = [
    ...summary.prizeRankings.map((p) => ({
      title: `Your top 3 for ${p.prizeName}`,
      entries: p.top,
    })),
    {
      title: "Your top 3 overall (without sponsors)",
      entries: summary.coreRanking.top,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader>
            <CardTitle className="text-base">{card.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {card.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No projects to rank.</p>
            ) : (
              <ol className="space-y-2">
                {card.entries.map((e, i) => (
                  <li key={e.submissionId} className="flex items-start gap-3">
                    <span className="text-sm font-medium tabular-nums w-6 text-muted-foreground">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{e.title}</div>
                      {e.teamName && (
                        <div className="text-xs text-muted-foreground truncate">{e.teamName}</div>
                      )}
                    </div>
                    <span className="text-sm font-medium tabular-nums">{e.score.toFixed(2)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
