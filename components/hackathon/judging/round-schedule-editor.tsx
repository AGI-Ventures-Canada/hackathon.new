"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useJudgingFormDraft } from "@/hooks/use-judging-form-draft"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { assertOkJson } from "@/lib/utils/fetch"
import { judgingInstant, judgingLocalTime } from "@/lib/utils/judging-datetime"
import type { JudgingSetup } from "@/lib/judging/setup"
import { suggestedJudgingWindow } from "@/lib/judging/setup"

export function RoundScheduleEditor({
  setup,
  round,
  onSaved,
}: {
  setup: JudgingSetup
  round: JudgingSetup["rounds"][number]
  onSaved: () => void
}) {
  const router = useRouter()
  const [draft, setDraft, clearDraft] = useJudgingFormDraft(setup.id, `round-dates:${round.id}`, {
    inherit: !round.opensAt && !round.closesAt,
    opens: judgingLocalTime(round.opensAt ?? setup.settings.opensAt, setup.settings.timezone),
    closes: judgingLocalTime(round.closesAt ?? setup.settings.closesAt, setup.settings.timezone),
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function save() {
    if (saving) return
    setError(null)
    try {
      const opensAt = draft.inherit ? null : judgingInstant(draft.opens, setup.settings.timezone)
      const closesAt = draft.inherit ? null : judgingInstant(draft.closes, setup.settings.timezone)
      if (!draft.inherit && (!opensAt || !closesAt || closesAt <= opensAt))
        throw new Error("Choose an opening time and a later deadline.")
      setSaving(true)
      await fetch(`/api/dashboard/hackathons/${setup.id}/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opensAt, closesAt }),
      }).then(assertOkJson)
      clearDraft()
      router.refresh()
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save round dates.")
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      autoComplete="off"
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault()
          void save()
        }
      }}
    >
      <h3 className="font-medium">{round.name}: judging dates</h3>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={draft.inherit}
          onCheckedChange={(checked) => {
            const suggested = suggestedJudgingWindow(setup.submissionDeadline, new Date())
            setDraft((current) => ({
              ...current,
              inherit: checked === true,
              opens: current.opens || judgingLocalTime(suggested.opensAt, setup.settings.timezone),
              closes:
                current.closes || judgingLocalTime(suggested.closesAt, setup.settings.timezone),
            }))
          }}
        />
        Use the event&apos;s judging dates
      </label>
      {!draft.inherit && (
        <>
          <p className="text-sm text-muted-foreground">Times use {setup.settings.timezone}.</p>
          <Label htmlFor={`round-open-${round.id}`}>Judging opens</Label>
          <Input
            id={`round-open-${round.id}`}
            type="datetime-local"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            value={draft.opens}
            onChange={(event) => setDraft((current) => ({ ...current, opens: event.target.value }))}
          />
          <Label htmlFor={`round-close-${round.id}`}>Judging deadline</Label>
          <Input
            id={`round-close-${round.id}`}
            type="datetime-local"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            min={draft.opens}
            value={draft.closes}
            onChange={(event) =>
              setDraft((current) => ({ ...current, closes: event.target.value }))
            }
          />
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={saving}>{saving ? "Saving dates…" : "Save round dates"}</Button>
    </form>
  )
}
