"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  Trophy,
  Search,
  Star,
  Check,
  Scale,
  Users,
  UsersRound,
  FolderOpen,
  ChevronDown,
  Plus,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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

type HackathonWithRole = Hackathon & { role: string }

type Props = {
  myHackathons: HackathonWithRole[]
  organizedHackathons: Hackathon[]
  sponsoredHackathons: Hackathon[]
  judgingHackathons: Hackathon[]
  submittedHackathonIds: string[]
  organizedStats?: Record<string, HackathonMiniStats>
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

function matchesQuery(h: Hackathon, q: string): boolean {
  const lower = q.toLowerCase()
  return (
    h.name.toLowerCase().includes(lower) ||
    (h.description?.toLowerCase().includes(lower) ?? false)
  )
}

function ActiveBanner({
  hackathons,
  statsMap,
}: {
  hackathons: Hackathon[]
  statsMap: Map<string, HackathonMiniStats>
}) {
  if (hackathons.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <h2 className="text-sm font-semibold">Needs attention</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hackathons.map((h) => (
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
  )
}

function HackathonSection({
  title,
  hackathons,
  emptyMessage,
  renderCard,
  defaultCollapsed = false,
}: {
  title: string
  hackathons: Hackathon[]
  emptyMessage?: string
  renderCard: (h: Hackathon) => React.ReactNode
  defaultCollapsed?: boolean
}) {
  if (hackathons.length === 0 && !emptyMessage) return null

  return (
    <Collapsible defaultOpen={!defaultCollapsed}>
      <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left group">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{hackathons.length}</span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {hackathons.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hackathons.map((h) => (
              <div key={h.id}>{renderCard(h)}</div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function HackathonTabs({
  myHackathons,
  organizedHackathons,
  sponsoredHackathons,
  judgingHackathons,
  submittedHackathonIds,
  organizedStats,
}: Props) {
  const submittedSet = new Set(submittedHackathonIds)
  const [query, setQuery] = useState("")

  const statsMap = useMemo(
    () => new Map(Object.entries(organizedStats ?? {})),
    [organizedStats],
  )

  const organizedGroups = useMemo(
    () => groupOrganizedHackathons(organizedHackathons, statsMap),
    [organizedHackathons, statsMap],
  )

  const q = query.trim()
  const isSearching = q.length >= 2

  const filteredActive = isSearching
    ? organizedGroups.active.filter((h) => matchesQuery(h, q))
    : organizedGroups.active

  const filteredOrganizing = useMemo(() => {
    const nonActive = [...organizedGroups.upcoming, ...organizedGroups.setup]
    return isSearching ? nonActive.filter((h) => matchesQuery(h, q)) : nonActive
  }, [organizedGroups, isSearching, q])

  const filteredPast = isSearching
    ? organizedGroups.past.filter((h) => matchesQuery(h, q))
    : organizedGroups.past

  const filteredParticipating = isSearching
    ? myHackathons.filter((h) => matchesQuery(h, q))
    : myHackathons

  const filteredJudging = isSearching
    ? judgingHackathons.filter((h) => matchesQuery(h, q))
    : judgingHackathons

  const filteredSponsored = isSearching
    ? sponsoredHackathons.filter((h) => matchesQuery(h, q))
    : sponsoredHackathons

  const totalCount =
    organizedHackathons.length +
    myHackathons.length +
    judgingHackathons.length +
    sponsoredHackathons.length

  if (totalCount === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy className="size-10 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No hackathons yet</CardTitle>
          <CardDescription className="mb-6 max-w-sm">
            Create your first event or browse existing hackathons to get started
          </CardDescription>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/create">
                <Plus className="mr-2 size-4" />
                Create event
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/browse">
                <Search className="mr-2 size-4" />
                Browse hackathons
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {totalCount > 5 && (
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter hackathons..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            name="dashboard-search"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
        </div>
      )}

      <ActiveBanner hackathons={filteredActive} statsMap={statsMap} />

      {(filteredOrganizing.length > 0 || organizedHackathons.length > 0) && (
        <HackathonSection
          title="Organizing"
          hackathons={filteredOrganizing}
          renderCard={(h) => {
            const stats = statsMap.get(h.id)
            return (
              <HackathonCard
                hackathon={h}
                href={`/e/${h.slug}/manage`}
                extras={stats ? <MiniStatsRow stats={stats} /> : undefined}
              />
            )
          }}
        />
      )}

      {(filteredParticipating.length > 0 || myHackathons.length > 0) && (
        <HackathonSection
          title="Participating"
          hackathons={filteredParticipating}
          renderCard={(h) => (
            <HackathonCard
              hackathon={h}
              href={`/e/${h.slug}`}
              extras={
                <>
                  <Badge variant="outline">{(h as HackathonWithRole).role}</Badge>
                  {submittedSet.has(h.id) && (
                    <Badge variant="secondary">
                      <Check className="mr-1 size-3" />
                      Submitted
                    </Badge>
                  )}
                </>
              }
            />
          )}
        />
      )}

      {(filteredJudging.length > 0 || judgingHackathons.length > 0) && (
        <HackathonSection
          title="Judging"
          hackathons={filteredJudging}
          renderCard={(h) => (
            <HackathonCard
              hackathon={h}
              href={`/e/${h.slug}`}
              extras={
                <Badge variant="outline">
                  <Scale className="mr-1 size-3" />
                  Judge
                </Badge>
              }
            />
          )}
        />
      )}

      {(filteredSponsored.length > 0 || sponsoredHackathons.length > 0) && (
        <HackathonSection
          title="Sponsoring"
          hackathons={filteredSponsored}
          renderCard={(h) => (
            <HackathonCard
              hackathon={h}
              href={`/e/${h.slug}`}
              extras={
                <Badge variant="outline">
                  <Star className="mr-1 size-3" />
                  Sponsor
                </Badge>
              }
            />
          )}
        />
      )}

      {filteredPast.length > 0 && (
        <HackathonSection
          title="Past events"
          hackathons={filteredPast}
          defaultCollapsed
          renderCard={(h) => {
            const stats = statsMap.get(h.id)
            return (
              <HackathonCard
                hackathon={h}
                href={`/e/${h.slug}/manage`}
                extras={stats ? <MiniStatsRow stats={stats} /> : undefined}
              />
            )
          }}
        />
      )}
    </div>
  )
}
