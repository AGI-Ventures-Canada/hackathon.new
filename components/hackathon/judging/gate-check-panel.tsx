"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import {
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
  Check,
  X,
} from "lucide-react"

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
  existingGateResponses: { criteriaId: string; passed: boolean }[]
}

interface GateCheckPanelProps {
  hackathonSlug: string
  roundId: string
  onComplete?: () => void
}

export function GateCheckPanel({
  hackathonSlug,
  roundId,
  onComplete,
}: GateCheckPanelProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [detail, setDetail] = useState<AssignmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [gateResponses, setGateResponses] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const fetchAssignments = useCallback(async () => {
    try {
      const assignRes = await fetch(
        `/api/public/hackathons/${hackathonSlug}/judging/assignments?roundId=${roundId}`
      )

      if (assignRes.ok) {
        const assignData = await assignRes.json()
        setAssignments(assignData.assignments ?? [])
        const firstUnscored = (assignData.assignments ?? []).findIndex(
          (a: Assignment) => !a.isComplete
        )
        setCurrentIndex(firstUnscored >= 0 ? firstUnscored : 0)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [hackathonSlug, roundId])

  useEffect(() => {
    fetchAssignments()
  }, [fetchAssignments])

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
        setDetail(data)

        const existingGates: Record<string, boolean> = {}
        if (data.existingGateResponses) {
          for (const g of data.existingGateResponses) {
            existingGates[g.criteriaId] = g.passed
          }
        }
        setGateResponses(existingGates)
        setSubmitted(data.isComplete ?? false)
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
    if (!detail) return

    const gates = Object.entries(gateResponses).map(([criteriaId, passed]) => ({
      criteriaId,
      passed,
    }))

    if (detail.gates.length > 0 && gates.length < detail.gates.length) {
      setError("Answer all gate criteria before submitting")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/public/hackathons/${hackathonSlug}/judging/assignments/${detail.id}/gate-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gates }),
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
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "ArrowLeft") goPrev()
    if (e.key === "ArrowRight" && submitted) goNext()
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
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
          <p className="text-sm font-medium">All submissions checked</p>
          <p className="text-xs text-muted-foreground">
            {scored}/{assignments.length} complete
          </p>
        </CardContent>
      </Card>
    )
  }

  const passCount = Object.values(gateResponses).filter(Boolean).length
  const totalGates = detail?.gates.length ?? 0

  return (
    <Card onKeyDown={handleKeyDown} tabIndex={-1}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{scored}/{assignments.length} checked</span>
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
            <p className="text-sm font-medium">
              {passCount}/{totalGates} gates passed
            </p>
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Requirements</h4>
                <Badge variant="outline" className="text-xs">
                  {passCount}/{totalGates} passed
                </Badge>
              </div>
              {detail.gates.map((gate) => {
                const value = gateResponses[gate.id]
                return (
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
                        variant={value === true ? "default" : "outline"}
                        onClick={() =>
                          setGateResponses({ ...gateResponses, [gate.id]: true })
                        }
                      >
                        <Check className="size-3.5 mr-1" />
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant={value === false ? "destructive" : "outline"}
                        onClick={() =>
                          setGateResponses({ ...gateResponses, [gate.id]: false })
                        }
                      >
                        <X className="size-3.5 mr-1" />
                        No
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground hidden sm:flex sm:items-center sm:gap-1">
                <Kbd>&#8984;Enter</Kbd>
                <span>to submit</span>
              </div>
              <Button
                disabled={submitting || Object.keys(gateResponses).length < totalGates}
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
