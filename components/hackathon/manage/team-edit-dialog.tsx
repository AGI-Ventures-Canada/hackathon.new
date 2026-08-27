"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { assertOk } from "@/lib/utils/fetch"

type TeamMember = {
  clerkUserId: string
  displayName: string | null
  email: string | null
}

export type TeamEditValues = {
  name: string
  mode: "in_person" | "virtual" | null
  captainClerkUserId: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hackathonId: string
  teamId: string
  initial: TeamEditValues
  members: TeamMember[]
  onSaved: (next: TeamEditValues) => void
}

const MODE_UNSPECIFIED = "__unspecified__"

export function TeamEditDialog({
  open,
  onOpenChange,
  hackathonId,
  teamId,
  initial,
  members,
  onSaved,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [mode, setMode] = useState<TeamEditValues["mode"]>(initial.mode)
  const [captainId, setCaptainId] = useState<string | null>(initial.captainClerkUserId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(initial.name)
      setMode(initial.mode)
      setCaptainId(initial.captainClerkUserId)
      setError(null)
    }
  }, [open, initial.name, initial.mode, initial.captainClerkUserId])

  const payload = useMemo(() => {
    const p: Record<string, unknown> = {}
    if (name.trim() && name.trim() !== initial.name) p.name = name.trim()
    if (mode !== initial.mode) p.mode = mode
    if (captainId && captainId !== initial.captainClerkUserId) p.captainClerkUserId = captainId
    return p
  }, [name, mode, captainId, initial.name, initial.mode, initial.captainClerkUserId])

  const hasChanges = Object.keys(payload).length > 0

  const currentCaptainMissing = Boolean(
    initial.captainClerkUserId
      && !members.some((m) => m.clerkUserId === initial.captainClerkUserId)
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Team name is required")
      return
    }
    if (!hasChanges) return

    setSaving(true)
    setError(null)
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(assertOk)
      onSaved({ name: name.trim(), mode, captainClerkUserId: captainId })
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void handleSave(e as unknown as React.FormEvent)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit team</DialogTitle>
          <DialogDescription>Change this team&apos;s name and status.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} onKeyDown={handleKeyDown} className="space-y-4" autoComplete="off">
          <div className="space-y-2">
            <label htmlFor="team-edit-name" className="text-xs font-medium">
              Team name
            </label>
            <Input
              id="team-edit-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              autoFocus
              maxLength={100}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="team-edit-mode" className="text-xs font-medium">
              Mode
            </label>
            <Select
              value={mode ?? MODE_UNSPECIFIED}
              onValueChange={(v) => setMode(v === MODE_UNSPECIFIED ? null : (v as "in_person" | "virtual"))}
            >
              <SelectTrigger id="team-edit-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MODE_UNSPECIFIED}>Not set</SelectItem>
                <SelectItem value="in_person">In person</SelectItem>
                <SelectItem value="virtual">Virtual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="team-edit-captain" className="text-xs font-medium">
              Captain
            </label>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a member before you can pick a captain.
              </p>
            ) : (
              <Select
                value={captainId ?? ""}
                onValueChange={(v) => setCaptainId(v)}
              >
                <SelectTrigger id="team-edit-captain">
                  <SelectValue placeholder="Pick a captain" />
                </SelectTrigger>
                <SelectContent>
                  {currentCaptainMissing && initial.captainClerkUserId && (
                    <SelectItem value={initial.captainClerkUserId} disabled>
                      Current captain (no longer on team)
                    </SelectItem>
                  )}
                  {members.map((m) => (
                    <SelectItem key={m.clerkUserId} value={m.clerkUserId}>
                      {m.displayName ?? m.email ?? m.clerkUserId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !hasChanges}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
