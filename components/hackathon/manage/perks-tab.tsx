"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Gift, Key, Pencil, Plus, Send, Ticket, Trash2, X } from "lucide-react"
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
import { PerkEditorDialog, type SponsorOption } from "./perk-editor-dialog"
import type { Perk, PerkType } from "@/lib/services/perks"
import { isPerkReleased } from "@/lib/services/perks"
import { useIsClient } from "@/hooks/use-is-client"

type Props = {
  hackathonId: string
  initialPerks: Perk[]
  sponsors: SponsorOption[]
  startsAt: string | null
  perksNone: boolean
}

const TYPE_ICON: Record<PerkType, typeof Gift> = {
  api_key: Key,
  credit: Gift,
  coupon: Ticket,
  other: Gift,
}

const TYPE_LABEL: Record<PerkType, string> = {
  api_key: "API key",
  credit: "Credits",
  coupon: "Coupon",
  other: "Perk",
}

function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  const locale = timeZone ? "en-US" : undefined
  const dateLabel = date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone,
  })
  const timeLabel = date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })
  return `${dateLabel} at ${timeLabel}`
}

function releaseStatusText(
  perk: Perk,
  startsAt: string | null,
  released: boolean,
  timeZone?: string,
): string {
  if (released) {
    if (perk.releasedAt) return `Released ${formatDateTime(perk.releasedAt, timeZone)}`
    return "Released"
  }
  if (perk.scheduledReleaseAt) return `Releases ${formatDateTime(perk.scheduledReleaseAt, timeZone)}`
  if (startsAt) return `Releases when event starts (${formatDateTime(startsAt, timeZone)})`
  return "Releases when event starts"
}

export function PerksTab({ hackathonId, initialPerks, sponsors, startsAt, perksNone: initialPerksNone }: Props) {
  const router = useRouter()
  const isClient = useIsClient()
  const displayTimeZone = isClient ? undefined : "UTC"
  const [perks, setPerks] = useState<Perk[]>(initialPerks)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [perksNone, setPerksNone] = useState(initialPerksNone)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Perk | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Perk | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<Perk | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPerks(initialPerks)
    setHiddenIds(new Set())
  }, [initialPerks])

  useEffect(() => {
    setPerksNone(initialPerksNone)
  }, [initialPerksNone])

  const visiblePerks = useMemo(
    () => perks.filter((p) => !hiddenIds.has(p.id)),
    [perks, hiddenIds],
  )

  const grouped = useMemo(() => {
    const bySponsor = new Map<string | null, Perk[]>()
    for (const perk of visiblePerks) {
      const key = perk.sponsorId
      const list = bySponsor.get(key) ?? []
      list.push(perk)
      bySponsor.set(key, list)
    }
    const sponsorOrder = sponsors.map((s) => s.id)
    const groups: { key: string | null; label: string; perks: Perk[] }[] = []
    for (const sid of sponsorOrder) {
      const list = bySponsor.get(sid)
      if (list && list.length > 0) {
        const sponsor = sponsors.find((s) => s.id === sid)
        groups.push({ key: sid, label: sponsor?.name ?? "Sponsor", perks: list })
      }
    }
    const unassigned = bySponsor.get(null)
    if (unassigned && unassigned.length > 0) {
      groups.push({ key: null, label: "Other perks", perks: unassigned })
    }
    return groups
  }, [visiblePerks, sponsors])

  function openCreate() {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(p: Perk) {
    setEditing(p)
    setEditorOpen(true)
  }

  function handleSaved(saved: Perk) {
    setPerks((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
    router.refresh()
  }

  async function handleDelete() {
    const target = deleteTarget
    if (!target) return
    setHiddenIds((prev) => new Set(prev).add(target.id))
    setDeleteTarget(null)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/perks/${target.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete perk")
      router.refresh()
    } catch (err) {
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(target.id)
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to delete perk")
    }
  }

  async function handleRelease() {
    const target = releaseTarget
    if (!target) return
    const now = new Date().toISOString()
    const optimistic = { ...target, releasedAt: now }
    setPerks((prev) => prev.map((p) => (p.id === target.id ? optimistic : p)))
    setReleaseTarget(null)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/perks/${target.id}/release`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to release perk")
      const data = (await res.json()) as { perk: Perk }
      setPerks((prev) => prev.map((p) => (p.id === target.id ? data.perk : p)))
      router.refresh()
    } catch (err) {
      setPerks((prev) => prev.map((p) => (p.id === target.id ? target : p)))
      setError(err instanceof Error ? err.message : "Failed to release perk")
    }
  }

  async function togglePerksNone(next: boolean) {
    const previous = perksNone
    setPerksNone(next)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/perks-none`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perksNone: next }),
      })
      if (!res.ok) throw new Error("Failed to update")
      router.refresh()
    } catch (err) {
      setPerksNone(previous)
      setError(err instanceof Error ? err.message : "Failed to update")
    }
  }

  if (perksNone && visiblePerks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No perks for this event</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You marked this event as having no perks. Change your mind?
        </p>
        {error && <p className="mt-3 text-destructive text-xs">{error}</p>}
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => togglePerksNone(false)}>
            Add perks after all
          </Button>
        </div>
      </div>
    )
  }

  if (visiblePerks.length === 0) {
    return (
      <>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No perks yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sponsor API keys, credits, or coupons that teams can use during the event.
          </p>
          {error && <p className="mt-3 text-destructive text-xs">{error}</p>}
          <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Add perk
            </Button>
            <Button size="sm" variant="outline" onClick={() => togglePerksNone(true)}>
              No perks this event
            </Button>
          </div>
        </div>
        <PerkEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          hackathonId={hackathonId}
          perk={editing}
          sponsors={sponsors}
          onSaved={handleSaved}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {visiblePerks.length} perk{visiblePerks.length === 1 ? "" : "s"} · registered teams see these on the event page once released
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}

      <div className="space-y-6">
        {grouped.map((group) => (
          <div key={group.key ?? "__none"} className="space-y-2">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <div className="space-y-3">
              {group.perks.map((perk) => {
                const released = Boolean(perk.releasedAt) || (isClient && isPerkReleased(perk, startsAt))
                const Icon = TYPE_ICON[perk.type]
                return (
                  <div key={perk.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" />
                          <h4 className="truncate text-base font-semibold">{perk.name}</h4>
                          <Badge variant="outline" className="text-xs">{TYPE_LABEL[perk.type]}</Badge>
                          {released ? (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Check className="size-3" /> Live
                            </Badge>
                          ) : null}
                        </div>
                        {perk.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{perk.description}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {releaseStatusText(perk, startsAt, released, displayTimeZone)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!released && (
                          <Button variant="ghost" size="sm" onClick={() => setReleaseTarget(perk)}>
                            <Send className="size-4" />
                            <span className="hidden sm:inline">Release now</span>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(perk)} aria-label="Edit">
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(perk)} aria-label="Delete">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={() => togglePerksNone(true)} className="text-muted-foreground">
          <X className="size-3.5" /> Mark as no perks
        </Button>
      </div>

      <PerkEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        hackathonId={hackathonId}
        perk={editing}
        sponsors={sponsors}
        onSaved={handleSaved}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete perk?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &quot;{deleteTarget?.name}&quot;. If teams have already redeemed the code, they keep what they used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete() }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!releaseTarget} onOpenChange={(open) => !open && setReleaseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release this perk now?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{releaseTarget?.name}&quot; will be visible to every registered team on the event page right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRelease() }}>
              Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
