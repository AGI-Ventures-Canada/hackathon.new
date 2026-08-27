"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Loader2, ExternalLink, Github, Maximize2, AlertTriangle, Play } from "lucide-react"
import Image from "next/image"
import { assertOkJson } from "@/lib/utils/fetch"
import type { AssignmentDetail } from "@/lib/services/judging"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useJudgeWebMcpEditor } from "./judge-webmcp-tools"

interface UnifiedScoringPanelProps {
  hackathonSlug: string
  assignmentId: string
  onClose: () => void
  onScoreSubmitted: () => void
  cancelLabel?: string
  teamSizeWarning?: string | null
  prefetchedDetail?: AssignmentDetail | null
}

type CriterionGroup = {
  prizeId: string | null
  prizeName: string | null
  criteria: AssignmentDetail["criteria"]
}

function groupByPrize(criteria: AssignmentDetail["criteria"]): CriterionGroup[] {
  const coreCriteria = criteria.filter((c) => !c.prizeId)
  const prizeMap = new Map<string, { name: string; criteria: AssignmentDetail["criteria"] }>()
  for (const c of criteria) {
    if (!c.prizeId) continue
    const key = c.prizeId
    if (!prizeMap.has(key)) prizeMap.set(key, { name: c.prizeName ?? "Prize", criteria: [] })
    prizeMap.get(key)!.criteria.push(c)
  }
  const groups: CriterionGroup[] = []
  if (coreCriteria.length > 0) {
    groups.push({ prizeId: null, prizeName: null, criteria: coreCriteria })
  }
  for (const [prizeId, info] of prizeMap) {
    groups.push({ prizeId, prizeName: info.name, criteria: info.criteria })
  }
  return groups
}

