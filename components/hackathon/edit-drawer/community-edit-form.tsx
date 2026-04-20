"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldGroup, FieldDescription } from "@/components/ui/field"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Undo2 } from "lucide-react"
import { useEditOptional } from "@/components/hackathon/preview/edit-context"
import { normalizeUrl } from "@/lib/utils/url"

interface CommunityEditFormProps {
  hackathonId?: string
  initialUrl: string | null
  initialLabel: string | null
  onSaveAndNext?: () => void
  onSave?: (data: { communityUrl: string | null; communityLabel: string | null }) => Promise<boolean>
  onCancel?: () => void
}

export function CommunityEditForm({
  hackathonId,
  initialUrl,
  initialLabel,
  onSaveAndNext,
  onSave,
  onCancel,
}: CommunityEditFormProps) {
  const router = useRouter()
  const editContext = useEditOptional()
  const closeDrawer = onCancel ?? editContext?.closeDrawer ?? (() => {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [url, setUrl] = useState(initialUrl ?? "")
  const [label, setLabel] = useState(initialLabel ?? "")

  const isDirty = url !== (initialUrl ?? "") || label !== (initialLabel ?? "")

  function handleReset() {
    setUrl(initialUrl ?? "")
    setLabel(initialLabel ?? "")
    setError(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const trimmedUrl = url.trim()
      const normalizedUrl = trimmedUrl ? normalizeUrl(trimmedUrl) : null
      const trimmedLabel = label.trim() || null
      const payload = {
        communityUrl: normalizedUrl,
        communityLabel: trimmedLabel,
      }

      if (onSave) {
        return await onSave(payload)
      }

      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save")
      }
      router.refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isDirty) return
    const ok = await save()
    if (ok) closeDrawer()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      if (!isDirty) {
        if (onSaveAndNext) onSaveAndNext()
        else closeDrawer()
        return
      }
      save().then((ok) => {
        if (ok) {
          if (onSaveAndNext) onSaveAndNext()
          else closeDrawer()
        }
      })
    }
    if (e.key === "Escape" && isDirty) {
      e.preventDefault()
      handleReset()
    }
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-6" autoComplete="off">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="community-url">Community link</FieldLabel>
          <Input
            id="community-url"
            name="community-url"
            type="text"
            inputMode="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="discord.gg/your-server"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
          <FieldDescription>
            Drops into the event page once someone registers. Works great for Discord, Slack, Telegram, or a help doc.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="community-label">Button label (optional)</FieldLabel>
          <Input
            id="community-label"
            name="community-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Join the Discord"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
          <FieldDescription>Defaults to &ldquo;Join community&rdquo;.</FieldDescription>
        </Field>

        {error && <p className="text-destructive text-sm">{error}</p>}
      </FieldGroup>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !isDirty}>
            {saving ? "Saving..." : "Save & exit"}
          </Button>
          <Button type="button" variant="outline" onClick={closeDrawer} disabled={saving}>
            Cancel
          </Button>
          {isDirty && (
            <Button type="button" variant="ghost" onClick={handleReset} disabled={saving}>
              <Undo2 className="size-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> save & exit
          </span>
          <span className="inline-flex items-center gap-1">
            <KbdGroup><Kbd>⌘</Kbd><Kbd>↵</Kbd></KbdGroup> save & next
          </span>
          {isDirty && (
            <span className="inline-flex items-center gap-1"><Kbd>Esc</Kbd> reset</span>
          )}
        </div>
      </div>
    </form>
  )
}
