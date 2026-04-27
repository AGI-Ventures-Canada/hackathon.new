"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { normalizeUrl } from "@/lib/utils/url"
import { assertOk } from "@/lib/utils/fetch"
import type { Challenge, ChallengeResource } from "@/lib/services/challenges"
import type { ScheduleItem } from "@/lib/services/schedule-items"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hackathonId: string
  challenge: Challenge | null
  onSaved: (challenge: Challenge) => void
  releaseScheduleItem: ScheduleItem | null
  hackathonStartsAt: string | null
  hackathonEndsAt: string | null
  alreadyReleased: boolean
}

function formatBound(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ChallengeEditorDialog({
  open,
  onOpenChange,
  hackathonId,
  challenge,
  onSaved,
  releaseScheduleItem,
  hackathonStartsAt,
  hackathonEndsAt,
  alreadyReleased,
}: Props) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [resources, setResources] = useState<ChallengeResource[]>([])
  const [autoRelease, setAutoRelease] = useState(true)
  const [customReleaseAt, setCustomReleaseAt] = useState<Date | null>(null)
  const [initialAutoRelease, setInitialAutoRelease] = useState(true)
  const [initialCustomReleaseIso, setInitialCustomReleaseIso] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(challenge?.title ?? "")
    setDescription(challenge?.description ?? "")
    setResources(challenge?.resources ?? [])
    setError(null)

    const initialAuto = releaseScheduleItem?.linked_to === "event_start" || !releaseScheduleItem
    const initialIso = releaseScheduleItem?.starts_at ?? null
    setAutoRelease(initialAuto)
    setCustomReleaseAt(initialAuto ? null : initialIso ? new Date(initialIso) : null)
    setInitialAutoRelease(initialAuto)
    setInitialCustomReleaseIso(initialAuto ? null : initialIso)
  }, [open, challenge, releaseScheduleItem])

  const startsAtDate = hackathonStartsAt ? new Date(hackathonStartsAt) : null
  const endsAtDate = hackathonEndsAt ? new Date(hackathonEndsAt) : null

  const customReleaseError = (() => {
    if (autoRelease) return null
    if (!customReleaseAt) return null
    if (startsAtDate && customReleaseAt < startsAtDate) {
      return "Pick a time on or after the event starts."
    }
    if (endsAtDate && customReleaseAt > endsAtDate) {
      return "Pick a time on or before the event ends."
    }
    return null
  })()

  const releaseTimingValid = autoRelease || (customReleaseAt !== null && customReleaseError === null)

  function updateResource(index: number, patch: Partial<ChallengeResource>) {
    setResources((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addResource() {
    setResources((prev) => [...prev, { label: "", url: "" }])
  }

  function removeResource(index: number) {
    setResources((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!title.trim()) return
    if (!releaseTimingValid) return
    setSaving(true)
    setError(null)
    try {
      const cleanedResources = resources
        .map((r) => ({ label: r.label.trim(), url: normalizeUrl(r.url.trim()) }))
        .filter((r) => r.url.length > 0)

      const body = {
        title: title.trim(),
        description: description.trim() ? description : null,
        resources: cleanedResources,
      }

      const url = challenge
        ? `/api/dashboard/hackathons/${hackathonId}/challenges/${challenge.id}`
        : `/api/dashboard/hackathons/${hackathonId}/challenges`
      const method = challenge ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save challenge")
      }

      const data = (await res.json()) as { challenge: Challenge }

      if (!alreadyReleased && releaseScheduleItem) {
        const nextLinkedTo = autoRelease ? "event_start" : null
        const nextStartsAt = autoRelease ? hackathonStartsAt : customReleaseAt?.toISOString() ?? null
        const linkedChanged = autoRelease !== initialAutoRelease
        const startsChanged =
          !autoRelease && nextStartsAt !== initialCustomReleaseIso

        if (nextStartsAt && (linkedChanged || startsChanged)) {
          await fetch(
            `/api/dashboard/hackathons/${hackathonId}/schedule/${releaseScheduleItem.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ startsAt: nextStartsAt, linkedTo: nextLinkedTo }),
            },
          ).then(assertOk)
        }
      }

      onSaved(data.challenge)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save challenge")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{challenge ? "Edit challenge" : "Add challenge"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSave() }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="challenge-title">Title</Label>
            <Input
              id="challenge-title"
              name="challenge-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AI Agents for Customer Support"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="challenge-description">Description</Label>
            <Textarea
              id="challenge-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the challenge, problem statement, and any constraints..."
              className="min-h-[12rem]"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Markdown supported</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Resources</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addResource}>
                <Plus className="size-3.5" /> Add resource
              </Button>
            </div>
            {resources.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add links to datasets, APIs, docs, or anything else teams might need.</p>
            ) : (
              <div className="space-y-2">
                {resources.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={r.label}
                      onChange={(e) => updateResource(i, { label: e.target.value })}
                      placeholder="Label (e.g. Dataset)"
                      className="flex-1"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                    />
                    <Input
                      type="text"
                      inputMode="url"
                      value={r.url}
                      onChange={(e) => updateResource(i, { url: e.target.value })}
                      placeholder="https://…"
                      className="flex-[2]"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore
                      data-lpignore="true"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeResource(i)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!alreadyReleased && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="challenge-auto-release" className="text-sm font-medium">
                    Release when the event goes live
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {autoRelease
                      ? "Challenges unlock the moment your hackathon starts."
                      : "Pick the exact time during the event when challenges unlock."}
                  </p>
                </div>
                <Switch
                  id="challenge-auto-release"
                  checked={autoRelease}
                  onCheckedChange={setAutoRelease}
                />
              </div>
              {!autoRelease && (
                <div className="space-y-1">
                  <Label htmlFor="challenge-release-at" className="text-xs">
                    Release time
                  </Label>
                  <DateTimePicker
                    id="challenge-release-at"
                    value={customReleaseAt}
                    onChange={setCustomReleaseAt}
                    placeholder="Pick a release time"
                    minDate={startsAtDate ?? undefined}
                  />
                  {startsAtDate && endsAtDate && (
                    <p className="text-xs text-muted-foreground">
                      Pick any time between {formatBound(startsAtDate.toISOString())} and {formatBound(endsAtDate.toISOString())}.
                    </p>
                  )}
                  {customReleaseError && (
                    <p className="text-destructive text-xs">{customReleaseError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !title.trim() || !releaseTimingValid}
            >
              {saving && <Loader2 className="animate-spin" />}
              Save challenge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
