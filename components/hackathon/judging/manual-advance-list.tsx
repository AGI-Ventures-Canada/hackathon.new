"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Search } from "lucide-react"
import { assertOkJson } from "@/lib/utils/fetch"

type PrizeScore = {
  prizeId: string
  prizeName: string
  score: number
  judgeCount: number
}

type AdvanceCandidate = {
  submissionId: string
  projectTitle: string
  teamId: string | null
  teamName: string | null
  score: number | null
  judgeCount: number
  prizeScores: PrizeScore[]
  alreadyAdvanced: boolean
}

interface ManualAdvanceListProps {
  hackathonId: string
  fromRound: { id: string; name: string }
  toRound: { id: string; name: string; submissionCount: number }
  onPickedCountChange?: (toRoundId: string, count: number) => void
}

export function ManualAdvanceList({
  hackathonId,
  fromRound,
  toRound,
  onPickedCountChange,
}: ManualAdvanceListProps) {
  const router = useRouter()
  const [candidates, setCandidates] = useState<AdvanceCandidate[] | null>(null)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(
      `/api/dashboard/hackathons/${hackathonId}/rounds/${fromRound.id}/advance-candidates?toRoundId=${toRound.id}`
    )
      .then(assertOkJson<{ candidates: AdvanceCandidate[] }>)
      .then((data) => {
        if (cancelled) return
        setCandidates(data.candidates)
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
  }, [hackathonId, fromRound.id, toRound.id, toRound.submissionCount])

  const filtered = useMemo(() => {
    if (!candidates) return []
    const q = search.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(
      (c) =>
        c.projectTitle.toLowerCase().includes(q) ||
        (c.teamName?.toLowerCase().includes(q) ?? false)
    )
  }, [candidates, search])

  const selectedCount = useMemo(
    () => candidates?.filter((c) => c.alreadyAdvanced).length ?? 0,
    [candidates]
  )

  useEffect(() => {
    if (candidates === null) return
    onPickedCountChange?.(toRound.id, selectedCount)
  }, [candidates, selectedCount, onPickedCountChange, toRound.id])

  async function toggle(id: string, currentlyChecked: boolean) {
    const desired = !currentlyChecked

    setCandidates((prev) =>
      prev?.map((c) => (c.submissionId === id ? { ...c, alreadyAdvanced: desired } : c)) ?? prev
    )
    setPending((prev) => new Set(prev).add(id))
    setError(null)

    try {
      const url = `/api/dashboard/hackathons/${hackathonId}/rounds/${fromRound.id}/advance`
      const res = await fetch(url, {
        method: desired ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          desired
            ? { auto: false, toRoundId: toRound.id, submissionIds: [id] }
            : { toRoundId: toRound.id, submissionIds: [id] }
        ),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || (desired ? "Failed to save pick" : "Failed to remove pick"))
      }
      router.refresh()
    } catch (err) {
      setCandidates((prev) =>
        prev?.map((c) =>
          c.submissionId === id ? { ...c, alreadyAdvanced: currentlyChecked } : c
        ) ?? prev
      )
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const hasAnyScore = candidates?.some((c) => c.score !== null) ?? false

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Loading projects...
      </div>
    )
  }

  if (candidates && candidates.length === 0) {
    return (
      <div className="border-t pt-3 text-xs text-muted-foreground">
        No projects in this round yet.
      </div>
    )
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Pick who moves on to {toRound.name}</p>
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedCount} picked
          </span>
        )}
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
            {filtered.map((c) => {
              const isPending = pending.has(c.submissionId)
              return (
                <li key={c.submissionId}>
                  <label className="flex cursor-pointer items-center gap-3 p-2.5 hover:bg-muted/50">
                    {isPending ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Checkbox
                        checked={c.alreadyAdvanced}
                        onCheckedChange={() => toggle(c.submissionId, c.alreadyAdvanced)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.projectTitle}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.teamName ?? "No team"}
                      </div>
                      {c.prizeScores.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.prizeScores.map((ps) => (
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
                    {hasAnyScore && (
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        {c.prizeScores.length === 0 && (
                          <span>No score</span>
                        )}
                      </div>
                    )}
                  </label>
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
