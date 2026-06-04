"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Loader2, ExternalLink, Github, Maximize2, AlertTriangle, Play } from "lucide-react"
import { RubricLevelSelector } from "./rubric-level-selector"
import Image from "next/image"
import { assertOkJson } from "@/lib/utils/fetch"
import type { AssignmentDetail } from "@/lib/services/judging"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"

interface ScoringPanelProps {
  hackathonSlug: string
  assignmentId: string
  onClose: () => void
  onScoreSubmitted: () => void
  cancelLabel?: string
  teamSizeWarning?: string | null
  prefetchedDetail?: AssignmentDetail | null
}

export function ScoringPanel({
  hackathonSlug,
  assignmentId,
  onClose,
  onScoreSubmitted,
  cancelLabel = "Cancel",
  teamSizeWarning,
  prefetchedDetail,
}: ScoringPanelProps) {
  const [detail, setDetail] = useState<AssignmentDetail | null>(null)
  const [loading, setLoading] = useState(!(prefetchedDetail && prefetchedDetail.id === assignmentId))
  const [scores, setScores] = useState<Record<string, number | null>>({})
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
      const initialScores: Record<string, number | null> = {}
      for (const c of data.criteria ?? []) {
        initialScores[c.id] = c.currentScore ?? ((c.rubricLevels?.length ?? 0) > 0 ? null : c.min_score)
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
        if (!appliedDetailRef.current) {
          applyDetail(data)
        }
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
          // silent fail for auto-save
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

  async function handleSubmit() {
    if (!detail) return

    const unscoredRubric = detail.criteria.some(
      (c) => c.rubricLevels && c.rubricLevels.length > 0 && scores[c.id] == null
    )
    if (unscoredRubric) {
      setError("Please select a rubric level for all criteria before submitting")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const validScores = Object.entries(scores)
        .filter(([, score]) => score !== null)
        .map(([criteriaId, score]) => ({ criteriaId, score }))

      const res = await fetch(
        `/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}/scores`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scores: validScores,
            notes,
          }),
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || "Failed to submit scores")
      }

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

  const hasUnscoredRubric = detail.criteria.some(
    (c) => c.rubricLevels && c.rubricLevels.length > 0 && scores[c.id] == null
  )

  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
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

      <div className="space-y-5">
        <h4 className="text-sm font-semibold">Scoring</h4>
        {detail.criteria.map((c) => (
          <div key={c.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">{c.name}</Label>
                {c.description && (
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                )}
              </div>
              <Badge variant="secondary">
                {c.rubricLevels && c.rubricLevels.length > 0
                  ? ((c.category ?? "core") === "core" ? "2x" : "1x")
                  : `${c.weight}x`}
              </Badge>
            </div>
            {c.rubricLevels && c.rubricLevels.length > 0 ? (
              <RubricLevelSelector
                levels={c.rubricLevels}
                selectedLevel={scores[c.id] ?? null}
                onSelect={(level) =>
                  setScores((prev) => ({
                    ...prev,
                    [c.id]: level,
                  }))
                }
              />
            ) : (
              <div className="flex items-center gap-3">
                <Slider
                  value={[scores[c.id] ?? c.min_score]}
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
                  value={scores[c.id] ?? c.min_score}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value)
                    const val = Number.isNaN(parsed)
                      ? c.min_score
                      : Math.max(c.min_score, Math.min(c.max_score, parsed))
                    setScores((prev) => ({ ...prev, [c.id]: val }))
                  }}
                  className="w-16 text-center"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
                <span className="text-xs text-muted-foreground w-8">/{c.max_score}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Notes</Label>
          {savingNotes && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
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
        <Button onClick={handleSubmit} disabled={submitting || hasUnscoredRubric}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Submit Scores
        </Button>
        <Button variant="outline" onClick={onClose}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
