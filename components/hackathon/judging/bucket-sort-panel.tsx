"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Kbd } from "@/components/ui/kbd"
import {
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
} from "lucide-react"

type BucketDef = {
  id: string
  level: number
  label: string
  description: string | null
}

type GateCriterion = {
  id: string
  name: string
  description: string | null
}

type Assignment = {
  id: string
  submissionId: string
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionDemoVideoUrl: string | null
  submissionScreenshotUrl: string | null
  teamName: string | null
  isComplete: boolean
}

type AssignmentDetail = Assignment & {
  gates: GateCriterion[]
  buckets: BucketDef[]
  existingGateResponses: { criteriaId: string; passed: boolean }[]
  existingBucketId: string | null
  notes: string
}

interface BucketSortPanelProps {
  hackathonSlug: string
  prizeName: string
  assignments: Assignment[]
  onComplete?: () => void
}

export function BucketSortPanel({
  hackathonSlug,
  prizeName,
  assignments: initialAssignments,
  onComplete,
}: BucketSortPanelProps) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [currentIndex, setCurrentIndex] = useState(() => {
    const index = initialAssignments.findIndex((assignment) => !assignment.isComplete)
    return index >= 0 ? index : 0
  })
  const [detail, setDetail] = useState<AssignmentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [gateResponses, setGateResponses] = useState<Record<string, boolean>>({})
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setAssignments((current) =>
      initialAssignments.map((assignment) => ({
        ...assignment,
        isComplete:
          assignment.isComplete ||
          current.find((item) => item.id === assignment.id)?.isComplete === true,
      }))
    )
  }, [initialAssignments])

  const fetchDetail = useCallback(
    async (assignmentId: string) => {
      setDetailLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}`
        )
        if (!res.ok) throw new Error("Failed to load assignment detail")
        const data = await res.json()
        const nextDetail = { ...data, gates: [] } as AssignmentDetail
        setDetail(nextDetail)

        const existingGates: Record<string, boolean> = {}
        if (nextDetail.existingGateResponses) {
          for (const g of nextDetail.existingGateResponses) {
            existingGates[g.criteriaId] = g.passed
          }
        }
        setGateResponses(existingGates)
        setSelectedBucketId(nextDetail.existingBucketId ?? null)
        setNotes(nextDetail.notes ?? "")
        setSubmitted(nextDetail.isComplete ?? false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      } finally {
        setDetailLoading(false)
      }
    },
    [hackathonSlug]
  )

  useEffect(() => {
    if (assignments.length > 0 && assignments[currentIndex]) {
      fetchDetail(assignments[currentIndex].id)
    }
  }, [assignments, currentIndex, fetchDetail])

  function goNext() {
    if (currentIndex < assignments.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSubmitted(false)
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setSubmitted(false)
    }
  }

  async function handleSubmit() {
    if (!detail || !selectedBucketId) return

    setSubmitting(true)
    setError(null)

    const gates = Object.entries(gateResponses).map(([criteriaId, passed]) => ({
      criteriaId,
      passed,
    }))

    try {
      const res = await fetch(
        `/api/public/hackathons/${hackathonSlug}/judging/assignments/${detail.id}/bucket-sort`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gates,
            bucketId: selectedBucketId,
            notes: notes.trim() || undefined,
          }),
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to submit")
      }

      setSubmitted(true)
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === detail.id ? { ...a, isComplete: true } : a
        )
      )
      onComplete?.()

      setTimeout(() => {
        const nextUnscored = assignments.findIndex(
          (a, i) => i > currentIndex && !a.isComplete && a.id !== detail.id
        )
        if (nextUnscored >= 0) {
          setCurrentIndex(nextUnscored)
          setSubmitted(false)
        }
      }, 600)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting && selectedBucketId) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "ArrowLeft") goPrev()
    if (e.key === "ArrowRight" && submitted) goNext()
  }

  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No assignments found for this round.
          </p>
        </CardContent>
      </Card>
    )
  }

  const scored = assignments.filter((a) => a.isComplete).length
  const allDone = scored >= assignments.length

  if (allDone && !detail) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <CheckCircle2 className="size-10 text-primary" />
          <p className="text-sm font-medium">All submissions scored</p>
          <p className="text-xs text-muted-foreground">
            {scored}/{assignments.length} complete
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card onKeyDown={handleKeyDown} tabIndex={-1}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{prizeName}</p>
            <div className="mt-2 flex items-center gap-3">
              <Button variant="ghost" size="icon" className="size-8" onClick={goPrev} disabled={currentIndex === 0}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} of {assignments.length}
              </span>
              <Button variant="ghost" size="icon" className="size-8" onClick={goNext} disabled={currentIndex >= assignments.length - 1}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{scored}/{assignments.length} scored</span>
            <div className="w-24">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(scored / assignments.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {detailLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : submitted ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="size-10 text-primary" />
            <p className="text-sm font-medium">Response submitted</p>
            {currentIndex < assignments.length - 1 && (
              <Button size="sm" variant="outline" onClick={goNext}>
                Next Submission
                <ChevronRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        ) : detail ? (
          <>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{detail.submissionTitle}</h3>
                  {detail.teamName && (
                    <p className="text-sm text-muted-foreground">by {detail.teamName}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {detail.submissionGithubUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={detail.submissionGithubUrl} target="_blank" rel="noopener noreferrer">
                        GitHub
                        <ExternalLink className="ml-1 size-3" />
                      </a>
                    </Button>
                  )}
                  {detail.submissionLiveAppUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={detail.submissionLiveAppUrl} target="_blank" rel="noopener noreferrer">
                        Demo
                        <ExternalLink className="ml-1 size-3" />
                      </a>
                    </Button>
                  )}
                  {detail.submissionDemoVideoUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={detail.submissionDemoVideoUrl} target="_blank" rel="noopener noreferrer">
                        Video
                        <Play className="ml-1 size-3" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              {detail.submissionDescription && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {detail.submissionDescription}
                </p>
              )}
            </div>

            {detail.gates.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Gate Criteria</h4>
                {detail.gates.map((gate) => (
                  <div key={gate.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{gate.name}</p>
                      {gate.description && (
                        <p className="text-xs text-muted-foreground">{gate.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Button
                        size="sm"
                        variant={gateResponses[gate.id] === true ? "default" : "outline"}
                        onClick={() => setGateResponses({ ...gateResponses, [gate.id]: true })}
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant={gateResponses[gate.id] === false ? "destructive" : "outline"}
                        onClick={() => setGateResponses({ ...gateResponses, [gate.id]: false })}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detail.buckets.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Place in a category</h4>
                <div className="space-y-2">
                  {detail.buckets.map((bucket) => (
                    <button
                      key={bucket.id}
                      type="button"
                      onClick={() => setSelectedBucketId(bucket.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selectedBucketId === bucket.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                            selectedBucketId === bucket.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {bucket.level}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{bucket.label}</p>
                          {bucket.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {bucket.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="judge-notes" className="text-sm font-medium">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                id="judge-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this submission..."
                rows={2}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground hidden sm:flex sm:items-center sm:gap-1">
                <Kbd>&#8984;Enter</Kbd>
                <span>to submit</span>
              </div>
              <Button
                disabled={!selectedBucketId || submitting}
                onClick={handleSubmit}
                className="ml-auto"
              >
                {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Submit & Next
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
