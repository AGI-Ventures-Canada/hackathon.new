"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, Loader2, Search, Trophy } from "lucide-react"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import type { WinnerPickerData } from "@/lib/services/judging"

const ALL_PRIZES = "__all__"

interface ManualWinnerListProps {
  hackathonId: string
  roundName: string
  roundId: string
}

export function ManualWinnerList({ hackathonId, roundName, roundId }: ManualWinnerListProps) {
  const router = useRouter()
  const [data, setData] = useState<WinnerPickerData | null>(null)
  const [search, setSearch] = useState("")
  const [prizeFilter, setPrizeFilter] = useState<string>(ALL_PRIZES)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const refetchData = useCallback(
    () =>
      fetch(`/api/dashboard/hackathons/${hackathonId}/rounds/${roundId}/winner-picker`)
        .then(assertOkJson<WinnerPickerData>),
    [hackathonId, roundId]
  )

  useEffect(() => {
    let cancelled = false
    setError(null)
    refetchData()
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load projects")
      })
    return () => {
      cancelled = true
    }
  }, [refetchData])

  useEffect(() => {
    if (
      prizeFilter !== ALL_PRIZES &&
      data &&
      !data.prizes.some((p) => p.id === prizeFilter)
    ) {
      setPrizeFilter(ALL_PRIZES)
    }
  }, [data, prizeFilter])

  const filtered = useMemo(() => {
    if (!data) return []
    let projects = data.projects
    if (prizeFilter !== ALL_PRIZES) {
      projects = projects.filter(
        (p) =>
          p.prizeIds.includes(prizeFilter) ||
          p.prizeScores.some((ps) => ps.prizeId === prizeFilter)
      )
      projects = [...projects].sort((a, b) => {
        const aScore = a.prizeScores.find((ps) => ps.prizeId === prizeFilter)?.score
        const bScore = b.prizeScores.find((ps) => ps.prizeId === prizeFilter)?.score
        const aHas = aScore !== undefined
        const bHas = bScore !== undefined
        if (aHas && !bHas) return -1
        if (!aHas && bHas) return 1
        if (aHas && bHas && aScore !== bScore) return bScore! - aScore!
        return a.projectTitle.localeCompare(b.projectTitle)
      })
    }
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.projectTitle.toLowerCase().includes(q) ||
        (p.teamName?.toLowerCase().includes(q) ?? false)
    )
  }, [data, search, prizeFilter])

  const assignedPrizeCount = useMemo(() => {
    if (!data) return 0
    const assigned = new Set<string>()
    for (const p of data.projects) {
      for (const id of p.prizeIds) assigned.add(id)
    }
    return assigned.size
  }, [data])

  const selectedPrizeWinner = useMemo(() => {
    if (!data || prizeFilter === ALL_PRIZES) return null
    return (
      data.projects.find((p) => p.prizeIds.includes(prizeFilter)) ?? null
    )
  }, [data, prizeFilter])

  function prizeNameById(id: string) {
    return data?.prizes.find((p) => p.id === id)?.name ?? "Prize"
  }

  const hasAnyScore = data?.projects.some((p) => p.score !== null) ?? false

  async function togglePrize(submissionId: string, prizeId: string, currentlyWins: boolean) {
    if (!data) return

    const previousWinner = data.projects.find(
      (p) => p.submissionId !== submissionId && p.prizeIds.includes(prizeId)
    )

    const snapshot = data
    const nextProjects = data.projects.map((p) => {
      if (p.submissionId === submissionId) {
        return {
          ...p,
          prizeIds: currentlyWins
            ? p.prizeIds.filter((id) => id !== prizeId)
            : [...p.prizeIds, prizeId],
        }
      }
      if (previousWinner && p.submissionId === previousWinner.submissionId && !currentlyWins) {
        return { ...p, prizeIds: p.prizeIds.filter((id) => id !== prizeId) }
      }
      return p
    })
    setData({ ...data, projects: nextProjects })
    setPending((prev) => {
      const next = new Set(prev).add(submissionId)
      if (previousWinner && !currentlyWins) next.add(previousWinner.submissionId)
      return next
    })
    setError(null)

    let previousWinnerUnassigned = false
    try {
      if (currentlyWins) {
        await fetch(
          `/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign/${submissionId}`,
          { method: "DELETE" }
        ).then(assertOk)
      } else {
        if (previousWinner) {
          await fetch(
            `/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign/${previousWinner.submissionId}`,
            { method: "DELETE" }
          ).then(assertOk)
          previousWinnerUnassigned = true
        }
        await fetch(`/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId }),
        }).then(assertOk)
      }
      router.refresh()
    } catch (err) {
      const baseMessage =
        err instanceof Error ? err.message : "Failed to save winner"
      if (previousWinnerUnassigned) {
        setError(
          `${baseMessage}. The old winner was removed but we couldn't save the new one — try again or pick a winner manually.`
        )
        refetchData()
          .then(setData)
          .catch(() => setData(snapshot))
        router.refresh()
      } else {
        setData(snapshot)
        setError(baseMessage)
      }
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(submissionId)
        if (previousWinner) next.delete(previousWinner.submissionId)
        return next
      })
    }
  }

  if (!data) {
    if (error) {
      return (
        <div className="border-t pt-3 text-xs text-destructive">{error}</div>
      )
    }
    return (
      <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Loading projects...
      </div>
    )
  }

  if (data.prizes.length === 0) {
    return (
      <div className="border-t pt-3 text-xs text-muted-foreground">
        No prizes attached to this round yet.
      </div>
    )
  }

  if (data.projects.length === 0) {
    return (
      <div className="border-t pt-3 text-xs text-muted-foreground">
        No projects in {roundName} yet.
      </div>
    )
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Pick winners</p>
        <span className="text-xs text-muted-foreground">
          {prizeFilter === ALL_PRIZES
            ? `${assignedPrizeCount} of ${data.prizes.length} prize${data.prizes.length === 1 ? "" : "s"} assigned`
            : selectedPrizeWinner
              ? `Winner: ${selectedPrizeWinner.projectTitle}`
              : "No winner yet"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {data.prizes.length > 1 && (
          <Select value={prizeFilter} onValueChange={setPrizeFilter}>
            <SelectTrigger size="sm" className="w-full text-sm sm:w-48">
              <SelectValue placeholder="Filter by prize" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PRIZES}>All prizes</SelectItem>
              {data.prizes.map((prize) => (
                <SelectItem key={prize.id} value={prize.id}>
                  {prize.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by project or team"
            className="h-8 pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="h-96 rounded-md border bg-transparent dark:bg-input/30">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {search.trim()
              ? "No projects match your search."
              : prizeFilter !== ALL_PRIZES
                ? "No projects compete for this prize yet."
                : "No projects match your search."}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((project) => {
              const isPending = pending.has(project.submissionId)
              const isSelectedPrizeWinner =
                prizeFilter !== ALL_PRIZES && project.prizeIds.includes(prizeFilter)
              const visibleAssignedPrizeIds =
                prizeFilter === ALL_PRIZES
                  ? project.prizeIds
                  : project.prizeIds.filter((id) => id !== prizeFilter)
              return (
                <li key={project.submissionId} className="flex items-center gap-3 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{project.projectTitle}</div>
                      {isSelectedPrizeWinner && (
                        <Badge variant="default" className="gap-1 text-xs">
                          <Trophy className="size-3" />
                          Winner
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {project.teamName ?? "No team"}
                    </div>
                    {visibleAssignedPrizeIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {visibleAssignedPrizeIds.map((id) => (
                          <Badge key={id} variant="secondary" className="gap-1 text-xs">
                            <Trophy className="size-3" />
                            {prizeNameById(id)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {project.prizeScores.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {project.prizeScores.map((ps) => {
                          const isSelectedPrize =
                            prizeFilter !== ALL_PRIZES && ps.prizeId === prizeFilter
                          return (
                            <span
                              key={ps.prizeId}
                              className={
                                isSelectedPrize
                                  ? "rounded border border-primary bg-primary/10 px-1.5 py-0.5 text-xs text-foreground"
                                  : "rounded border px-1.5 py-0.5 text-xs text-muted-foreground"
                              }
                            >
                              <span className="font-mono font-medium text-foreground">
                                {Math.round(ps.score * 100)}%
                              </span>{" "}
                              {ps.prizeName}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {hasAnyScore && project.prizeScores.length === 0 && (
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <span>No score</span>
                    </div>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="shrink-0" disabled={isPending}>
                        <Trophy className="mr-1 size-3" />
                        {project.prizeIds.length > 0 ? "Edit prizes" : "Pick winner"}
                        <ChevronDown className="ml-1 size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {data.prizes.map((prize) => {
                        const checked = project.prizeIds.includes(prize.id)
                        return (
                          <DropdownMenuCheckboxItem
                            key={prize.id}
                            checked={checked}
                            onCheckedChange={() =>
                              togglePrize(project.submissionId, prize.id, checked)
                            }
                            onSelect={(e) => e.preventDefault()}
                          >
                            {prize.name}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
