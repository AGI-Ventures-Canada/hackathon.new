"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  Megaphone,
  Users,
  UsersRound,
  FolderOpen,
  Scale,
  Plus,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { HackathonCard } from "@/components/hackathon/hackathon-card"
import { NeedsAttentionCard } from "@/components/hackathon/needs-attention-card"
import { groupOrganizedHackathons, hasUrgencySignals } from "@/lib/utils/organize-groups"
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
  hackathons: Hackathon[]
  stats: Record<string, HackathonMiniStats>
  showHeader?: boolean
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
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

function MiniStatsRow({ stats }: { stats: HackathonMiniStats }) {
  const judgingPct = stats.judgingTotal > 0 ? Math.round((stats.judgingComplete / stats.judgingTotal) * 100) : null
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
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
  )
}

export function OrganizingDashboard({ hackathons, stats, showHeader = true }: Props) {
  const statsMap = useMemo(
    () => new Map(Object.entries(stats)),
    [stats],
  )

  const groups = useMemo(
    () => groupOrganizedHackathons(hackathons, statsMap),
    [hackathons, statsMap],
  )

  const totals = useMemo(() => {
    let participants = 0
    let teams = 0
    let submissions = 0
    for (const s of statsMap.values()) {
      participants += s.participantCount
      teams += s.teamCount
      submissions += s.submissionCount
    }
    return { events: hackathons.length, participants, teams, submissions }
  }, [hackathons, statsMap])

  if (hackathons.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="size-10 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No events yet</CardTitle>
          <CardDescription className="mb-6 max-w-sm">
            Create your first hackathon and start building your community
          </CardDescription>
          <Button asChild>
            <Link href="/create">
              <Plus className="mr-2 size-4" />
              Create event
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const nonActive = [...groups.upcoming, ...groups.setup]

  return (
    <div className="space-y-8">
      {showHeader && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizing</h1>
          <p className="text-muted-foreground mt-1">Your events at a glance</p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events" value={totals.events} icon={Megaphone} />
        <StatCard label="Participants" value={totals.participants} icon={Users} />
        <StatCard label="Teams" value={totals.teams} icon={UsersRound} />
        <StatCard label="Submissions" value={totals.submissions} icon={FolderOpen} />
      </div>

      {groups.active.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <h2 className="text-sm font-semibold">Needs attention</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.active.map((h) => (
              <NeedsAttentionCard
                key={h.id}
                hackathon={h}
                stats={statsMap.get(h.id)}
                urgent={hasUrgencySignals(h.id, statsMap)}
                role="Organizer"
              />
            ))}
          </div>
        </div>
      )}

      {nonActive.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left group">
            <h2 className="text-sm font-medium text-muted-foreground">Upcoming & setup</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{nonActive.length}</span>
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {nonActive.map((h) => {
                const s = statsMap.get(h.id)
                return (
                  <div key={h.id}>
                    <HackathonCard
                      hackathon={h}
                      href={`/e/${h.slug}/manage`}
                      extras={s ? <MiniStatsRow stats={s} /> : undefined}
                    />
                  </div>
                )
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {groups.past.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left group">
            <h2 className="text-sm font-medium text-muted-foreground">Past events</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{groups.past.length}</span>
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.past.map((h) => {
                const s = statsMap.get(h.id)
                return (
                  <div key={h.id}>
                    <HackathonCard
                      hackathon={h}
                      href={`/e/${h.slug}/manage`}
                      extras={s ? <MiniStatsRow stats={s} /> : undefined}
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
