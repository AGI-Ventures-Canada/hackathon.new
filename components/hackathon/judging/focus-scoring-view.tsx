"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BarChart3, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react"
import { ScoringPanel } from "./scoring-panel"
import { UnifiedScoringPanel } from "./unified-scoring-panel"
import { getTeamSizeWarning } from "@/lib/utils/team-size"
import { usePrefetchAssignment } from "@/hooks/use-prefetch-assignment"

type TeamSettings = {
  minTeamSize: number
  allowSolo: boolean
}

type FocusAssignment = {
  id: string
  submissionTitle: string
  teamName: string | null
  teamMemberCount: number | null
  isComplete: boolean
  assignmentKind?: "per_prize" | "unified_weighted_score"
}

interface FocusScoringViewProps {
  hackathonSlug: string
  assignments: FocusAssignment[]
  initialCompletedIds: Set<string>
  onScoreSubmitted: (assignmentId: string) => void
  teamSettings?: TeamSettings
  summaryHref?: string
}

export function FocusScoringView({
  hackathonSlug,
  assignments,
  initialCompletedIds,
  onScoreSubmitted,
  teamSettings,
  summaryHref,
}: FocusScoringViewProps) {
  const [locallyCompletedIds, setLocallyCompletedIds] = useState<Set<string>>(new Set())

  const completedIds = useMemo(() => {
    const next = new Set<string>(initialCompletedIds)
    for (const id of locallyCompletedIds) next.add(id)
    return next
  }, [initialCompletedIds, locallyCompletedIds])

  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = assignments.findIndex((a) => !initialCompletedIds.has(a.id))
    return idx >= 0 ? idx : 0
  })

  const total = assignments.length
  const completed = completedIds.size
  const current = assignments[currentIndex]
  const allDone = completed === total

  const nextUnscoredId = useMemo(() => {
    const idx = assignments.findIndex(
      (a, i) => i > currentIndex && !completedIds.has(a.id)
    )
    return idx >= 0 ? assignments[idx].id : null
  }, [currentIndex, assignments, completedIds])

  const prefetchCache = usePrefetchAssignment(hackathonSlug, nextUnscoredId)

  const goToNext = useCallback(() => {
    if (currentIndex < total - 1) setCurrentIndex((i) => i + 1)
  }, [currentIndex, total])

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }, [currentIndex])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.key === "ArrowLeft") goToPrev()
      if (e.key === "ArrowRight") goToNext()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [goToNext, goToPrev])

  function handleScoreSubmitted() {
    const assignmentId = current.id
    const updatedIds = new Set([...completedIds, assignmentId])
    setLocallyCompletedIds((prev) => new Set(prev).add(assignmentId))
    onScoreSubmitted(assignmentId)

    const nextUnscored = assignments.findIndex(
      (a, idx) => idx > currentIndex && !updatedIds.has(a.id)
    )
    if (nextUnscored >= 0) {
      setCurrentIndex(nextUnscored)
    }
  }

  if (!current) return null

  const isCurrentComplete = completedIds.has(current.id)
  const progressPercent = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="space-y-4">
      {allDone && (
        <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">All scores are in.</p>
              <p className="text-sm text-muted-foreground">
                You can review and change them while judging is open.
              </p>
            </div>
          </div>
          {summaryHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={summaryHref}>
                <BarChart3 className="mr-2 size-4" />
                View your summary
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={currentIndex === 0}
          onClick={goToPrev}
          aria-label="Previous project"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm font-medium whitespace-nowrap">
            {currentIndex + 1} of {total}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={currentIndex === total - 1}
          onClick={goToNext}
          aria-label="Next project"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{current.submissionTitle}</h3>
          {current.teamName && (
            <p className="text-sm text-muted-foreground">{current.teamName}</p>
          )}
        </div>
        <Badge variant={isCurrentComplete ? "default" : "outline"}>
          {isCurrentComplete ? "Scored" : "Pending"}
        </Badge>
      </div>

      {current.assignmentKind === "unified_weighted_score" ? (
        <UnifiedScoringPanel
          key={current.id}
          hackathonSlug={hackathonSlug}
          assignmentId={current.id}
          onClose={goToNext}
          onScoreSubmitted={handleScoreSubmitted}
          cancelLabel="Skip"
          prefetchedDetail={prefetchCache[current.id] ?? null}
          teamSizeWarning={teamSettings && current.teamMemberCount != null
            ? (getTeamSizeWarning({
                memberCount: current.teamMemberCount,
                minTeamSize: teamSettings.minTeamSize,
                allowSolo: teamSettings.allowSolo,
              })?.message ?? null)
            : null
          }
        />
      ) : (
        <ScoringPanel
          key={current.id}
          hackathonSlug={hackathonSlug}
          assignmentId={current.id}
          onClose={goToNext}
          onScoreSubmitted={handleScoreSubmitted}
          cancelLabel="Skip"
          prefetchedDetail={prefetchCache[current.id] ?? null}
          teamSizeWarning={teamSettings && current.teamMemberCount != null
            ? (getTeamSizeWarning({
                memberCount: current.teamMemberCount,
                minTeamSize: teamSettings.minTeamSize,
                allowSolo: teamSettings.allowSolo,
              })?.message ?? null)
            : null
          }
        />
      )}

      <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
        <span>{completed}/{total} scored</span>
      </div>
    </div>
  )
}
