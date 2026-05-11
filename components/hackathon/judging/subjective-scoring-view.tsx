"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Trophy,
  Eye,
  EyeOff,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ExternalLink,
  Github,
  Play,
} from "lucide-react"
import Image from "next/image"

type Prize = {
  id: string
  name: string
}

type Submission = {
  id: string
  title: string
  description: string | null
  githubUrl: string | null
  liveAppUrl: string | null
  demoVideoUrl: string | null
  screenshotUrl: string | null
  teamName: string | null
  viewedAt: string | null
}

type Pick = {
  id: string
  prizeId: string
  submissionId: string
  rank: number
  reason: string | null
}

interface SubjectiveScoringViewProps {
  hackathonSlug: string
  prizes: Prize[]
  submissions: Submission[]
  initialPicks: Pick[]
}

export function SubjectiveScoringView({
  hackathonSlug,
  prizes,
  submissions,
  initialPicks,
}: SubjectiveScoringViewProps) {
  const [picks, setPicks] = useState<Pick[]>(initialPicks)
  const [viewedIds, setViewedIds] = useState<Set<string>>(
    new Set(submissions.filter((s) => s.viewedAt !== null).map((s) => s.id))
  )
  const [filter, setFilter] = useState<"all" | "viewed" | "not_viewed">("all")
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null)
  const [screenshotOpen, setScreenshotOpen] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)

  const filteredSubmissions = submissions.filter((s) => {
    if (filter === "viewed") return viewedIds.has(s.id)
    if (filter === "not_viewed") return !viewedIds.has(s.id)
    return true
  })

  const viewedCount = viewedIds.size
  const totalCount = submissions.length

  function getPickForPrize(prizeId: string): Pick | undefined {
    return picks.find((p) => p.prizeId === prizeId && p.rank === 1)
  }

  async function handlePick(prizeId: string, submissionId: string, reason?: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/public/hackathons/${hackathonSlug}/judging/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prizeId, submissionId, rank: 1, reason }),
      })

      if (!res.ok) return

      const data = await res.json()
      setPicks((prev) => {
        const filtered = prev.filter((p) => !(p.prizeId === prizeId && p.rank === 1))
        return [...filtered, { id: data.id, prizeId, submissionId, rank: 1, reason: reason ?? null }]
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleRemovePick(prizeId: string, submissionId: string) {
    setSaving(true)
    try {
      const res = await fetch(
        `/api/public/hackathons/${hackathonSlug}/judging/picks/${prizeId}/${submissionId}`,
        { method: "DELETE" }
      )

      if (!res.ok) return

      setPicks((prev) => prev.filter((p) => !(p.prizeId === prizeId && p.submissionId === submissionId)))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateReason(prizeId: string, submissionId: string, reason: string) {
    await fetch(`/api/public/hackathons/${hackathonSlug}/judging/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prizeId, submissionId, rank: 1, reason }),
    })
    setPicks((prev) =>
      prev.map((p) =>
        p.prizeId === prizeId && p.submissionId === submissionId ? { ...p, reason } : p
      )
    )
  }

  function handleOpenSubmission(submissionId: string) {
    setExpandedSubmission(expandedSubmission === submissionId ? null : submissionId)
    setViewedIds((prev) => new Set([...prev, submissionId]))
  }

  const goToNext = useCallback(() => {
    if (focusIndex < filteredSubmissions.length - 1) setFocusIndex((i) => i + 1)
  }, [focusIndex, filteredSubmissions.length])

  const goToPrev = useCallback(() => {
    if (focusIndex > 0) setFocusIndex((i) => i - 1)
  }, [focusIndex])

  useEffect(() => {
    if (!focusMode) return
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (e.key === "ArrowLeft") goToPrev()
      if (e.key === "ArrowRight") goToNext()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [focusMode, goToNext, goToPrev])

  if (focusMode) {
    const current = filteredSubmissions[focusIndex]
    if (!current) {
      setFocusMode(false)
      return null
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="size-8" disabled={focusIndex === 0} onClick={goToPrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex-1 flex items-center gap-3">
            <span className="text-sm font-medium whitespace-nowrap">
              {focusIndex + 1} of {filteredSubmissions.length}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((viewedCount) / totalCount) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{viewedCount}/{totalCount} viewed</span>
          </div>
          <Button variant="outline" size="icon" className="size-8" disabled={focusIndex === filteredSubmissions.length - 1} onClick={goToNext}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFocusMode(false)}>
            Exit Focus
          </Button>
        </div>

        <SubmissionDetail
          submission={current}
          hackathonSlug={hackathonSlug}
          prizes={prizes}
          picks={picks}
          saving={saving}
          onPick={handlePick}
          onRemovePick={handleRemovePick}
          onUpdateReason={handleUpdateReason}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Badge variant="secondary">
          {viewedCount}/{totalCount} viewed
        </Badge>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="not_viewed">Not viewed</SelectItem>
              <SelectItem value="viewed">Viewed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setFocusMode(true); setFocusIndex(0) }}>
            Focus Mode
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold">Your Picks</h4>
        {prizes.map((prize) => {
          const pick = getPickForPrize(prize.id)
          const pickedSubmission = pick ? submissions.find((s) => s.id === pick.submissionId) : null

          return (
            <PickCard
              key={prize.id}
              prize={prize}
              pick={pick}
              pickedSubmission={pickedSubmission}
              hackathonSlug={hackathonSlug}
              saving={saving}
              onRemove={() => pick && handleRemovePick(prize.id, pick.submissionId)}
              onUpdateReason={(reason) => pick && handleUpdateReason(prize.id, pick.submissionId, reason)}
            />
          )
        })}
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Submissions</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredSubmissions.map((sub) => {
            const isViewed = viewedIds.has(sub.id)
            const isExpanded = expandedSubmission === sub.id
            const subPicks = picks.filter((p) => p.submissionId === sub.id)

            return (
              <Card
                key={sub.id}
                className={`cursor-pointer transition-colors ${isExpanded ? "ring-1 ring-primary" : ""}`}
                onClick={() => handleOpenSubmission(sub.id)}
              >
                {sub.screenshotUrl && (
                  <div className="relative h-32 overflow-hidden rounded-t-lg">
                    <Image
                      src={sub.screenshotUrl}
                      alt={sub.title}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 rounded bg-background/80 p-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setScreenshotOpen(sub.screenshotUrl)
                      }}
                    >
                      <Maximize2 className="size-3" />
                    </button>
                  </div>
                )}
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{sub.title}</p>
                      {sub.teamName && (
                        <p className="text-xs text-muted-foreground">{sub.teamName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {subPicks.length > 0 && (
                        <Badge variant="default" className="text-xs">
                          <Trophy className="size-3 mr-0.5" />
                          {subPicks.length}
                        </Badge>
                      )}
                      {isViewed ? (
                        <Eye className="size-3.5 text-muted-foreground" />
                      ) : (
                        <EyeOff className="size-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                      {sub.description && (
                        <p className="text-xs text-muted-foreground">{sub.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {sub.githubUrl && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                            <a href={sub.githubUrl} target="_blank" rel="noopener noreferrer">
                              <Github className="mr-1 size-3" /> GitHub
                            </a>
                          </Button>
                        )}
                        {sub.liveAppUrl && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                            <a href={sub.liveAppUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1 size-3" /> Demo
                            </a>
                          </Button>
                        )}
                        {sub.demoVideoUrl && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                            <a href={sub.demoVideoUrl} target="_blank" rel="noopener noreferrer">
                              <Play className="mr-1 size-3" /> Video
                            </a>
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Pick for:</p>
                        {prizes.map((prize) => {
                          const existing = picks.find(
                            (p) => p.prizeId === prize.id && p.rank === 1
                          )
                          const isPickedForThis = existing?.submissionId === sub.id

                          return (
                            <Button
                              key={prize.id}
                              variant={isPickedForThis ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-xs mr-1"
                              disabled={saving}
                              onClick={() => {
                                if (isPickedForThis) {
                                  handleRemovePick(prize.id, sub.id)
                                } else {
                                  handlePick(prize.id, sub.id)
                                }
                              }}
                            >
                              {isPickedForThis && <Trophy className="mr-1 size-3" />}
                              {prize.name}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {screenshotOpen && (
        <Dialog open={!!screenshotOpen} onOpenChange={() => setScreenshotOpen(null)}>
          <DialogContent className="max-w-6xl w-full p-2">
            <DialogTitle className="sr-only">Screenshot</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screenshotOpen} alt="Screenshot" className="w-full h-auto rounded-md" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function PickCard({
  prize,
  pick,
  pickedSubmission,
  hackathonSlug: _hackathonSlug,
  saving,
  onRemove,
  onUpdateReason,
}: {
  prize: Prize
  pick: Pick | undefined
  pickedSubmission: Submission | null | undefined
  hackathonSlug: string
  saving: boolean
  onRemove: () => void
  onUpdateReason: (reason: string) => void
}) {
  const [reason, setReason] = useState(pick?.reason ?? "")
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout>>()

  function handleReasonChange(value: string) {
    setReason(value)
    clearTimeout(debounceTimer)
    setDebounceTimer(setTimeout(() => onUpdateReason(value), 1000))
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{prize.name}</span>
        </div>
        {pick && (
          <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={saving} onClick={onRemove}>
            <X className="size-3 mr-1" /> Remove
          </Button>
        )}
      </div>
      {pickedSubmission ? (
        <div className="space-y-2">
          <p className="text-sm">
            Your pick: <span className="font-medium">{pickedSubmission.title}</span>
            {pickedSubmission.teamName && (
              <span className="text-muted-foreground"> by {pickedSubmission.teamName}</span>
            )}
          </p>
          <Textarea
            value={reason}
            onChange={(e) => handleReasonChange(e.target.value)}
            placeholder="Why did you pick this? (optional)"
            rows={2}
            className="text-sm resize-none"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No pick yet — browse submissions below</p>
      )}
    </div>
  )
}

function SubmissionDetail({
  submission,
  hackathonSlug: _hackathonSlug,
  prizes,
  picks,
  saving,
  onPick,
  onRemovePick,
  onUpdateReason: _onUpdateReason,
}: {
  submission: Submission
  hackathonSlug: string
  prizes: Prize[]
  picks: Pick[]
  saving: boolean
  onPick: (prizeId: string, submissionId: string) => void
  onRemovePick: (prizeId: string, submissionId: string) => void
  onUpdateReason: (prizeId: string, submissionId: string, reason: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{submission.title}</h3>
        {submission.teamName && (
          <p className="text-sm text-muted-foreground">{submission.teamName}</p>
        )}
      </div>

      {submission.screenshotUrl && (
        <div className="relative rounded-lg border overflow-hidden">
          <Image
            src={submission.screenshotUrl}
            alt={submission.title}
            width={1920}
            height={1080}
            unoptimized
            className="w-full h-[200px] object-cover"
          />
        </div>
      )}

      {submission.description && (
        <p className="text-sm text-muted-foreground">{submission.description}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {submission.githubUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={submission.githubUrl} target="_blank" rel="noopener noreferrer">
              <Github className="mr-2 size-3.5" /> GitHub
            </a>
          </Button>
        )}
        {submission.liveAppUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={submission.liveAppUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-3.5" /> Live Demo
            </a>
          </Button>
        )}
        {submission.demoVideoUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={submission.demoVideoUrl} target="_blank" rel="noopener noreferrer">
              <Play className="mr-2 size-3.5" /> Video
            </a>
          </Button>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-semibold">Pick for Prize</h4>
        {prizes.map((prize) => {
          const existing = picks.find((p) => p.prizeId === prize.id && p.rank === 1)
          const isPickedForThis = existing?.submissionId === submission.id

          return (
            <div key={prize.id} className="flex items-center gap-2">
              <Button
                variant={isPickedForThis ? "default" : "outline"}
                size="sm"
                disabled={saving}
                onClick={() => {
                  if (isPickedForThis) {
                    onRemovePick(prize.id, submission.id)
                  } else {
                    onPick(prize.id, submission.id)
                  }
                }}
              >
                {isPickedForThis && <Trophy className="mr-1.5 size-3.5" />}
                {prize.name}
              </Button>
              {existing && !isPickedForThis && (
                <span className="text-xs text-muted-foreground">
                  Currently: {submission.title}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
