"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { JudgeAssignmentForJudge } from "@/lib/services/judging"
import { JudgeReviewPanel } from "./judge-review-panel"
import { JudgeWebMcpTools, JUDGE_WEBMCP_OPEN_EVENT } from "./judge-webmcp-tools"
import { useEffect } from "react"
import { buildJudgeReviewTasks, type JudgeReviewTask as Task } from "@/lib/utils/judging-review-queue"

type Props = { slug: string; assignments: JudgeAssignmentForJudge[]; activeAssignmentIds?: string[]; draftTargetIds?: string[]; initialReview?: string; canJudge: boolean; browseEnabled?: boolean }

export function JudgeWorkspace({ slug, assignments, activeAssignmentIds, draftTargetIds = [], initialReview, canJudge, browseEnabled = false }: Props) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState(canJudge ? "todo" : "all")
  const [selectedId, setSelectedId] = useState<string | null>(initialReview ?? null)
  const [completedHere, setCompletedHere] = useState<Set<string>>(new Set())
  const tasks = useMemo(() => buildJudgeReviewTasks(assignments, draftTargetIds).map((task) => ({ ...task, isComplete: task.isComplete || completedHere.has(task.id) })), [assignments, completedHere, draftTargetIds])
  const selected = tasks.find((task) => task.id === selectedId) ?? null
  const completeCount = tasks.filter((task) => task.isComplete).length
  const activeIds = new Set(activeAssignmentIds ?? assignments.map((assignment) => assignment.id))
  const taskIsOpen = (task: Task) => task.assignmentIds.some((id) => activeIds.has(id))
  const visible = tasks.filter((task) => (filter === "all" || filter === "submitted" && task.isComplete || filter === "progress" && taskIsOpen(task) && task.started && !task.isComplete || filter === "todo" && taskIsOpen(task) && !task.isComplete) && `${task.title} ${task.prizeName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))

  function openTask(id: string) {
    setSelectedId(id)
    const url = new URL(window.location.href)
    url.searchParams.set("review", id)
    window.history.replaceState(null, "", url)
  }

  function nextTask(completedId?: string) {
    if (completedId) setCompletedHere((current) => new Set(current).add(completedId))
    const index = tasks.findIndex((task) => task.id === selectedId)
    const ordered = [...tasks.slice(index + 1), ...tasks.slice(0, index + 1)]
    const next = ordered.find((task) => taskIsOpen(task) && !task.isComplete && task.id !== completedId && task.id !== selectedId)
    if (next) openTask(next.id)
    else { setSelectedId(null); if (completedId) setFilter("submitted") }
  }

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const id = (event as CustomEvent<{ assignmentId?: string }>).detail?.assignmentId
      const task = tasks.find((task) => task.assignmentIds.includes(id ?? ""))
      if (task) { setFilter("all"); setQuery(""); setSelectedId(task.id) }
    }
    window.addEventListener(JUDGE_WEBMCP_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(JUDGE_WEBMCP_OPEN_EVENT, handleOpen)
  }, [tasks])

  const webAssignments = assignments.map((assignment) => ({ id: assignment.id, submissionId: assignment.submissionId, title: assignment.submissionTitle, description: assignment.submissionDescription, githubUrl: assignment.submissionGithubUrl, liveAppUrl: assignment.submissionLiveAppUrl, demoVideoUrl: assignment.submissionDemoVideoUrl, teamName: assignment.teamName, isComplete: assignment.isComplete, notes: assignment.notes, judgingStyle: (assignment.judgingStyle === "bucket_sort" || assignment.judgingStyle === "gate_check" || assignment.judgingStyle === "judges_pick" ? assignment.judgingStyle : "weighted_score") as "weighted_score" | "bucket_sort" | "gate_check" | "judges_pick", prizeName: assignment.prizeName }))

  return <JudgeWebMcpTools slug={slug} assignments={webAssignments} enabled={canJudge}>
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="space-y-2 sm:w-72"><p className="text-sm">{completeCount} of {tasks.length} reviews submitted</p><Progress value={tasks.length ? completeCount / tasks.length * 100 : 0} aria-label="Submitted reviews" /></div><div className="flex flex-wrap gap-2">{browseEnabled && <Button asChild variant="outline"><Link href={`/e/${slug}/judge/projects`}>Browse projects</Link></Button>}<Button asChild variant="outline"><Link href={`/e/${slug}/judge/summary`}>Your submitted reviews</Link></Button></div></div>
      <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-3" aria-label="Your review queue">
          <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Find an assigned project" placeholder="Find a project…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" /></div>
          <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filter your reviews"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">To review</SelectItem><SelectItem value="progress">In progress</SelectItem><SelectItem value="submitted">Submitted</SelectItem><SelectItem value="all">All reviews</SelectItem></SelectContent></Select>
          <div className="max-h-64 space-y-2 overflow-y-auto lg:max-h-[65vh]">{visible.map((task) => <Button key={task.id} variant={selectedId === task.id ? "secondary" : "outline"} className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => openTask(task.id)} aria-current={selectedId === task.id ? "true" : undefined}><span className="min-w-0 flex-1 space-y-1"><span className="block break-words font-medium">{task.title}</span><span className="block text-xs text-muted-foreground">{task.ballot ? `${task.projectCount} projects to choose from` : task.prizeName || "Project review"}</span><Badge variant={task.isComplete ? "secondary" : "outline"}>{task.isComplete ? "Submitted" : !taskIsOpen(task) ? "Not open" : task.started ? "In progress" : "To review"}</Badge></span>{task.isComplete ? <Check aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</Button>)}{visible.length === 0 && <p className="py-4 text-sm text-muted-foreground">{query ? "No projects match your search." : filter === "todo" && tasks.length ? "You're caught up. You can review your submitted work." : "No reviews in this list yet."}</p>}</div>
        </aside>
        <div className="min-w-0">{selected ? <JudgeReviewPanel key={selected.id} slug={slug} targetId={selected.id} ballot={selected.ballot} assignmentIds={selected.assignmentIds} onSubmitted={() => nextTask(selected.id)} onSkip={() => nextTask()} /> : <Card><CardHeader><CardTitle>{tasks.length === 0 ? "Your projects will appear here" : completeCount === tasks.length ? "You're caught up" : "Ready to review?"}</CardTitle></CardHeader><CardContent><div className="space-y-4"><p className="text-sm text-muted-foreground">{tasks.length === 0 ? "Your organizer will assign projects. We'll let you know when they're ready." : completeCount === tasks.length ? "Your reviews are submitted. You can change them while judging is open." : "Open a project, check its demo, and fill in your review. Your draft saves as you go."}</p>{tasks.some((task) => taskIsOpen(task) && !task.isComplete) && <Button onClick={() => openTask(tasks.find((task) => taskIsOpen(task) && !task.isComplete)!.id)}>{canJudge ? "Start the next review" : "Read your next review"}<ChevronRight /></Button>}</div></CardContent></Card>}</div>
      </div>
    </div>
  </JudgeWebMcpTools>
}
