"use client"

import { useMemo } from "react"
import { ArrowDown, ArrowUp, Check, ChevronRight } from "lucide-react"
import { useJudgingReview } from "@/hooks/use-judging-review"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Kbd } from "@/components/ui/kbd"
import { validateReviewResponse, type ReviewResponse } from "@/lib/utils/judging-review"
import { useJudgeWebMcpEditor } from "./judge-webmcp-tools"
import { ProjectReviewContent } from "./project-review-content"

type Props = { slug: string; targetId: string; ballot?: boolean; assignmentIds: string[]; onSubmitted: () => void; onSkip: () => void }

export function JudgeReviewPanel({ slug, targetId, ballot = false, assignmentIds, onSubmitted, onSkip }: Props) {
  const review = useJudgingReview(slug, targetId, ballot)
  const { snapshot, response, change } = review
  const editor = useMemo(() => {
    if (!snapshot || !response || !snapshot.canEdit) return null
    const criteria = snapshot.detail?.criteria.map((criterion, index) => ({ ref: `criterion-${index + 1}`, id: criterion.id, name: criterion.name, min: criterion.min_score, max: criterion.max_score })) ?? []
    const buckets = snapshot.detail?.buckets.map((bucket, index) => ({ ref: `bucket-${index + 1}`, id: bucket.id, label: bucket.label })) ?? []
    return {
      info: { criteria: criteria.map(({ id: _id, ...criterion }) => criterion), buckets: buckets.map(({ id: _id, ...bucket }) => bucket), maxPicks: snapshot.maxPicks },
      prepare: (preparation: import("@/lib/webmcp/judge-tools").JudgePreparation) => {
        let next: ReviewResponse = response
        if (preparation.kind !== response.kind) return { prepared: false, message: "Open the matching review first." }
        if (preparation.kind === "weighted_score" && response.kind === "weighted_score") {
          const scores = { ...response.scores }
          for (const requested of preparation.scores) {
            const criterion = criteria.find((item) => item.ref === requested.criterion || item.name.toLowerCase() === requested.criterion.toLowerCase())
            if (!criterion) return { prepared: false, message: "Choose one of the listed score categories." }
            scores[criterion.id] = requested.value
          }
          next = { ...response, scores, notes: preparation.notes ?? response.notes }
        } else if (preparation.kind === "gate_check" && response.kind === "gate_check") {
          const gates = { ...response.gates }
          for (const requested of preparation.gates) {
            const criterion = criteria.find((item) => item.ref === requested.criterion || item.name.toLowerCase() === requested.criterion.toLowerCase())
            if (!criterion) return { prepared: false, message: "Choose one of the listed checks." }
            gates[criterion.id] = requested.passed
          }
          next = { ...response, gates }
        } else if (preparation.kind === "bucket_sort" && response.kind === "bucket_sort") {
          const bucket = buckets.find((item) => item.ref === preparation.bucket || item.label.toLowerCase() === preparation.bucket.toLowerCase())
          if (!bucket) return { prepared: false, message: "Choose one of the listed groups." }
          next = { ...response, bucketId: bucket.id, notes: preparation.notes ?? response.notes }
        } else if (preparation.kind === "judges_pick") next = { ...response, kind: "judges_pick", rankedSubmissionIds: preparation.rankedSubmissionIds }
        const error = validateReviewResponse(next, snapshot, false)
        if (error) return { prepared: false, message: error }
        change(next)
        return { prepared: true, message: "Your draft is filled in. Review it, then click Submit review." }
      },
    }
  }, [change, response, snapshot])
  useJudgeWebMcpEditor(assignmentIds, editor)

  async function submit() { if (await review.submit()) onSubmitted() }
  if (!snapshot || !response) return <Card><CardContent><div className="space-y-4 py-6">{review.error ? <><p role="alert" className="text-destructive">{review.error}</p><Button variant="outline" onClick={review.reload}>Try again</Button></> : <><Skeleton className="h-8 w-2/3" /><Skeleton className="h-48 w-full" /><Skeleton className="h-24 w-full" /></>}</div></CardContent></Card>
  const disabled = !snapshot.canEdit || review.submitting
  const validation = validateReviewResponse(response, snapshot, true)
  const saveLabel = review.status === "saving" ? "Saving draft…" : review.status === "offline" ? "Offline · draft kept on this device" : review.status === "error" ? "Draft needs a retry" : review.status === "closed" ? "Judging is read-only right now" : review.status === "conflict" ? "Review changed · draft kept on this device" : snapshot.hasDraft ? snapshot.isComplete ? "Changes not submitted" : "Draft saved · not submitted" : snapshot.isComplete ? "Review submitted" : "Your draft saves as you go"
  const groupNames = new Map((snapshot.detail?.criteria ?? []).map((criterion) => [criterion.id, criterion.prizeName || "What to look for"]))

  return <div className="space-y-4" data-judge-assignment={assignmentIds[0]} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !disabled && !validation) { event.preventDefault(); void submit() } }}>
    {!snapshot.canEdit && <p role="status" className="rounded-lg border p-4 text-sm">{snapshot.editReason || "This review is read-only right now."} You can still read your submitted review and saved draft.</p>}
    <div className={snapshot.detail ? "grid items-start gap-6 xl:grid-cols-2" : "space-y-4"}>
      {snapshot.detail && <ProjectReviewContent project={snapshot.detail} />}
      <Card>
        <CardHeader><CardTitle>{snapshot.prizeName || "Your review"}</CardTitle><p className="text-sm text-muted-foreground">{response.kind === "weighted_score" ? "Choose a score for each category. Use the descriptions to guide you." : response.kind === "gate_check" ? "Check whether the project meets each requirement." : response.kind === "bucket_sort" ? "Choose the group that best describes this project." : `Pick up to ${snapshot.maxPicks} projects. Put your favorite first.`}</p></CardHeader>
        <CardContent><div className="space-y-6" onBlur={() => void review.flush()}>
          {response.kind === "weighted_score" && snapshot.detail?.criteria.map((criterion, index, criteria) => <div key={criterion.id} className="space-y-3">
            {(index === 0 || groupNames.get(criteria[index - 1].id) !== groupNames.get(criterion.id)) && <p className="border-b pb-2 text-sm font-semibold">{groupNames.get(criterion.id)}</p>}
            <div><Label htmlFor={`review-score-${criterion.id}`}>{criterion.name}</Label>{criterion.description && <p className="mt-1 text-sm text-muted-foreground">{criterion.description}</p>}</div>
            {criterion.rubricLevels.length > 0 ? <RadioGroup aria-label={`${criterion.name} rating`} disabled={disabled} value={response.scores[criterion.id] == null ? "" : String(response.scores[criterion.id])} onValueChange={(value) => change({ ...response, scores: { ...response.scores, [criterion.id]: Number(value) } })}>
              {criterion.rubricLevels.map((level) => <div className="flex items-start gap-3 rounded-lg border p-3" key={level.id}><RadioGroupItem value={String(level.level_number)} id={`rating-${targetId}-${level.id}`} /><Label htmlFor={`rating-${targetId}-${level.id}`} className="flex-1"><span>{level.level_number}. {level.label}</span>{level.description && <span className="block text-sm font-normal text-muted-foreground">{level.description}</span>}</Label></div>)}
            </RadioGroup> : <div className="flex items-center gap-3"><Input id={`review-score-${criterion.id}`} aria-label={`${criterion.name} score`} type="number" inputMode="numeric" min={criterion.min_score} max={criterion.max_score} value={response.scores[criterion.id] ?? ""} disabled={disabled} onChange={(event) => change({ ...response, scores: { ...response.scores, [criterion.id]: event.target.value === "" ? null : Number(event.target.value) } })} autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" /><span className="shrink-0 text-sm text-muted-foreground">{criterion.min_score}–{criterion.max_score}</span></div>}
          </div>)}
          {(response.kind === "gate_check" || response.kind === "bucket_sort" && response.gates) && snapshot.detail?.criteria.map((criterion) => <fieldset key={criterion.id} className="space-y-3"><legend className="font-medium">{criterion.name}</legend>{criterion.description && <p className="text-sm text-muted-foreground">{criterion.description}</p>}<RadioGroup aria-label={criterion.name} disabled={disabled} value={response.gates?.[criterion.id] == null ? "" : String(response.gates?.[criterion.id])} onValueChange={(value) => change({ ...response, gates: { ...response.gates, [criterion.id]: value === "true" } })}>{[true,false].map((value) => <div key={String(value)} className="flex items-center gap-3"><RadioGroupItem id={`check-${criterion.id}-${value}`} value={String(value)} /><Label htmlFor={`check-${criterion.id}-${value}`}>{value ? "Yes" : "No"}</Label></div>)}</RadioGroup></fieldset>)}
          {response.kind === "bucket_sort" && <RadioGroup aria-label="Project group" value={response.bucketId ?? ""} disabled={disabled} onValueChange={(bucketId) => change({ ...response, bucketId })}>{snapshot.detail?.buckets.map((bucket) => <div key={bucket.id} className="flex items-start gap-3 rounded-lg border p-3"><RadioGroupItem value={bucket.id} id={`bucket-${bucket.id}`} /><Label className="flex-1" htmlFor={`bucket-${bucket.id}`}><span>{bucket.label}</span>{bucket.description && <span className="block text-sm font-normal text-muted-foreground">{bucket.description}</span>}</Label></div>)}</RadioGroup>}
          {response.kind === "judges_pick" && <div className="space-y-4">{snapshot.projects.map((project) => {
            const position = response.rankedSubmissionIds.indexOf(project.submissionId)
            const move = (direction: number) => { const next = [...response.rankedSubmissionIds]; [next[position],next[position + direction]] = [next[position + direction],next[position]]; change({ ...response, rankedSubmissionIds: next }) }
            return <div className="space-y-3 rounded-lg border p-4" key={project.submissionId}><ProjectReviewContent project={project} /><div className="flex flex-wrap items-center gap-2">{position >= 0 && <><Badge>#{position + 1}</Badge><Button variant="outline" size="icon" aria-label={`Move ${project.submissionTitle} up`} disabled={disabled || position === 0} onClick={() => move(-1)}><ArrowUp /></Button><Button variant="outline" size="icon" aria-label={`Move ${project.submissionTitle} down`} disabled={disabled || position === response.rankedSubmissionIds.length - 1} onClick={() => move(1)}><ArrowDown /></Button></>}<Button variant={position >= 0 ? "secondary" : "outline"} disabled={disabled || (position < 0 && response.rankedSubmissionIds.length >= snapshot.maxPicks)} onClick={() => change({ ...response, rankedSubmissionIds: position >= 0 ? response.rankedSubmissionIds.filter((id) => id !== project.submissionId) : [...response.rankedSubmissionIds,project.submissionId] })}>{position >= 0 ? <><Check />Picked · remove</> : "Pick this project"}</Button></div></div>
          })}</div>}
          <div className="space-y-2"><Label htmlFor={`review-notes-${targetId}`}>Private notes</Label><Textarea id={`review-notes-${targetId}`} value={response.notes} onChange={(event) => change({ ...response, notes: event.target.value })} disabled={disabled} rows={4} maxLength={2_000} placeholder="What stood out? What would you like to check later?" autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" /><p className="text-xs text-muted-foreground">These notes stay with your review.</p></div>
        </div></CardContent>
      </Card>
    </div>
    <div className="sticky bottom-0 z-10 space-y-3 border-t bg-background py-4">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{saveLabel}</p>
      {review.error && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{review.error}</p><Button variant="outline" onClick={review.status === "conflict" || review.status === "closed" ? review.reload : () => void review.flush()}>{review.status === "closed" ? "Check judging access" : review.status === "conflict" ? "Review latest version" : "Retry save"}</Button></div>}
      {validation && snapshot.canEdit && <p className="text-sm text-muted-foreground">{validation}</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={disabled || Boolean(validation) || review.status === "conflict"} onClick={() => void submit()}>{review.submitting ? "Submitting…" : snapshot.isComplete ? "Save changes" : "Submit review"}<Kbd className="hidden sm:inline-flex">⌘↵</Kbd></Button><Button variant="outline" disabled={review.submitting} onClick={() => { void review.flush(); onSkip() }}>{snapshot.canEdit ? "Skip for now" : "Next review"}<ChevronRight /></Button></div>
    </div>
  </div>
}
