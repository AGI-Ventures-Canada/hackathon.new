"use client"

import { useState } from "react"
import Link from "next/link"
import { OptimizedImage } from "@/components/ui/optimized-image"
import { Calendar } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { formatDateRange } from "@/lib/utils/format"
import { getTimelineStateAt } from "@/lib/utils/timeline"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { useIsClient } from "@/hooks/use-is-client"

const PAGE_SIZE = 5
const COMPLETED_LABELS = new Set(["Judging", "Completed", "Archived"])

export type HackathonWithRole = {
  id: string
  slug: string
  name: string
  description: string | null
  banner_url: string | null
  status: HackathonStatus
  starts_at: string | null
  ends_at: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  role: "organizer" | "sponsor" | "both"
  organizer?: {
    id: string
    name: string
    slug: string | null
    logo_url: string | null
    logo_url_dark: string | null
  }
}

export function HackathonGrid({
  hackathons,
  showCompleted,
  timelineReferenceTime,
}: {
  hackathons: HackathonWithRole[]
  showCompleted: boolean
  timelineReferenceTime: string
}) {
  const isClient = useIsClient()
  const displayTimeZone = isClient ? undefined : "UTC"
  const referenceTime = new Date(timelineReferenceTime)
  const [page, setPage] = useState(1)
  const [prevShowCompleted, setPrevShowCompleted] = useState(showCompleted)
  if (prevShowCompleted !== showCompleted) {
    setPrevShowCompleted(showCompleted)
    setPage(1)
  }

  const filtered = showCompleted
    ? hackathons
    : hackathons.filter((h) => (
        !COMPLETED_LABELS.has(getTimelineStateAt(h, referenceTime).label)
      ))

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const safePage = Math.min(page, totalPages || 1)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {paged.map((hackathon) => (
          <Link key={hackathon.id} href={`/e/${hackathon.slug}`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{hackathon.name}</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {hackathon.role === "both"
                        ? "Organizer & Sponsor"
                        : hackathon.role === "organizer"
                          ? "Organizer"
                          : "Sponsor"}
                    </Badge>
                    {(() => {
                      const timelineState = getTimelineStateAt({
                        status: hackathon.status,
                        starts_at: hackathon.starts_at,
                        ends_at: hackathon.ends_at,
                        registration_opens_at: hackathon.registration_opens_at,
                        registration_closes_at: hackathon.registration_closes_at,
                      }, referenceTime)
                      return (
                        <Badge variant={timelineState.variant}>
                          {timelineState.label}
                        </Badge>
                      )
                    })()}
                  </div>
                </div>
                {hackathon.description && (
                  <CardDescription className="line-clamp-2">
                    {hackathon.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <Calendar className="size-3.5" />
                  <span>
                    {formatDateRange(hackathon.starts_at, hackathon.ends_at, displayTimeZone)}
                  </span>
                </div>
              </CardContent>
              {hackathon.role === "sponsor" && hackathon.organizer && (
                <CardFooter>
                  <div className="flex items-center gap-2 text-sm">
                    {hackathon.organizer.logo_url && (
                      <OptimizedImage
                        src={hackathon.organizer.logo_url}
                        alt={hackathon.organizer.name}
                        width={16}
                        height={16}
                        className="rounded-full"
                      />
                    )}
                    <span className="text-muted-foreground">
                      by {hackathon.organizer.name}
                    </span>
                  </div>
                </CardFooter>
              )}
            </Card>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)) }}
                aria-disabled={safePage === 1}
                className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-4 text-sm text-muted-foreground">
                {safePage} / {totalPages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)) }}
                aria-disabled={safePage === totalPages}
                className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
