"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, ExternalLink, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"

type ShowcaseRound = { id: string; name: string }
type ShowcaseSubmission = { id: string; title: string; submitter: string }
type SubmissionListResponse = { submissions: ShowcaseSubmission[] }

type PresenterViewConfig =
  | { kind: "round_finalists"; roundId: string }
  | { kind: "manual"; submissionIds: string[] }

type PresenterView = {
  id: string
  name: string
  config: PresenterViewConfig
  updated_at: string
}

type ShowcaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hackathonId: string
  hackathonSlug: string
  rounds: ShowcaseRound[]
}

export function ShowcaseDialog({
  open,
  onOpenChange,
  hackathonId,
  hackathonSlug,
  rounds,
}: ShowcaseDialogProps) {
  const [views, setViews] = useState<PresenterView[]>([])
  const [loadingViews, setLoadingViews] = useState(false)
  const [submissions, setSubmissions] = useState<ShowcaseSubmission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const submissionsLoadedRef = useRef(false)
  const [tab, setTab] = useState<"saved" | "new">("saved")
  const [kind, setKind] = useState<"round_finalists" | "manual">("round_finalists")
  const [name, setName] = useState("")
  const [roundId, setRoundId] = useState<string>("")
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadViews = useCallback(async () => {
    setLoadingViews(true)
    try {
      const data = await fetch(`/api/dashboard/hackathons/${hackathonId}/presenter-views`)
        .then(assertOkJson<{ views: PresenterView[] }>)
      setViews(data.views ?? [])
    } catch (err) {
      console.error("Failed to load presenter views", err)
    } finally {
      setLoadingViews(false)
    }
  }, [hackathonId])

  const loadSubmissions = useCallback(async () => {
    if (submissionsLoadedRef.current) return
    setLoadingSubmissions(true)
    try {
      const data = await fetch(`/api/dashboard/hackathons/${hackathonId}/submissions`)
        .then(assertOkJson<SubmissionListResponse>)
      setSubmissions(data.submissions ?? [])
      submissionsLoadedRef.current = true
    } catch (err) {
      console.error("Failed to load submissions", err)
    } finally {
      setLoadingSubmissions(false)
    }
  }, [hackathonId])

  useEffect(() => {
    if (!open) return
    setError(null)
    setName("")
    setKind("round_finalists")
    setRoundId(rounds[0]?.id ?? "")
    setPickedIds(new Set())
    submissionsLoadedRef.current = false
    setSubmissions([])
    void loadViews()
  }, [open, rounds, loadViews])

  useEffect(() => {
    if (!open) return
    setTab(views.length > 0 ? "saved" : "new")
  }, [open, views.length])

  useEffect(() => {
    if (!open) return
    if (kind !== "manual") return
    void loadSubmissions()
  }, [open, kind, loadSubmissions])

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    },
    []
  )

  const showcaseUrl = useCallback(
    (viewId: string) =>
      `${window.location.origin}/e/${hackathonSlug}/display/showcase?view=${viewId}`,
    [hackathonSlug]
  )

  async function copyLink(viewId: string) {
    try {
      await navigator.clipboard.writeText(showcaseUrl(viewId))
    } catch {
      // ignore — user can still click "Open"
    }
    setCopiedId(viewId)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000)
  }

  function togglePicked(id: string) {
    setPickedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Give this view a short name so you can find it later.")
      return
    }
    let config: PresenterViewConfig
    if (kind === "round_finalists") {
      if (!roundId) {
        setError("Pick a round to pull projects from.")
        return
      }
      config = { kind: "round_finalists", roundId }
    } else {
      if (pickedIds.size === 0) {
        setError("Pick at least one project to display.")
        return
      }
      config = { kind: "manual", submissionIds: Array.from(pickedIds) }
    }

    setSaving(true)
    setError(null)
    try {
      const view = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/presenter-views`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), config }),
        }
      ).then(assertOkJson<PresenterView>)
      setViews((prev) => [view, ...prev])
      setTab("saved")
      setName("")
      setPickedIds(new Set())
      void copyLink(view.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save view")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(viewId: string) {
    setViews((prev) => prev.filter((v) => v.id !== viewId))
    try {
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/presenter-views/${viewId}`,
        { method: "DELETE" }
      ).then(assertOk)
    } catch (err) {
      console.error("Failed to delete presenter view", err)
      void loadViews()
    }
  }

  const submissionsSorted = useMemo(
    () =>
      [...submissions].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
      ),
    [submissions]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Show projects on the big screen</DialogTitle>
          <DialogDescription>
            Pick what to show, save it, then open or share the link. Saved views stay here so you can re-open them anytime.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "saved" | "new")}>
          <TabsList>
            <TabsTrigger value="saved">
              Saved views{views.length > 0 ? ` (${views.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="new">New view</TabsTrigger>
          </TabsList>

          <TabsContent value="saved" className="space-y-3">
            {loadingViews ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : views.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No saved views yet. Switch to <span className="font-medium">New view</span> to make one.
              </p>
            ) : (
              <ul className="space-y-2">
                {views.map((view) => {
                  const cfg = view.config
                  let summary: string
                  if (cfg.kind === "round_finalists") {
                    const roundName = rounds.find((r) => r.id === cfg.roundId)?.name ?? "Unknown round"
                    summary = `Round: ${roundName}`
                  } else {
                    const count = cfg.submissionIds.length
                    summary = `${count} project${count === 1 ? "" : "s"} picked`
                  }
                  return (
                  <li
                    key={view.id}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{view.name}</p>
                      <p className="text-xs text-muted-foreground">{summary}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyLink(view.id)}
                      >
                        {copiedId === view.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                        <span className="ml-1.5">{copiedId === view.id ? "Copied" : "Copy link"}</span>
                      </Button>
                      <Button type="button" size="sm" asChild>
                        <a href={showcaseUrl(view.id)} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                          <span className="ml-1.5">Open</span>
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(view.id)}
                        aria-label="Delete view"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="new" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="showcase-name">Name</Label>
              <Input
                id="showcase-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Demo Day finalists"
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>

            <div className="space-y-2">
              <Label>What do you want to show?</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={kind === "round_finalists" ? "default" : "outline"}
                  onClick={() => setKind("round_finalists")}
                  className="flex-1"
                >
                  Projects from a round
                </Button>
                <Button
                  type="button"
                  variant={kind === "manual" ? "default" : "outline"}
                  onClick={() => setKind("manual")}
                  className="flex-1"
                >
                  Pick projects myself
                </Button>
              </div>
            </div>

            {kind === "round_finalists" ? (
              <div className="space-y-2">
                <Label htmlFor="showcase-round">Round</Label>
                {rounds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You don&apos;t have any judging rounds yet. Create one in the Judging tab first, or pick projects yourself.
                  </p>
                ) : (
                  <Select value={roundId} onValueChange={setRoundId}>
                    <SelectTrigger id="showcase-round">
                      <SelectValue placeholder="Pick a round" />
                    </SelectTrigger>
                    <SelectContent>
                      {rounds.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  We&apos;ll show every project in this round. The list updates live, so you can keep using the same link as you advance teams.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Projects ({pickedIds.size} picked)</Label>
                {loadingSubmissions ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : submissionsSorted.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No projects have been submitted yet.
                  </p>
                ) : (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                    {submissionsSorted.map((s) => {
                      const checked = pickedIds.has(s.id)
                      return (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => togglePicked(s.id)}
                          />
                          <span className="flex-1 truncate">
                            <span className="font-medium">{s.title}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {s.submitter}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {tab === "new" && (
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save & copy link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
