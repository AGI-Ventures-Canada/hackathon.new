"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Loader2 } from "lucide-react"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { HackathonCard } from "@/components/hackathon/hackathon-card"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { assertOkJson } from "@/lib/utils/fetch"

type BrowseHackathon = {
  id: string
  slug: string
  name: string
  description: string | null
  status: string
  startsAt: string | null
  endsAt: string | null
  registrationOpensAt: string | null
  registrationClosesAt: string | null
}

type Props = {
  initialHackathons: BrowseHackathon[]
  initialPage: number
  initialTotalPages: number
}

type HackathonListResponse = {
  hackathons: BrowseHackathon[]
  page: number
  totalPages: number
}

function toCardData(h: BrowseHackathon) {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    description: h.description,
    status: h.status as HackathonStatus,
    registration_opens_at: h.registrationOpensAt,
    registration_closes_at: h.registrationClosesAt,
    starts_at: h.startsAt,
    ends_at: h.endsAt,
  }
}

const PAGE_SIZE = 9

export function BrowseHackathonGrid({
  initialHackathons,
  initialPage,
  initialTotalPages,
}: Props) {
  const [query, setQuery] = useState("")
  const [hackathons, setHackathons] = useState(initialHackathons)
  const [page, setPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const isSearching = query.length >= 2

  const fetchPage = useCallback(async (targetPage: number, search?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(PAGE_SIZE),
      })
      if (search && search.length >= 2) {
        params.set("q", search)
      }
      const data = await fetch(`/api/public/hackathons?${params}`)
        .then(assertOkJson<HackathonListResponse>)
      setHackathons(data.hackathons)
      setPage(data.page)
      setTotalPages(data.totalPages)
    } catch {
      // keep current state on error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.length < 2) {
      if (query.length === 0 && page === initialPage) {
        setHackathons(initialHackathons)
        setTotalPages(initialTotalPages)
      } else if (query.length === 0) {
        fetchPage(1)
      }
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetchPage(1, query)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- page excluded to avoid re-fetching when page changes (handled by goToPage)
  }, [query, initialHackathons, initialPage, initialTotalPages, fetchPage])

  function goToPage(targetPage: number) {
    if (loading || targetPage === page) return

    fetchPage(targetPage, isSearching ? query : undefined)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function getPageNumbers() {
    const pages: (number | "ellipsis")[] = []
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push("ellipsis")
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i)
      }
      if (page < totalPages - 2) pages.push("ellipsis")
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-64">
        {loading ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        )}
        <Input
          placeholder="Search hackathons..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          name="hackathon-search"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
        />
      </div>

      {loading ? (
        <DashboardGridLoading
          statCards={0}
          cardCount={PAGE_SIZE}
          showPagination={totalPages > 1}
        />
      ) : hackathons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="size-10 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">
              {isSearching ? "No results found" : "No hackathons available"}
            </CardTitle>
            <CardDescription>
              {isSearching
                ? "Try a different search term"
                : "Check back later for new hackathons"}
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {hackathons.map((h) => (
              <HackathonCard
                key={h.id}
                hackathon={toCardData(h)}
                href={`/e/${h.slug}`}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      if (page > 1) goToPage(page - 1)
                    }}
                    aria-disabled={page === 1}
                    className={page === 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                {getPageNumbers().map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => {
                          e.preventDefault()
                          goToPage(p)
                        }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      if (page < totalPages) goToPage(page + 1)
                    }}
                    aria-disabled={page === totalPages}
                    className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}
    </div>
  )
}
