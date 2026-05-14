"use client"

import { useEffect, useMemo, useState } from "react"
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
import { ChevronDown, Loader2, Search, Trophy } from "lucide-react"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import type { WinnerPickerData } from "@/lib/services/judging"

interface ManualWinnerListProps {
  hackathonId: string
  roundName: string
  roundId: string
  submissionCount: number
}

export function ManualWinnerList({ hackathonId, roundName, roundId, submissionCount }: ManualWinnerListProps) {
  const router = useRouter()
  const [data, setData] = useState<WinnerPickerData | null>(null)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard/hackathons/${hackathonId}/rounds/${roundId}/winner-picker`)
      .then(assertOkJson<WinnerPickerData>)
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load projects")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [hackathonId, roundId, submissionCount])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.projects
    return data.projects.filter(
      (p) =>
        p.projectTitle.toLowerCase().includes(q) ||
        (p.teamName?.toLowerCase().includes(q) ?? false)
    )
  }, [data, search])

  const assignedPrizeCount = useMemo(() => {
    if (!data) return 0
    const assigned = new Set<string>()
    for (const p of data.projects) {
      for (const id of p.prizeIds) assigned.add(id)
    }
    return assigned.size
  }, [data])

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
      setData(snapshot)
      const baseMessage =
        err instanceof Error ? err.message : "Failed to save winner"
      if (previousWinnerUnassigned) {
        setError(
          `${baseMessage}. The old winner was removed but we couldn't save the new one — try again or pick a winner manually.`
        )
        router.refresh()
      } else {
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Loading projects...
      </div>
    )
  }

  if (!data) {
    return (
      <div className="border-t pt-3 text-xs text-destructive">
        {error ?? "Failed to load projects"}
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
          {assignedPrizeCount} of {data.prizes.length} prize{data.prizes.length === 1 ? "" : "s"} assigned
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by project or team"
          className="h-8 pl-8 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ScrollArea className="h-96 rounded-md border bg-transparent dark:bg-input/30">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No projects match your search.
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((project) => {
              const isPending = pending.has(project.submissionId)
              return (
                <li key={project.submissionId} className="flex items-center gap-3 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{project.projectTitle}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {project.teamName ?? "No team"}
                    </div>
                    {project.prizeIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {project.prizeIds.map((id) => (
                          <Badge key={id} variant="secondary" className="gap-1 text-xs">
                            <Trophy className="size-3" />
                            {prizeNameById(id)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {project.prizeScores.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {project.prizeScores.map((ps) => (
                          <span
                            key={ps.prizeId}
                            className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            <span className="font-mono font-medium text-foreground">
                              {Math.round(ps.score * 100)}%
                            </span>{" "}
                            {ps.prizeName}
                          </span>
                        ))}
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
