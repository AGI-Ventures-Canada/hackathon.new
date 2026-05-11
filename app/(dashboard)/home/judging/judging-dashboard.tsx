"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  Scale,
  CheckCircle2,
  ClipboardList,
  Clock,
  ArrowRight,
  Compass,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { HackathonCard } from "@/components/hackathon/hackathon-card"
import type { JudgeHackathonStats } from "@/lib/services/persona-stats"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

type Hackathon = {
  id: string
  slug: string
  name: string
  description: string | null
  status: HackathonStatus
  registration_opens_at: string | null
  registration_closes_at: string | null
  starts_at: string | null
  ends_at: string | null
}

type Props = {
  hackathons: Hackathon[]
  judgeStats: Record<string, JudgeHackathonStats>
  showHeader?: boolean
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className="flex size-10 items-center justify-center rounded-md bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

const JUDGING_ACTIVE: HackathonStatus[] = ["active", "judging"]
const PAST_STATUSES: HackathonStatus[] = ["completed", "archived"]

export function JudgingDashboard({ hackathons, judgeStats, showHeader = true }: Props) {
  const statsMap = useMemo(
    () => new Map(Object.entries(judgeStats)),
    [judgeStats],
  )

  const { needsAction, upcoming, past } = useMemo(() => {
    const now = new Date()
    const needsAction: Hackathon[] = []
    const upcoming: Hackathon[] = []
    const past: Hackathon[] = []

    for (const h of hackathons) {
      const endsAt = h.ends_at ? new Date(h.ends_at) : null
      if (PAST_STATUSES.includes(h.status) || (endsAt && endsAt < now && !JUDGING_ACTIVE.includes(h.status))) {
        past.push(h)
      } else if (JUDGING_ACTIVE.includes(h.status)) {
        const s = statsMap.get(h.id)
        if (s && s.totalAssignments > 0 && s.completedAssignments < s.totalAssignments) {
          needsAction.push(h)
        } else {
          upcoming.push(h)
        }
      } else {
        upcoming.push(h)
      }
    }

    past.sort((a, b) => {
      if (!a.ends_at && !b.ends_at) return 0
      if (!a.ends_at) return 1
      if (!b.ends_at) return -1
      return new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime()
    })

    return { needsAction, upcoming, past }
  }, [hackathons, statsMap])

  const totals = useMemo(() => {
    let total = 0
    let completed = 0
    for (const s of statsMap.values()) {
      total += s.totalAssignments
      completed += s.completedAssignments
    }
    return { events: hackathons.length, total, completed }
  }, [hackathons, statsMap])

  const completionPct = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0

  if (hackathons.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Scale className="size-10 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No judging assignments</CardTitle>
          <CardDescription className="mb-6 max-w-sm">
            When you&apos;re invited to judge a hackathon, your assignments will appear here
          </CardDescription>
          <Button asChild variant="outline">
            <Link href="/browse">
              <Compass className="mr-2 size-4" />
              Browse hackathons
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {showHeader && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Judging</h1>
          <p className="text-muted-foreground mt-1">Your review queue</p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events" value={totals.events} icon={Scale} />
        <StatCard label="Assigned" value={totals.total} icon={ClipboardList} />
        <StatCard label="Completed" value={totals.completed} icon={CheckCircle2} />
        <StatCard label="Completion" value={`${completionPct}%`} icon={Clock} />
      </div>

      {totals.total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-medium tabular-nums">{totals.completed} / {totals.total}</span>
          </div>
          <Progress value={completionPct} className="h-2" />
        </div>
      )}

      {needsAction.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <h2 className="text-sm font-semibold">Pending reviews</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {needsAction.map((h) => {
              const s = statsMap.get(h.id)
              const pct = s && s.totalAssignments > 0 ? Math.round((s.completedAssignments / s.totalAssignments) * 100) : 0
              return (
                <Link
                  key={h.id}
                  href={`/e/${h.slug}`}
                  className="group flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 transition-colors hover:border-primary/40 hover:bg-primary/10"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <h3 className="truncate font-semibold">{h.name}</h3>
                    {s && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{s.completedAssignments} / {s.totalAssignments} reviewed</span>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    )}
                  </div>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left group">
            <h2 className="text-sm font-medium text-muted-foreground">Upcoming</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{upcoming.length}</span>
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((h) => {
                const s = statsMap.get(h.id)
                return (
                  <div key={h.id}>
                    <HackathonCard
                      hackathon={h}
                      href={`/e/${h.slug}`}
                      extras={
                        s && s.totalAssignments > 0 ? (
                          <Badge variant="secondary">
                            {s.completedAssignments} / {s.totalAssignments} reviewed
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Scale className="mr-1 size-3" />
                            Judge
                          </Badge>
                        )
                      }
                    />
                  </div>
                )
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {past.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left group">
            <h2 className="text-sm font-medium text-muted-foreground">Past events</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{past.length}</span>
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((h) => {
                const s = statsMap.get(h.id)
                return (
                  <div key={h.id}>
                    <HackathonCard
                      hackathon={h}
                      href={`/e/${h.slug}`}
                      extras={
                        s && s.totalAssignments > 0 ? (
                          <Badge variant="secondary">
                            <CheckCircle2 className="mr-1 size-3" />
                            {s.completedAssignments} / {s.totalAssignments}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Scale className="mr-1 size-3" />
                            Judge
                          </Badge>
                        )
                      }
                    />
                  </div>
                )
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
