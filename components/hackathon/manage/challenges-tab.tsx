"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, Link as LinkIcon } from "lucide-react"
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

type Props = {
  hackathonId: string
  initialChallenges: Challenge[]
  releasedAt: string | null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ChallengesTab({ hackathonId, initialChallenges, releasedAt: initialReleasedAt }: Props) {
  const router = useRouter()
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges)
  const [releasedAt, setReleasedAt] = useState<string | null>(initialReleasedAt)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Challenge | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Challenge | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)

  useEffect(() => {
    setChallenges(initialChallenges)
  }, [initialChallenges])

  useEffect(() => {
    setReleasedAt(initialReleasedAt)
  }, [initialReleasedAt])

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
    setReleasing(true)
    setReleaseError(null)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/challenge/release`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to release challenges")
      }
      setReleasedAt(new Date().toISOString())
      setReleaseDialogOpen(false)
      router.refresh()
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Failed to release challenges")
    } finally {
      setReleasing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Challenges</h2>
          <p className="text-sm text-muted-foreground">
            Problem statements or themes for participants. Released together at one time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {releasedAt ? (
            <Badge variant="secondary">Released {formatDate(releasedAt)}</Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={challenges.length === 0}
              onClick={() => setReleaseDialogOpen(true)}
            >
              <Eye className="size-4" />
              <span className="hidden sm:inline">Release to participants</span>
              <span className="sm:hidden">Release</span>
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add challenge</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No challenges yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add one or more challenges, then release them to participants when you&apos;re ready.
          </p>
          <Button className="mt-4" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Add your first challenge
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {challenges.map((c, idx) => (
            <div key={c.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold">{c.title}</h3>
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
          ))}
        </div>
      )}

      <ChallengeEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        hackathonId={hackathonId}
        challenge={editing}
        onSaved={handleSaved}
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

      <AlertDialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release challenges to participants?</AlertDialogTitle>
            <AlertDialogDescription>
              Once released, all {challenges.length} challenge{challenges.length === 1 ? "" : "s"} will be visible on the event page. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {releaseError && <p className="text-destructive text-xs">{releaseError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releasing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRelease() }} disabled={releasing}>
              {releasing ? <Loader2 className="animate-spin" /> : null}
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
