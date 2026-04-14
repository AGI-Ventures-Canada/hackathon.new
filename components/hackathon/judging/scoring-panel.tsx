"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, ExternalLink, Github, Maximize2, AlertTriangle } from "lucide-react"
import { RubricLevelSelector } from "./rubric-level-selector"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"

type CriterionWithScore = {
  id: string
  name: string
  description: string | null
  max_score: number
  weight: number
  category?: string | null
  currentScore: number | null
  rubricLevels?: { id: string; level_number: number; label: string; description: string | null }[]
}

type AssignmentDetail = {
  id: string
  submissionId: string
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionScreenshotUrl: string | null
  teamName: string | null
  isComplete: boolean
  notes: string
  criteria: CriterionWithScore[]
}

interface ScoringPanelProps {
  hackathonSlug: string
  assignmentId: string
  onClose: () => void
  onScoreSubmitted: () => void
  cancelLabel?: string
  teamSizeWarning?: string | null
}

export function ScoringPanel({
  hackathonSlug,
  assignmentId,
  onClose,
  onScoreSubmitted,
  cancelLabel = "Cancel",
  teamSizeWarning,
}: ScoringPanelProps) {
  const [detail, setDetail] = useState<AssignmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingNotes, setSavingNotes] = useState(false)
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const notesTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setLoading(true)
    setSubmitted(false)
    setError(null)

    fetch(`/api/public/hackathons/${hackathonSlug}/judging/assignments/${assignmentId}`)
      .then((res) => res.json())
      .then((data) => {
        setDetail(data)
        const initialScores: Record<string, number | null> = {}
        for (const c of data.criteria ?? []) {
          initialScores[c.id] = c.currentScore ?? (c.rubricLevels?.length > 0 ? null : 0)
        }
        setScores(initialScores)
        setNotes(data.notes ?? "")
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
        const data = await res.json()
        throw new Error(data.error || "Failed to submit")
      }

      setSubmitted(true)
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

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <CheckCircle2 className="size-10 text-primary" />
        <p className="text-base font-semibold">Scores Submitted</p>
        <p className="text-sm text-muted-foreground">Moving to next assignment...</p>
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
              unoptimized
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.submissionScreenshotUrl}
                alt={detail.submissionTitle}
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
                  value={[scores[c.id] ?? 0]}
                  onValueChange={([val]) =>
                    setScores((prev) => ({ ...prev, [c.id]: val }))
                  }
                  min={0}
                  max={c.max_score}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  max={c.max_score}
                  value={scores[c.id] ?? 0}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(c.max_score, parseInt(e.target.value) || 0))
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
