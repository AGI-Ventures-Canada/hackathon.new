"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Check, ExternalLink, Github, Loader2, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { assertOk } from "@/lib/utils/fetch"

type PickAssignment = {
  id: string
  submissionId: string
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionDemoVideoUrl: string | null
  teamName: string | null
}

type InitialPick = {
  submissionId: string
  rank: number
}

interface JudgesPickPanelProps {
  hackathonSlug: string
  prizeId: string
  prizeName: string
  maxPicks: number
  assignments: PickAssignment[]
  initialPicks: InitialPick[]
}

export function JudgesPickPanel({
  hackathonSlug,
  prizeId,
  prizeName,
  maxPicks,
  assignments,
  initialPicks,
}: JudgesPickPanelProps) {
  const router = useRouter()
  const allowedSubmissionIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.submissionId)),
    [assignments]
  )
  const initialSelectedIds = useMemo(() =>
    initialPicks
      .filter((pick) => allowedSubmissionIds.has(pick.submissionId))
      .sort((a, b) => a.rank - b.rank)
      .map((pick) => pick.submissionId),
    [allowedSubmissionIds, initialPicks]
  )
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(initialSelectedIds.length > 0)
  const [error, setError] = useState<string | null>(null)

  function togglePick(submissionId: string) {
    setSaved(false)
    setError(null)
    setSelectedIds((current) => {
      if (current.includes(submissionId)) {
        return current.filter((id) => id !== submissionId)
      }
      if (current.length >= maxPicks) return current
      return [...current, submissionId]
    })
  }

  function movePick(submissionId: string, direction: -1 | 1) {
    setSaved(false)
    setSelectedIds((current) => {
      const index = current.indexOf(submissionId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const currentValue = next[index]
      next[index] = next[nextIndex]
      next[nextIndex] = currentValue
      return next
    })
  }

  async function handleSubmit() {
    if (selectedIds.length === 0) {
      setError("Pick at least one project.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await fetch(`/api/public/hackathons/${hackathonSlug}/judging/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prizeId, rankedSubmissionIds: selectedIds }),
      }).then(assertOk)
      setSaved(true)
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Couldn't save your picks.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !submitting) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Card onKeyDown={handleKeyDown}>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{prizeName}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick up to {maxPicks}. Your first pick gets the top spot.
            </p>
          </div>
          <Badge variant="secondary">
            {selectedIds.length}/{maxPicks} picked
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.map((assignment) => {
          const selectedIndex = selectedIds.indexOf(assignment.submissionId)
          const isSelected = selectedIndex >= 0
          const limitReached = selectedIds.length >= maxPicks

          return (
            <div key={assignment.id} className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {isSelected && <Badge>#{selectedIndex + 1}</Badge>}
                    <p className="font-medium">{assignment.submissionTitle}</p>
                  </div>
                  {assignment.teamName && (
                    <p className="text-sm text-muted-foreground">{assignment.teamName}</p>
                  )}
                  {assignment.submissionDescription && (
                    <p className="text-sm text-muted-foreground">
                      {assignment.submissionDescription}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {isSelected && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => movePick(assignment.submissionId, -1)}
                        disabled={selectedIndex === 0}
                        aria-label={`Move ${assignment.submissionTitle} up`}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => movePick(assignment.submissionId, 1)}
                        disabled={selectedIndex === selectedIds.length - 1}
                        aria-label={`Move ${assignment.submissionTitle} down`}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => togglePick(assignment.submissionId)}
                    disabled={!isSelected && limitReached}
                  >
                    {isSelected && <Check className="mr-2 size-4" />}
                    {isSelected ? "Picked" : "Pick"}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {assignment.submissionGithubUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={assignment.submissionGithubUrl} target="_blank" rel="noopener noreferrer">
                      <Github className="mr-2 size-4" />
                      GitHub
                    </a>
                  </Button>
                )}
                {assignment.submissionLiveAppUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={assignment.submissionLiveAppUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 size-4" />
                      Demo
                    </a>
                  </Button>
                )}
                {assignment.submissionDemoVideoUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={assignment.submissionDemoVideoUrl} target="_blank" rel="noopener noreferrer">
                      <Play className="mr-2 size-4" />
                      Video
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-muted-foreground">Your picks are saved.</p>}

        <Button onClick={handleSubmit} disabled={submitting || selectedIds.length === 0}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save picks
        </Button>
      </CardContent>
    </Card>
  )
}
