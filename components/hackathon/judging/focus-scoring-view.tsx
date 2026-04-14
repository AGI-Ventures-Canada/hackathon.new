"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react"
import { ScoringPanel } from "./scoring-panel"
import { getTeamSizeWarning } from "@/lib/utils/team-size"

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
}

interface FocusScoringViewProps {
  hackathonSlug: string
  assignments: FocusAssignment[]
  initialCompletedIds: Set<string>
  onScoreSubmitted: (assignmentId: string) => void
  teamSettings?: TeamSettings
}

export function FocusScoringView({
  hackathonSlug,
  assignments,
  initialCompletedIds,
  onScoreSubmitted,
  teamSettings,
}: FocusScoringViewProps) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(initialCompletedIds)

  const firstUnscored = assignments.findIndex((a) => !initialCompletedIds.has(a.id))
  const [currentIndex, setCurrentIndex] = useState(firstUnscored >= 0 ? firstUnscored : 0)

  const total = assignments.length
  const completed = completedIds.size
  const current = assignments[currentIndex]
  const allDone = completed === total

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
    setCompletedIds(updatedIds)
    onScoreSubmitted(assignmentId)

    const nextUnscored = assignments.findIndex(
      (a, idx) => idx > currentIndex && !updatedIds.has(a.id)
    )
    if (nextUnscored >= 0) {
      setTimeout(() => setCurrentIndex(nextUnscored), 600)
    }
  }

  if (allDone) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <CheckCircle2 className="size-12 text-primary" />
        <p className="text-lg font-semibold">All done!</p>
        <p className="text-sm text-muted-foreground">
          You&apos;ve scored all {total} assignments.
        </p>
      </div>
    )
  }

  if (!current) return null

  const isCurrentComplete = completedIds.has(current.id)
  const progressPercent = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={currentIndex === 0}
          onClick={goToPrev}
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

      <ScoringPanel
        key={current.id}
        hackathonSlug={hackathonSlug}
        assignmentId={current.id}
        onClose={goToNext}
        onScoreSubmitted={handleScoreSubmitted}
        cancelLabel="Skip"
        teamSizeWarning={teamSettings && current.teamMemberCount != null
          ? (getTeamSizeWarning({
              memberCount: current.teamMemberCount,
              minTeamSize: teamSettings.minTeamSize,
              allowSolo: teamSettings.allowSolo,
            })?.message ?? null)
          : null
        }
      />

      <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
        <span>{completed}/{total} scored</span>
      </div>
    </div>
  )
}
