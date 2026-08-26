"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Gavel, CheckCircle2, Circle, ChevronDown, ChevronLeft, ChevronRight, Focus, List, Eye, AlertTriangle, Search } from "lucide-react"
import { getTeamSizeWarning } from "@/lib/utils/team-size"
import { ScoringPanel } from "./scoring-panel"
import { UnifiedScoringPanel } from "./unified-scoring-panel"
import { FocusScoringView } from "./focus-scoring-view"
import { usePrefetchAssignment } from "@/hooks/use-prefetch-assignment"
import { JUDGE_WEBMCP_OPEN_EVENT } from "./judge-webmcp-tools"

const PAGE_SIZE = 20

type TeamSettings = {
  minTeamSize: number
  allowSolo: boolean
}

type JudgeAssignment = {
  id: string
  submissionId: string
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionDemoVideoUrl: string | null
  submissionScreenshotUrl: string | null
  teamName: string | null
  teamMemberCount: number | null
  isComplete: boolean
  notes: string
  viewedAt: string | null
  assignmentKind?: "per_prize" | "unified_weighted_score"
}

interface JudgeAssignmentsCardProps {
  hackathonSlug: string
  assignments: JudgeAssignment[]
  teamSettings?: TeamSettings
  summaryHref?: string
}

export function JudgeAssignmentsCard({
  hackathonSlug,
  assignments,
  teamSettings,
  summaryHref,
}: JudgeAssignmentsCardProps) {
  const [viewMode, setViewMode] = useState<"focus" | "list">("focus")
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null)
  const [locallyCompletedIds, setLocallyCompletedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState("")

  const completedIds = useMemo(() => {
    const next = new Set<string>(locallyCompletedIds)
    for (const a of assignments) {
      if (a.isComplete) next.add(a.id)
    }
    return next
  }, [assignments, locallyCompletedIds])

  const completed = completedIds.size
  const total = assignments.length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assignments
    return assignments.filter(
      (a) =>
        a.submissionTitle.toLowerCase().includes(q) ||
        (a.teamName?.toLowerCase().includes(q) ?? false)
    )
  }, [assignments, query])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageAssignments = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleQueryChange(value: string) {
    setQuery(value)
    setPage(0)
  }

  const nextUnscoredId = useMemo(() => {
    if (!openAssignmentId) return null
    const currentIdx = assignments.findIndex((a) => a.id === openAssignmentId)
    const next = assignments.find(
      (a, idx) => idx > currentIdx && !completedIds.has(a.id)
    )
    return next?.id ?? null
  }, [openAssignmentId, assignments, completedIds])

  const prefetchCache = usePrefetchAssignment(hackathonSlug, nextUnscoredId)

  function handleScoreSubmitted(assignmentId: string) {
    const updatedIds = new Set([...completedIds, assignmentId])
    setLocallyCompletedIds((prev) => new Set(prev).add(assignmentId))

    if (viewMode === "list") {
      const currentIdx = filtered.findIndex((a) => a.id === assignmentId)
      const nextUnscored = filtered.find(
        (a, idx) => idx > currentIdx && !updatedIds.has(a.id)
      )
      if (nextUnscored) {
        setOpenAssignmentId(nextUnscored.id)
      } else {
        setOpenAssignmentId(null)
      }
    }
  }

  useEffect(() => {
    function handleOpen(event: Event) {
      const assignmentId = (event as CustomEvent<{ assignmentId?: string }>).detail
        ?.assignmentId
      const index = assignments.findIndex((assignment) => assignment.id === assignmentId)
      if (index < 0 || !assignmentId) return
      setQuery("")
      setPage(Math.floor(index / PAGE_SIZE))
      setViewMode("list")
      setOpenAssignmentId(assignmentId)
    }

    window.addEventListener(JUDGE_WEBMCP_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(JUDGE_WEBMCP_OPEN_EVENT, handleOpen)
  }, [assignments])

  if (assignments.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gavel className="size-4" />
            Your Judging Assignments
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border">
              <Button
                variant={viewMode === "focus" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1.5 rounded-r-none"
                onClick={() => setViewMode("focus")}
              >
                <Focus className="size-3.5" />
                Focus
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1.5 rounded-l-none"
                onClick={() => setViewMode("list")}
              >
                <List className="size-3.5" />
                List
              </Button>
            </div>
            <Badge variant="secondary">
              {completed}/{total} scored
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "focus" ? (
          <FocusScoringView
            hackathonSlug={hackathonSlug}
            assignments={assignments}
            initialCompletedIds={completedIds}
            onScoreSubmitted={handleScoreSubmitted}
            teamSettings={teamSettings}
            summaryHref={summaryHref}
          />
        ) : (
          <>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search projects or teams…"
                className="pl-8"
                aria-label="Search assignments"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No projects match &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              <div className="space-y-1">
                {pageAssignments.map((a) => {
                  const isComplete = completedIds.has(a.id)
                  const isOpen = openAssignmentId === a.id

                  return (
                    <div
                      key={a.id}
                      data-judge-assignment={a.id}
                      className={`rounded-lg border ${isOpen ? "border-border" : "border-transparent"}`}
                    >
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 h-auto py-3"
                        onClick={() => setOpenAssignmentId(isOpen ? null : a.id)}
                      >
                        {isComplete ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="text-left flex-1">
                          <p className="font-medium text-sm">{a.submissionTitle}</p>
                          <div className="flex items-center gap-2">
                            {a.teamName && (
                              <p className="text-xs text-muted-foreground">{a.teamName}</p>
                            )}
                            {teamSettings && a.teamMemberCount != null && getTeamSizeWarning({
                              memberCount: a.teamMemberCount,
                              minTeamSize: teamSettings.minTeamSize,
                              allowSolo: teamSettings.allowSolo,
                            }) && (
                              <Badge variant="destructive">
                                <AlertTriangle className="size-3 mr-1" />
                                Team size
                              </Badge>
                            )}
                          </div>
                        </div>
                        {!isComplete && a.viewedAt && (
                          <Eye className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {isComplete ? "Edit score" : "Score"}
                        </span>
                        <Badge variant={isComplete ? "default" : "outline"}>
                          {isComplete ? "Scored" : "Pending"}
                        </Badge>
                        <ChevronDown
                          className={`size-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </Button>

                      {isOpen && (
                        <div className="border-t px-4 py-4">
                          {a.assignmentKind === "unified_weighted_score" ? (
                            <UnifiedScoringPanel
                              hackathonSlug={hackathonSlug}
                              assignmentId={a.id}
                              onClose={() => setOpenAssignmentId(null)}
                              onScoreSubmitted={() => handleScoreSubmitted(a.id)}
                              prefetchedDetail={prefetchCache[a.id] ?? null}
                              teamSizeWarning={teamSettings && a.teamMemberCount != null
                                ? (getTeamSizeWarning({
                                    memberCount: a.teamMemberCount,
                                    minTeamSize: teamSettings.minTeamSize,
                                    allowSolo: teamSettings.allowSolo,
                                  })?.message ?? null)
                                : null
                              }
                            />
                          ) : (
                            <ScoringPanel
                              hackathonSlug={hackathonSlug}
                              assignmentId={a.id}
                              onClose={() => setOpenAssignmentId(null)}
                              onScoreSubmitted={() => handleScoreSubmitted(a.id)}
                              prefetchedDetail={prefetchCache[a.id] ?? null}
                              teamSizeWarning={teamSettings && a.teamMemberCount != null
                                ? (getTeamSizeWarning({
                                    memberCount: a.teamMemberCount,
                                    minTeamSize: teamSettings.minTeamSize,
                                    allowSolo: teamSettings.allowSolo,
                                  })?.message ?? null)
                                : null
                              }
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={page === totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
