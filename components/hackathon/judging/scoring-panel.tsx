"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Loader2, ExternalLink, Github, Maximize2, AlertTriangle, Play } from "lucide-react"
import { RubricLevelSelector } from "./rubric-level-selector"
import Image from "next/image"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import type { AssignmentDetail } from "@/lib/services/judging"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { useJudgeWebMcpEditor } from "./judge-webmcp-tools"
import { useSerializedNoteSave } from "./use-serialized-note-save"

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
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const appliedDetailRef = useRef<string | null>(null)
  const prefetchedDetailRef = useRef(prefetchedDetail)
  prefetchedDetailRef.current = prefetchedDetail

  const persistNotes = useCallback(async (value: string) => {
    await fetch(
      `/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}/notes`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      },
    ).then(assertOk)
  }, [assignmentId, hackathonSlug])
  const {
    saving: savingNotes,
    saveError: notesSaveError,
    reset: resetNotesSave,
    stage: stageNotesSave,
    schedule: scheduleNotesSave,
    flush: flushNotesSave,
  } = useSerializedNoteSave(persistNotes)

  useEffect(() => {
    setError(null)
    appliedDetailRef.current = null

    function applyDetail(data: AssignmentDetail) {
      setDetail(data)
      const initialScores: Record<string, number | null> = {}
      for (const c of data.criteria ?? []) {
        initialScores[c.id] = c.currentScore ?? null
      }
      setScores(initialScores)
      const savedNotes = data.notes ?? ""
      setNotes(savedNotes)
      resetNotesSave(savedNotes)
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
  }, [assignmentId, hackathonSlug, resetNotesSave])

  function handleNotesChange(value: string) {
    setNotes(value)
    scheduleNotesSave(value)
  }

  async function handleSubmit() {
    if (!detail) return

    if (detail.criteria.length === 0) {
      setError("Scoring isn't ready yet. Ask the organizer to add score categories.")
      return
    }

    if (detail.criteria.some((criterion) => scores[criterion.id] == null)) {
      setError("Choose a score for every category before submitting.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const notesSaved = await flushNotesSave(notes)
      if (!notesSaved) {
        setError("Save your notes before submitting. Retry the note save, then try again.")
        return
      }
      const validScores = detail.criteria.map((criterion) => ({
        criteriaId: criterion.id,
        score: scores[criterion.id] as number,
      }))

      const res = await fetch(
        `/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}/scores`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scores: validScores,
          }),
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
          setNotes(preparation.notes)
          stageNotesSave(preparation.notes)
        }
        setError(null)
        return {
          prepared: true,
          message: "Scores are filled in. Review them, then click Submit scores.",
        }
      },
    }
  }, [detail, stageNotesSave])

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

  const hasMissingScores =
    detail.criteria.length === 0 ||
    detail.criteria.some((criterion) => scores[criterion.id] == null)

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
              className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md bg-background/80 backdrop-blur-sm border px-2 py-1 text-xs font-medium opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
        {detail.criteria.length === 0 && (
          <p className="text-sm text-destructive">
            Scoring isn&apos;t ready yet. Ask the organizer to add score categories.
          </p>
        )}
        {detail.criteria.map((c) => (
          <div key={c.id} className="space-y-2">
            <div>
              <Label htmlFor={`score-${assignmentId}-${c.id}`} className="text-sm font-medium">{c.name}</Label>
              {c.description && (
                <p className="text-xs text-muted-foreground">{c.description}</p>
              )}
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
                disabled={submitting}
              />
            ) : (
              <div className="flex items-center gap-3">
                <Slider
                  aria-label={`${c.name} score slider`}
                  value={[scores[c.id] ?? c.min_score]}
                  onValueChange={([val]) =>
                    setScores((prev) => ({ ...prev, [c.id]: val }))
                  }
                  min={c.min_score}
                  max={c.max_score}
                  step={1}
                  className="flex-1"
                  disabled={submitting}
                />
                <Input
                  id={`score-${assignmentId}-${c.id}`}
                  aria-label={`${c.name} score`}
                  type="number"
                  min={c.min_score}
                  max={c.max_score}
                  value={scores[c.id] ?? ""}
                  placeholder={String(c.min_score)}
                  onChange={(e) => {
                    if (e.target.value === "") {
                      setScores((prev) => ({ ...prev, [c.id]: null }))
                      return
                    }
                    const parsed = parseInt(e.target.value)
                    const val = Number.isNaN(parsed)
                      ? null
                      : Math.max(c.min_score, Math.min(c.max_score, parsed))
                    setScores((prev) => ({ ...prev, [c.id]: val }))
                  }}
                  className="w-16 text-center"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  disabled={submitting}
                />
                <span className="text-xs text-muted-foreground w-8">/{c.max_score}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`notes-${assignmentId}`}>Notes</Label>
          {savingNotes && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
          {!savingNotes && notesSaveError && (
            <Button variant="link" size="sm" disabled={submitting} onClick={() => void flushNotesSave(notes)}>
              Notes weren&apos;t saved. Retry
            </Button>
          )}
        </div>
        <Textarea
          id={`notes-${assignmentId}`}
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          onBlur={() => void flushNotesSave(notes)}
          placeholder="Add your notes about this submission..."
          rows={3}
          maxLength={2_000}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          disabled={submitting}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={submitting || hasMissingScores}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {detail.isComplete ? "Save changes" : "Submit scores"}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