export function UnifiedScoringPanel({
  hackathonSlug,
  assignmentId,
  onClose,
  onScoreSubmitted,
  cancelLabel = "Cancel",
  teamSizeWarning,
  prefetchedDetail,
}: UnifiedScoringPanelProps) {
  const [detail, setDetail] = useState<AssignmentDetail | null>(null)
  const [loading, setLoading] = useState(!(prefetchedDetail && prefetchedDetail.id === assignmentId))
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingNotes, setSavingNotes] = useState(false)
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const notesTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const appliedDetailRef = useRef<string | null>(null)
  const prefetchedDetailRef = useRef(prefetchedDetail)
  prefetchedDetailRef.current = prefetchedDetail

  useEffect(() => {
    setError(null)
    appliedDetailRef.current = null

    function applyDetail(data: AssignmentDetail) {
      setDetail(data)
      const initialScores: Record<string, number> = {}
      for (const c of data.criteria ?? []) {
        const mid = Math.round((c.min_score + c.max_score) / 2)
        initialScores[c.id] = c.currentScore ?? mid
      }
      setScores(initialScores)
      setNotes(data.notes ?? "")
      setLoading(false)
      appliedDetailRef.current = data.id
    }

    const cached = prefetchedDetailRef.current
    if (cached && cached.id === assignmentId && !appliedDetailRef.current) {
      applyDetail(cached)
      return
    }

    setLoading(true)
    fetch(`/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}`)
      .then(assertOkJson<AssignmentDetail>)
      .then((data) => {
        if (!appliedDetailRef.current) applyDetail(data)
      })
      .catch(() => setError("Failed to load assignment"))
      .finally(() => setLoading(false))
  }, [assignmentId, hackathonSlug])

  const debouncedSaveNotes = useCallback(
    (value: string) => {
      clearTimeout(notesTimeoutRef.current)
      notesTimeoutRef.current = setTimeout(async () => {
        setSavingNotes(true)
        try {
          await fetch(
            `/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}/notes`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ notes: value }),
            }
          )
        } catch {
          // ignore — notes auto-save retries on next edit
        } finally {
          setSavingNotes(false)
        }
      }, 1000)
    },
    [hackathonSlug, assignmentId]
  )

  function handleNotesChange(value: string) {
    setNotes(value)
    debouncedSaveNotes(value)
  }

  const groups = useMemo<CriterionGroup[]>(() => {
    if (!detail) return []
    return groupByPrize(detail.criteria)
  }, [detail])

  const livePreview = useMemo(() => {
    if (!detail) return { coreOnly: 0, perPrize: [] as { prizeId: string; prizeName: string; score: number }[] }
    const normalize = (c: AssignmentDetail["criteria"][number]) => {
      const range = c.max_score - c.min_score
      if (range <= 0) return 0
      return ((scores[c.id] ?? c.min_score) - c.min_score) / range
    }
    const coreCriteria = detail.criteria.filter((c) => !c.prizeId)
    const coreSum = coreCriteria.reduce((acc, c) => acc + normalize(c) * c.weight, 0)
    const coreWeightSum = coreCriteria.reduce((acc, c) => acc + c.weight, 0)
    const coreOnly = coreWeightSum > 0 ? coreSum / coreWeightSum : 0

    const prizeIds = Array.from(
      new Set(detail.criteria.filter((c) => c.prizeId).map((c) => c.prizeId!))
    )
    const perPrize = prizeIds.map((pid) => {
      const prizeCriteria = detail.criteria.filter((c) => c.prizeId === pid)
      const prizeSum = prizeCriteria.reduce((acc, c) => acc + normalize(c) * c.weight, 0)
      const prizeWeightSum = prizeCriteria.reduce((acc, c) => acc + c.weight, 0)
      const totalWeightSum = coreWeightSum + prizeWeightSum
      return {
        prizeId: pid,
        prizeName: prizeCriteria[0]?.prizeName ?? "Prize",
        score: totalWeightSum > 0 ? (coreSum + prizeSum) / totalWeightSum : 0,
      }
    })

    return { coreOnly, perPrize }
  }, [detail, scores])

  async function handleSubmit() {
    if (!detail) return

    for (const c of detail.criteria) {
      const v = scores[c.id]
      if (v == null || v < c.min_score || v > c.max_score) {
        setError(`Please score every criterion within its range before submitting`)
        return
      }
    }

    setSubmitting(true)
    setError(null)

    try {
      const validScores = Object.entries(scores).map(([criteriaId, score]) => ({
        criteriaId,
        score,
      }))

      const res = await fetch(
        `/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}/scores`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scores: validScores, notes }),
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || "Failed to submit scores")
      }

      setDetail((current) => current ? { ...current, isComplete: true } : current)
      onScoreSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit scores")
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const webMcpEditor = useMemo(() => {
    if (!detail) return null
    const criteria = detail.criteria.map((criterion, index) => ({
      ref: `criterion-${index + 1}`,
      name: criterion.name,
      min: criterion.min_score,
      max: criterion.max_score,
      id: criterion.id,
    }))

    return {
      info: {
        criteria: criteria.map(({ id: _id, ...criterion }) => criterion),
      },
      prepare: (preparation: import("@/lib/webmcp/judge-tools").JudgePreparation) => {
        if (preparation.kind !== "weighted_score") {
          return { prepared: false, message: "This project uses score categories." }
        }

        const nextScores: Record<string, number> = {}
        for (const requested of preparation.scores) {
          const criterion = criteria.find(
            (candidate) =>
              candidate.ref === requested.criterion ||
              candidate.name.toLowerCase() === requested.criterion.toLowerCase(),
          )
          if (!criterion || requested.value < criterion.min || requested.value > criterion.max) {
            return {
              prepared: false,
              message: `Check ${requested.criterion} and use one of the listed score ranges.`,
            }
          }
          nextScores[criterion.id] = requested.value
        }

        setScores((current) => ({ ...current, ...nextScores }))
        if (preparation.notes !== undefined) {
          clearTimeout(notesTimeoutRef.current)
          setNotes(preparation.notes)
        }
        setError(null)
        return {
          prepared: true,
          message: "Scores are filled in. Review them, then click Submit scores.",
        }
      },
    }
  }, [detail])

  const webMcpAssignmentIds = useMemo(() => (detail ? [assignmentId] : []), [assignmentId, detail])
  useJudgeWebMcpEditor(webMcpAssignmentIds, webMcpEditor)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-destructive">{error || "Failed to load"}</p>
      </div>
    )
  }

  return (
    <div
      className="space-y-6"
      data-judge-assignment={assignmentId}
      onKeyDown={handleKeyDown}
    >
      {detail.submissionScreenshotUrl && (
        <>
          <div className="relative rounded-lg border overflow-hidden group">
            <Image
              src={detail.submissionScreenshotUrl}
              alt={detail.submissionTitle}
              width={1920}
              height={1080}
              className="w-full h-[180px] object-cover"
            />
            <button
              type="button"
              onClick={() => setScreenshotOpen(true)}
              className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md bg-background/80 backdrop-blur-sm border px-2 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Maximize2 className="size-3" />
              View full
            </button>
          </div>
          <Dialog open={screenshotOpen} onOpenChange={setScreenshotOpen}>
            <DialogContent className="max-w-6xl w-full p-2">
              <DialogTitle className="sr-only">{detail.submissionTitle} screenshot</DialogTitle>
              <Image
                src={detail.submissionScreenshotUrl}
                alt={detail.submissionTitle}
                width={1920}
                height={1080}
                className="w-full h-auto rounded-md"
              />
            </DialogContent>
          </Dialog>
        </>
      )}

      {detail.submissionDescription && (
        <p className="text-sm text-muted-foreground">{detail.submissionDescription}</p>
      )}

      {teamSizeWarning && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
          <AlertTriangle className="size-3.5 text-destructive shrink-0 mt-0.5" />
          <span className="text-xs text-destructive">{teamSizeWarning}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {detail.submissionGithubUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={detail.submissionGithubUrl} target="_blank" rel="noopener noreferrer">
              <Github className="mr-2 size-3.5" />
              GitHub
            </a>
          </Button>
        )}
        {detail.submissionLiveAppUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={detail.submissionLiveAppUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-3.5" />
              Live Demo
            </a>
          </Button>
        )}
        {detail.submissionDemoVideoUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={detail.submissionDemoVideoUrl} target="_blank" rel="noopener noreferrer">
              <Play className="mr-2 size-3.5" />
              Video
            </a>
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {groups.map((g) => {
          const isCore = g.prizeId == null
          const prizeSubtotal = isCore
            ? null
            : livePreview.perPrize.find((p) => p.prizeId === g.prizeId)?.score ?? null
          return (
            <div key={g.prizeId ?? "core"} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={isCore ? "secondary" : "outline"}>
                    {isCore ? "Core" : "Prize"}
                  </Badge>
                  <h4 className="text-sm font-semibold">
                    {isCore ? "Core Weighted Categories" : g.prizeName}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {g.criteria.length} {g.criteria.length === 1 ? "category" : "categories"}
                  </span>
                </div>
                {prizeSubtotal != null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Score: <span className="font-medium text-foreground">{prizeSubtotal.toFixed(2)}</span>
                  </span>
                )}
              </div>
              {g.criteria.map((c) => (
                <div key={c.id} className="space-y-2">
                  <div>
                    <Label className="text-sm font-medium">{c.name}</Label>
                    {c.description && (
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[scores[c.id] ?? Math.round((c.min_score + c.max_score) / 2)]}
                      onValueChange={([val]) =>
                        setScores((prev) => ({ ...prev, [c.id]: val }))
                      }
                      min={c.min_score}
                      max={c.max_score}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={c.min_score}
                      max={c.max_score}
                      value={scores[c.id] ?? Math.round((c.min_score + c.max_score) / 2)}
                      onChange={(e) => {
                        const val = Math.max(
                          c.min_score,
                          Math.min(c.max_score, parseInt(e.target.value) || c.min_score)
                        )
                        setScores((prev) => ({ ...prev, [c.id]: val }))
                      }}
                      className="w-16 text-center"
                      autoComplete="off"
                    />
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      /{c.max_score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="space-y-2 rounded-md border bg-muted/40 p-3">
        <h4 className="text-sm font-semibold">Your scores so far</h4>
        <div className="space-y-1 text-sm">
          {livePreview.perPrize.map((p) => (
            <div key={p.prizeId} className="flex items-center justify-between">
              <span className="text-muted-foreground">Core + {p.prizeName}</span>
              <span className="font-medium tabular-nums">{p.score.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Core only (normalized)</span>
            <span className="font-medium tabular-nums">{livePreview.coreOnly.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Notes</Label>
          {savingNotes && <span className="text-xs text-muted-foreground">Saving...</span>}
        </div>
        <Textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Add your notes about this submission..."
          rows={3}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {detail.isComplete ? "Save changes" : "Submit scores"}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
