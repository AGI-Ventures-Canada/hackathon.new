"use client"

import Link from "next/link"
import { Calendar, Users, UsersRound, FolderOpen, Scale, AlertCircle, HandHelping } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CountdownBadge } from "@/components/hackathon/countdown-badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { getTimelineState } from "@/lib/utils/timeline"
import { formatDateRange } from "@/lib/utils/format"
import type { HackathonMiniStats } from "@/lib/services/organizer-dashboard"
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
  hackathon: Hackathon
  stats?: HackathonMiniStats
  urgent: boolean
  role: string
}

function UrgencySignals({ stats }: { stats: HackathonMiniStats }) {
  const signals: { label: string; icon: React.ComponentType<{ className?: string }> }[] = []

  if (stats.openMentorRequests > 0) {
    signals.push({
      label: `${stats.openMentorRequests} open mentor request${stats.openMentorRequests === 1 ? "" : "s"}`,
      icon: HandHelping,
    })
  }

  if (stats.judgingTotal > 0 && stats.judgingComplete < stats.judgingTotal) {
    const pct = Math.round((stats.judgingComplete / stats.judgingTotal) * 100)
    signals.push({
      label: `Judging ${pct}% complete (${stats.judgingComplete}/${stats.judgingTotal})`,
      icon: Scale,
    })
  }

  if (signals.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Needs your attention</p>
      {signals.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <s.icon className="size-3 shrink-0 text-destructive" />
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

export function NeedsAttentionCard({ hackathon, stats, urgent, role }: Props) {
  const state = getTimelineState(hackathon as Parameters<typeof getTimelineState>[0])
  const judgingPct = stats && stats.judgingTotal > 0
    ? Math.round((stats.judgingComplete / stats.judgingTotal) * 100)
    : null

  const card = (
    <Link href={`/e/${hackathon.slug}/manage`}>
      <Card className="border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10 transition-colors cursor-pointer h-full">
        <CardHeader>
          <CardTitle className="text-base truncate">
            <span className="flex items-center gap-2">
              {hackathon.name}
              {urgent && <AlertCircle className="size-4 shrink-0 text-destructive" />}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {state.showCountdown && state.startsAt ? (
              <CountdownBadge startsAt={state.startsAt} />
            ) : (
              <Badge variant={state.variant}>{state.label}</Badge>
            )}
            <Badge variant="outline">{role}</Badge>
          </div>
          {hackathon.description && (
            <CardDescription className="line-clamp-2">
              {hackathon.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="size-3.5 shrink-0" />
            <span className="text-sm">
              {formatDateRange(hackathon.starts_at, hackathon.ends_at)}
            </span>
          </div>
          {stats && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {stats.participantCount}
              </span>
              <span className="flex items-center gap-1">
                <UsersRound className="size-3" />
                {stats.teamCount}
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="size-3" />
                {stats.submissionCount}
              </span>
              {judgingPct !== null && (
                <span className="flex items-center gap-1">
                  <Scale className="size-3" />
                  {judgingPct}%
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )

  if (!stats) return card

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{card}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{hackathon.name}</p>
            {hackathon.description && (
              <p className="text-xs text-muted-foreground">{hackathon.description}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Users className="size-3 text-muted-foreground" />
              <span>{stats.participantCount} participants</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UsersRound className="size-3 text-muted-foreground" />
              <span>{stats.teamCount} teams</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FolderOpen className="size-3 text-muted-foreground" />
              <span>{stats.submissionCount} submissions</span>
            </div>
            {stats.judgingTotal > 0 && (
              <div className="flex items-center gap-1.5">
                <Scale className="size-3 text-muted-foreground" />
                <span>{stats.judgingComplete}/{stats.judgingTotal} scored</span>
              </div>
            )}
          </div>
          <UrgencySignals stats={stats} />
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
