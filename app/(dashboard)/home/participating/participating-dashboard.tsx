"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  Users,
  Check,
  FolderOpen,
  Trophy,
  Compass,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { HackathonCard } from "@/components/hackathon/hackathon-card"
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
  role: string
}

type Props = {
  hackathons: Hackathon[]
  submittedHackathonIds: string[]
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

const ACTIVE_STATUSES: HackathonStatus[] = ["active", "registration_open", "published", "judging"]
const PAST_STATUSES: HackathonStatus[] = ["completed", "archived"]

export function ParticipatingDashboard({ hackathons, submittedHackathonIds, showHeader = true }: Props) {
  const submittedSet = useMemo(() => new Set(submittedHackathonIds), [submittedHackathonIds])

  const { active, past } = useMemo(() => {
    const now = new Date()
    const active: Hackathon[] = []
    const past: Hackathon[] = []

    for (const h of hackathons) {
      const endsAt = h.ends_at ? new Date(h.ends_at) : null
      if (endsAt && endsAt < now && !ACTIVE_STATUSES.includes(h.status)) {
        past.push(h)
      } else if (PAST_STATUSES.includes(h.status)) {
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

  const submittedCount = hackathons.filter((h) => submittedSet.has(h.id)).length
  const completedCount = past.length

  if (hackathons.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="size-10 text-muted-foreground mb-4" />
          <CardTitle className="mb-2">No hackathons yet</CardTitle>
          <CardDescription className="mb-6 max-w-sm">
            Join your first hackathon and start building with others
          </CardDescription>
          <Button asChild>
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
          <h1 className="text-2xl font-semibold tracking-tight">Participating</h1>
          <p className="text-muted-foreground mt-1">Your hackathon journey</p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events joined" value={hackathons.length} icon={Users} />
        <StatCard label="Submissions" value={submittedCount} icon={FolderOpen} />
        <StatCard label="Active now" value={active.length} icon={Trophy} />
        <StatCard label="Completed" value={completedCount} icon={Check} />
      </div>

      {active.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Active & upcoming</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{active.length}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((h) => (
              <div key={h.id}>
                <HackathonCard
                  hackathon={h}
                  href={`/e/${h.slug}`}
                  extras={
                    <>
                      <Badge variant="outline">{h.role}</Badge>
                      {submittedSet.has(h.id) && (
                        <Badge variant="secondary">
                          <Check className="mr-1 size-3" />
                          Submitted
                        </Badge>
                      )}
                    </>
                  }
                />
              </div>
            ))}
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
              {past.map((h) => (
                <div key={h.id}>
                  <HackathonCard
                    hackathon={h}
                    href={`/e/${h.slug}`}
                    extras={
                      <>
                        <Badge variant="outline">{h.role}</Badge>
                        {submittedSet.has(h.id) && (
                          <Badge variant="secondary">
                            <Check className="mr-1 size-3" />
                            Submitted
                          </Badge>
                        )}
                      </>
                    }
                  />
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
