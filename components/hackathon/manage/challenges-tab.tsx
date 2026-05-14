"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Send, Link as LinkIcon, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ChallengeEditorDialog } from "./challenge-editor-dialog"
import type { Challenge } from "@/lib/services/challenges"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

type Props = {
  hackathonId: string
  initialChallenges: Challenge[]
  hackathonStartsAt: string | null
  hackathonEndsAt: string | null
  hackathonStatus: HackathonStatus
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function describeUnlock(challenge: Challenge, hackathonStatus: HackathonStatus): string {
  if (challenge.releasedAt) return `Released ${formatDate(challenge.releasedAt)}`
  if (challenge.releaseLinkedTo === "event_publish") {
    return hackathonStatus === "published"
      ? "Unlocks when you save"
      : "Unlocks when you publish the event"
  }
  if (challenge.releaseLinkedTo === "event_start") return "Unlocks when the event starts"
  if (challenge.scheduledReleaseAt) return `Unlocks ${formatDate(challenge.scheduledReleaseAt)}`
  return "Not scheduled"
}

export function ChallengesTab({
  hackathonId,
  initialChallenges,
  hackathonStartsAt,
  hackathonEndsAt,
  hackathonStatus,
}: Props) {
  const router = useRouter()
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Challenge | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Challenge | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [releaseTarget, setReleaseTarget] = useState<Challenge | null>(null)
  const [releasingId, setReleasingId] = useState<string | null>(null)
  const [releaseError, setReleaseError] = useState<string | null>(null)

  useEffect(() => {
    setChallenges(initialChallenges)
  }, [initialChallenges])

  function openCreate() {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(c: Challenge) {
    setEditing(c)
    setEditorOpen(true)
  }

  function handleSaved(saved: Challenge) {
    setChallenges((prev) => {
      const existing = prev.findIndex((c) => c.id === saved.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = saved
        return next
      }
      return [...prev, saved]
    })
    router.refresh()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/challenges/${deleteTarget.id}`,
        { method: "DELETE" },
      )
      if (!res.ok) throw new Error()
      setChallenges((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
      router.refresh()
    } catch {
      // leave dialog open
    } finally {
      setDeleting(false)
    }
  }

  async function reorder(from: number, to: number) {
    if (to < 0 || to >= challenges.length) return
    const next = [...challenges]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setChallenges(next)
    const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/challenges/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((c) => c.id) }),
    })
    if (!res.ok) {
      setChallenges(challenges)
    } else {
      router.refresh()
    }
  }

  async function handleRelease() {
    if (!releaseTarget) return
    setReleasingId(releaseTarget.id)
    setReleaseError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/challenges/${releaseTarget.id}/release`,
        { method: "POST" },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to release challenge")
      }
      const data = (await res.json()) as { challenge: Challenge }
      setChallenges((prev) => prev.map((c) => (c.id === data.challenge.id ? data.challenge : c)))
      setReleaseTarget(null)
      router.refresh()
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Failed to release challenge")
    } finally {
      setReleasingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {challenges.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No challenges yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            What should teams build? Add a challenge to give them direction.
          </p>
          <Button className="mt-4" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Add challenge
          </Button>
        </div>
      ) : (
        <>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {challenges.length} challenge{challenges.length === 1 ? "" : "s"}
          </p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
        <div className="space-y-3">
          {challenges.map((c, idx) => {
            const released = !!c.releasedAt
            return (
              <div key={c.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{c.title}</h3>
                      <Badge variant={released ? "secondary" : "outline"} className="gap-1">
                        {released ? null : <Lock className="size-3" />}
                        {describeUnlock(c, hackathonStatus)}
                      </Badge>
                    </div>
                    {c.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {c.description}
                      </p>
                    ) : null}
                    {c.resources.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.resources.map((r, i) => (
                          <Badge key={i} variant="outline" className="gap-1">
                            <LinkIcon className="size-3" />
                            {r.label || r.url}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!released && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setReleaseTarget(c)}
                        disabled={releasingId === c.id}
                        aria-label="Release now"
                        title="Release now"
                      >
                        {releasingId === c.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => reorder(idx, idx - 1)} disabled={idx === 0} aria-label="Move up">
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => reorder(idx, idx + 1)} disabled={idx === challenges.length - 1} aria-label="Move down">
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        </>
      )}

      <ChallengeEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        hackathonId={hackathonId}
        challenge={editing}
        onSaved={handleSaved}
        hackathonStartsAt={hackathonStartsAt}
        hackathonEndsAt={hackathonEndsAt}
        hackathonStatus={hackathonStatus}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &quot;{deleteTarget?.title}&quot; and untag any submissions attached to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete() }} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!releaseTarget} onOpenChange={(open) => !open && setReleaseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release &quot;{releaseTarget?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Once released, this challenge is visible to participants and we&apos;ll send an email letting them know. You can&apos;t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {releaseError && <p className="text-destructive text-xs">{releaseError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releasingId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRelease() }} disabled={releasingId !== null}>
              {releasingId !== null ? <Loader2 className="animate-spin" /> : null}
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
