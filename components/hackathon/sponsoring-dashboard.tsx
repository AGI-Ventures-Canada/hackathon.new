"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  Star,
  Award,
  Compass,
  ChevronDown,
  Gift,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { HackathonCard } from "@/components/hackathon/hackathon-card"
import type { SponsorshipInfo } from "@/lib/services/persona-stats"
import type { HackathonStatus, SponsorTier } from "@/lib/db/hackathon-types"

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
  sponsorships: Record<string, SponsorshipInfo>
}

const TIER_LABELS: Record<SponsorTier, string> = {
  custom: "Custom",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
  none: "Sponsor",
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

function TierBadge({ tier, customLabel }: { tier: SponsorTier; customLabel?: string | null }) {
  if (tier === "none") return null
  return (
    <Badge variant="outline">
      <Star className="mr-1 size-3" />
      {tier === "custom" && customLabel ? customLabel : TIER_LABELS[tier]}
    </Badge>
  )
}

const PAST_STATUSES: HackathonStatus[] = ["completed", "archived"]

export function SponsoringDashboard({ hackathons, sponsorships }: Props) {
  const sponsorMap = useMemo(
    () => new Map(Object.entries(sponsorships)),
    [sponsorships],
  )

  const { active, past } = useMemo(() => {
    const now = new Date()
    const active: Hackathon[] = []
    const past: Hackathon[] = []

    for (const h of hackathons) {
      const endsAt = h.ends_at ? new Date(h.ends_at) : null
      if (PAST_STATUSES.includes(h.status) || (endsAt && endsAt < now)) {
        past.push(h)
      } else {
        active.push(h)
      }
    }

    past.sort((a, b) => {
      if (!a.ends_at && !b.ends_at) return 0
      if (!a.ends_at) return 1
      if (!b.ends_at) return -1
      return new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime()
    })

    return { active, past }
  }, [hackathons])

  const tierCounts = useMemo(() => {
    const counts = new Map<SponsorTier, number>()
    for (const s of sponsorMap.values()) {
      counts.set(s.tier, (counts.get(s.tier) ?? 0) + 1)
    }
    return counts
  }, [sponsorMap])

  const titleOrGold = (tierCounts.get("custom") ?? 0) + (tierCounts.get("gold") ?? 0)

  if (hackathons.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Star className="size-10 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No sponsorships</CardTitle>
          <CardDescription className="mb-6 max-w-sm">
            Sponsor hackathons to connect with talented builders and showcase your brand
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sponsoring</h1>
        <p className="text-muted-foreground mt-1">Your sponsorship portfolio</p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <StatCard label="Events sponsored" value={hackathons.length} icon={Star} />
        <StatCard label="Active" value={active.length} icon={Award} />
        <StatCard label="Title & Gold" value={titleOrGold} icon={Award} />
      </div>

      {active.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Active sponsorships</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{active.length}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((h) => {
              const info = sponsorMap.get(h.id)
              return (
                <div key={h.id} className="space-y-2">
                  <HackathonCard
                    hackathon={h}
                    href={`/e/${h.slug}`}
                    extras={info ? <TierBadge tier={info.tier} customLabel={info.customTierLabel} /> : undefined}
                  />
                  {(h.status === "completed" || h.status === "archived") && (
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href={`/home/sponsoring/${h.id}/fulfillments`}>
                        <Gift className="mr-2 size-4" />
                        <span className="hidden sm:inline">View Prize Fulfillment</span>
                        <span className="sm:hidden">Prizes</span>
                      </Link>
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <Collapsible defaultOpen={active.length === 0}>
          <CollapsibleTrigger className="mb-3 flex w-full items-center gap-2 text-left group">
            <h2 className="text-sm font-medium text-muted-foreground">Past events</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{past.length}</span>
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((h) => {
                const info = sponsorMap.get(h.id)
                return (
                  <div key={h.id} className="space-y-2">
                    <HackathonCard
                      hackathon={h}
                      href={`/e/${h.slug}`}
                      extras={info ? <TierBadge tier={info.tier} customLabel={info.customTierLabel} /> : undefined}
                    />
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href={`/home/sponsoring/${h.id}/fulfillments`}>
                        <Gift className="mr-2 size-4" />
                        <span className="hidden sm:inline">View Prize Fulfillment</span>
                        <span className="sm:hidden">Prizes</span>
                      </Link>
                    </Button>
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
