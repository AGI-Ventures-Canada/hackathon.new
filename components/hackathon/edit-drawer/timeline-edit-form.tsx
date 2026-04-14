"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DateTimeRangePicker,
  type DateTimeRange,
} from "@/components/ui/date-time-range-picker"
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { startOfDay } from "date-fns"
import { Undo2 } from "lucide-react"
import { useEditOptional } from "@/components/hackathon/preview/edit-context"
import { validateTimelineDates } from "@/lib/utils/timeline"

interface TimelineEditFormProps {
  hackathonId?: string
  initialData: {
    startsAt: string | null
    endsAt: string | null
  }
  onSaveAndNext?: () => void
  onSave?: (data: {
    startsAt: Date | null
    endsAt: Date | null
  }) => Promise<boolean>
  onCancel?: () => void
}

function parseDate(dateString: string | null): Date | null {
  if (!dateString) return null
  return new Date(dateString)
}

export function TimelineEditForm({ hackathonId, initialData, onSaveAndNext, onSave, onCancel }: TimelineEditFormProps) {
  const router = useRouter()
  const today = useMemo(() => startOfDay(new Date()), [])
  const editContext = useEditOptional()
  const closeDrawer = onCancel ?? editContext?.closeDrawer ?? (() => {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [hackathonRange, setHackathonRange] = useState<DateTimeRange>({
    from: parseDate(initialData.startsAt),
    to: parseDate(initialData.endsAt),
  })

  function rangeChanged(range: DateTimeRange, fromInitial: string | null, toInitial: string | null): boolean {
    const fromEqual = !range.from && !fromInitial ? true : range.from && fromInitial ? range.from.getTime() === new Date(fromInitial).getTime() : false
    const toEqual = !range.to && !toInitial ? true : range.to && toInitial ? range.to.getTime() === new Date(toInitial).getTime() : false
    return !fromEqual || !toEqual
  }

  const isDirty = rangeChanged(hackathonRange, initialData.startsAt, initialData.endsAt)

  function handleReset() {
    setHackathonRange({
      from: parseDate(initialData.startsAt),
      to: parseDate(initialData.endsAt),
    })
    setError(null)
  }

  async function save() {
    setSaving(true)
    setError(null)

    const dateError = validateTimelineDates({
      startsAt: hackathonRange.from,
      endsAt: hackathonRange.to,
    })
    if (dateError) {
      setError(dateError)
      setSaving(false)
      return false
    }

    try {
      if (onSave) {
        return await onSave({
          startsAt: hackathonRange.from || null,
          endsAt: hackathonRange.to || null,
        })
      }

      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: hackathonRange.from || null,
          endsAt: hackathonRange.to || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
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
        if (onSaveAndNext) { onSaveAndNext() } else { closeDrawer() }
        return
      }
      save().then(ok => {
        if (ok) { if (onSaveAndNext) { onSaveAndNext() } else { closeDrawer() } }
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
          <FieldLabel htmlFor="timeline-hackathon">Event Dates</FieldLabel>
          <DateTimeRangePicker
            id="timeline-hackathon"
            value={hackathonRange}
            onChange={setHackathonRange}
            placeholder="Select event dates"
            fromLabel="Start"
            toLabel="End"
            minDate={today}
          />
        </Field>

        <FieldDescription>
          Set when the event starts and ends
        </FieldDescription>

        {error && (
          <p className="text-destructive text-sm">{error}</p>
        )}
      </FieldGroup>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !isDirty}>
            {saving ? "Saving..." : "Save"}
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
            <Kbd>↵</Kbd> save
          </span>
          <span className="inline-flex items-center gap-1">
            <KbdGroup><Kbd>⌘</Kbd><Kbd>↵</Kbd></KbdGroup> save & next
          </span>
          {isDirty && (
            <span className="inline-flex items-center gap-1">
              <Kbd>Esc</Kbd> reset
            </span>
          )}
        </div>
      </div>
    </form>
  )
}
