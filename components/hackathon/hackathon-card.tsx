"use client"

import Link from "next/link"
import { Calendar } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CountdownBadge } from "@/components/hackathon/countdown-badge"
import { getHydrationSafeTimelineState } from "@/lib/utils/timeline"
import { formatDateRange } from "@/lib/utils/format"
import type { ReactNode } from "react"
import { useIsClient } from "@/hooks/use-is-client"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

type HackathonCardData = {
  id: string
  slug: string
  name: string
  description: string | null
  status: HackathonStatus
  registration_opens_at?: string | null
  registration_closes_at?: string | null
  starts_at: string | null
  ends_at: string | null
}

type Props = {
  hackathon: HackathonCardData
  href: string
  extras?: ReactNode
}

export function HackathonCard({ hackathon, href, extras }: Props) {
  const isClient = useIsClient()
  const displayTimeZone = isClient ? undefined : "UTC"
  const state = getHydrationSafeTimelineState(hackathon, isClient)

  return (
    <Link href={href}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardHeader>
          <CardTitle className="text-base truncate">{hackathon.name}</CardTitle>
          <div>
            {state.showCountdown && state.startsAt ? (
              <CountdownBadge startsAt={state.startsAt} />
            ) : (
              <Badge variant={state.variant}>{state.label}</Badge>
            )}
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
              {formatDateRange(hackathon.starts_at, hackathon.ends_at, displayTimeZone)}
            </span>
          </div>
          {extras && <div className="flex gap-2 flex-wrap">{extras}</div>}
        </CardContent>
      </Card>
    </Link>
  )
}
