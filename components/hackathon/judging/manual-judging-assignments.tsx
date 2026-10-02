"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import type { JudgeAssignmentOptions, ManualJudgingAssignment } from "@/lib/services/judging-distribution"

type JudgeChoice = { participantId: string; displayName: string }

export function ManualJudgingAssignments({ hackathonId, judges, initialJudgeId }: { hackathonId: string; judges: JudgeChoice[]; initialJudgeId?: string }) {
  const [pickedJudge, setPickedJudge] = useState(initialJudgeId ?? judges[0]?.participantId ?? "")
  const judgeId = judges.some((judge) => judge.participantId === pickedJudge) ? pickedJudge : judges[0]?.participantId
  if (!judgeId) return <p className="text-sm text-muted-foreground">Once a judge accepts, you can pick their projects here.</p>
  return <div className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="manual-judge">Whose projects do you want to change?</Label>
      <Select value={judgeId} onValueChange={setPickedJudge}>
        <SelectTrigger id="manual-judge"><SelectValue /></SelectTrigger>
        <SelectContent>{judges.map((judge) => <SelectItem key={judge.participantId} value={judge.participantId}>{judge.displayName}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <JudgeAssignmentControls key={`${hackathonId}:${judgeId}`} hackathonId={hackathonId} judgeParticipantId={judgeId} />
  </div>
}

export function JudgeAssignmentControls({ hackathonId, judgeParticipantId }: { hackathonId: string; judgeParticipantId: string }) {
  const router = useRouter()
  const [options, setOptions] = useState<JudgeAssignmentOptions | null>(null)
  const [draft, setDraft] = useState<{ prizeScope: "all" | "selected"; prizeIds: string[]; roomIds: string[] }>({ prizeScope: "all", prizeIds: [], roomIds: [] })
  const [prizeId, setPrizeId] = useState("weighted")
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const endpoint = `/api/dashboard/hackathons/${hackathonId}/judging/judges/${judgeParticipantId}/scope`
  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { signal: controller.signal }).then(assertOkJson<{ options: JudgeAssignmentOptions }>).then(({ options: value }) => {
      if (!controller.signal.aborted) {
        setOptions(value)
        setDraft({ prizeScope: value.prizeScope, prizeIds: value.prizeIds, roomIds: value.roomIds })
        setPrizeId(value.prizes.some((prize) => prize.style === "weighted_score") ? "weighted" : value.prizes[0]?.id ?? "weighted")
      }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "We couldn't load judge settings.") })
    return () => controller.abort()
  }, [endpoint, reload])

  function toggleScopeId(field: "prizeIds" | "roomIds", id: string) {
    setDraft((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((value) => value !== id) : [...current[field], id] }))
  }

  async function saveScope() {
    if (!options || options.locked || saving) return
    const previous = options
    setOptions({ ...options, ...draft })
    setSaving(true)
    setError(null)
    try {
      const result = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: previous.version, ...draft }) }).then(assertOkJson<{ options: JudgeAssignmentOptions }>)
      setOptions(result.options)
      setDraft({ prizeScope: result.options.prizeScope, prizeIds: result.options.prizeIds, roomIds: result.options.roomIds })
      router.refresh()
    } catch (cause) {
      setOptions(previous)
      setError(cause instanceof Error ? cause.message : "We couldn't save judge settings.")
    } finally { setSaving(false) }
  }

  return <div className="space-y-4">
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => { setError(null); setReload((value) => value + 1) }}>Reload judge settings</Button></div>}
    {!options ? !error && <Skeleton className="h-20 w-full" aria-label="Loading judge settings" /> : <>
      <Collapsible>
        <CollapsibleTrigger asChild><Button variant="outline">Edit prizes and rooms</Button></CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {options.locked && <p className="text-sm text-muted-foreground">Submitted reviews keep this judge&apos;s prizes and rooms fixed.</p>}
          <form autoComplete="off" className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveScope() }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void saveScope() } }}>
            <div className="space-y-2">
              <Label htmlFor={`judge-prize-scope-${judgeParticipantId}`}>Which prizes can they judge?</Label>
              <Select value={draft.prizeScope} disabled={options.locked || saving} onValueChange={(value) => setDraft((current) => ({ ...current, prizeScope: value as "all" | "selected" }))}>
                <SelectTrigger id={`judge-prize-scope-${judgeParticipantId}`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All prizes</SelectItem><SelectItem value="selected">Only prizes I choose</SelectItem></SelectContent>
              </Select>
              {draft.prizeScope === "selected" && options.prizes.map((prize) => <div key={prize.id} className="flex items-center gap-2"><Checkbox id={`scope-prize-${prize.id}`} checked={draft.prizeIds.includes(prize.id)} disabled={options.locked || saving} onCheckedChange={() => toggleScopeId("prizeIds", prize.id)} /><Label htmlFor={`scope-prize-${prize.id}`}>{prize.name}</Label></div>)}
            </div>
            {options.rooms.length > 0 && <fieldset className="space-y-2" disabled={options.locked || saving}>
              <legend className="text-sm font-medium">Which rooms can they judge?</legend>
              <p className="text-sm text-muted-foreground">Leave every room unchecked to include all projects.</p>
              {options.rooms.map((room) => <div key={room.id} className="flex items-center gap-2"><Checkbox id={`scope-room-${room.id}`} checked={draft.roomIds.includes(room.id)} disabled={options.locked || saving} onCheckedChange={() => toggleScopeId("roomIds", room.id)} /><Label htmlFor={`scope-room-${room.id}`}>{room.name}</Label></div>)}
            </fieldset>}
            <Button type="submit" disabled={options.locked || saving || (draft.prizeScope === "selected" && !draft.prizeIds.length)}>{saving ? "Saving settings…" : "Save prizes and rooms"}</Button>
          </form>
        </CollapsibleContent>
      </Collapsible>
      <div className="space-y-2">
        <Label htmlFor={`manual-scorecard-${judgeParticipantId}`}>Which scorecard?</Label>
        <Select value={prizeId} onValueChange={setPrizeId} disabled={saving}>
          <SelectTrigger id={`manual-scorecard-${judgeParticipantId}`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="weighted">Shared number scorecard</SelectItem>{options.prizes.filter((prize) => ["gate_check", "bucket_sort", "judges_pick"].includes(prize.style ?? "")).map((prize) => <SelectItem key={prize.id} value={prize.id}>{prize.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {options.prizes.find((prize) => prize.id === prizeId)?.style === "judges_pick"
        ? <p className="text-sm text-muted-foreground">For favorite picks, judges choose from eligible projects. Add this prize under “Edit prizes and rooms” to include it in their judging.</p>
        : <JudgeProjectAssignments key={`${prizeId}:${options.version}`} hackathonId={hackathonId} judgeParticipantId={judgeParticipantId} prizeId={prizeId === "weighted" ? undefined : prizeId} />}
    </>}
  </div>
}

export function JudgeProjectAssignments({ hackathonId, judgeParticipantId, prizeId }: { hackathonId: string; judgeParticipantId: string; prizeId?: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<ManualJudgingAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState<Set<string>>(new Set())
  const endpoint = `/api/dashboard/hackathons/${hackathonId}/judging/judges/${judgeParticipantId}/submissions`
  const queryString = prizeId ? `?prizeId=${encodeURIComponent(prizeId)}` : ""

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${endpoint}${queryString}`, { signal: controller.signal }).then(assertOkJson<{ submissions: ManualJudgingAssignment[] }>).then(({ submissions }) => {
      if (!controller.signal.aborted) setRows(submissions)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "We couldn't load these projects.")
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [endpoint, queryString])

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return rows.filter((row) => !search || [row.projectTitle, row.teamName ?? "", ...row.prizeNames].some((value) => value.toLowerCase().includes(search)))
  }, [rows, query])

  async function toggle(row: ManualJudgingAssignment) {
    if (pending.has(row.submissionId) || row.isComplete || (!row.isAssigned && !row.canAssign)) return
    const nextAssigned = !row.isAssigned
    setError(null)
    setPending((current) => new Set(current).add(row.submissionId))
    setRows((current) => current.map((item) => item.submissionId === row.submissionId ? { ...item, isAssigned: nextAssigned } : item))
    try {
      await fetch(`${endpoint}/${row.submissionId}${queryString}`, { method: nextAssigned ? "POST" : "DELETE" }).then(assertOk)
      router.refresh()
    } catch (cause) {
      setRows((current) => current.map((item) => item.submissionId === row.submissionId ? row : item))
      setError(cause instanceof Error ? cause.message : "We couldn't change this project.")
    } finally {
      setPending((current) => { const next = new Set(current); next.delete(row.submissionId); return next })
    }
  }

  return <div className="space-y-3">
    <div className="space-y-2">
      <Label htmlFor={`manual-project-search-${judgeParticipantId}`}>Find a project</Label>
      <Input id={`manual-project-search-${judgeParticipantId}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects or prizes" autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" />
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <div aria-label="Loading projects" className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div> : <>
      <p className="text-sm text-muted-foreground">{rows.filter((row) => row.isAssigned).length} projects assigned. Submitted reviews stay saved.</p>
      {visible.length ? <ul className="divide-y rounded-md border">
        {visible.map((row) => <li key={row.submissionId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="break-words font-medium">{row.projectTitle}</p>
            {row.prizeNames.length > 0 && <p className="text-sm text-muted-foreground">{row.prizeNames.join(" · ")}</p>}
            {row.blockedReason && <p className="text-sm text-muted-foreground">{row.blockedReason}</p>}
          </div>
          {row.isComplete ? <Badge variant="secondary">Review submitted</Badge> : <Button variant="outline" size="sm" disabled={pending.has(row.submissionId) || (!row.isAssigned && !row.canAssign)} onClick={() => void toggle(row)} aria-label={`${row.isAssigned ? "Remove" : "Assign"} ${row.projectTitle}`}>{row.isAssigned ? "Remove project" : "Assign project"}</Button>}
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">{query ? "No projects match your search." : "No projects have been submitted yet."}</p>}
    </>}
  </div>
}
