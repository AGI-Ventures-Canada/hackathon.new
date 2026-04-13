"use client"

import { useState, useImperativeHandle, forwardRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ScheduleItem } from "@/lib/services/schedule-items"

export type SubmissionDeadlineDialogHandle = {
  openDialog: () => void
}

type Props = {
  hackathonId: string
  scheduleItems: ScheduleItem[]
  endsAt: string | null
}

export const SubmissionDeadlineDialog = forwardRef<SubmissionDeadlineDialogHandle, Props>(
  function SubmissionDeadlineDialog({ hackathonId, scheduleItems, endsAt }, ref) {
    const router = useRouter()
    const deadlineItem = scheduleItems.find((s) => s.trigger_type === "submission_deadline")

    const [open, setOpen] = useState(false)
    const [deadlineAt, setDeadlineAt] = useState<Date | null>(null)
    const [linkedToEventEnd, setLinkedToEventEnd] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    function openDialog() {
      const item = scheduleItems.find((s) => s.trigger_type === "submission_deadline")
      setError(null)
      setSaved(false)
      setDeadlineAt(item?.starts_at ? new Date(item.starts_at) : null)
      setLinkedToEventEnd(item?.linked_to === "event_end")
      setOpen(true)
    }

    async function handleSave() {
      if (!deadlineItem) return
      const time = linkedToEventEnd && endsAt ? endsAt : deadlineAt?.toISOString()
      if (!time) return
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/schedule/${deadlineItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startsAt: time,
            linkedTo: linkedToEventEnd ? "event_end" : null,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Failed to save")
        }
        setSaved(true)
        setTimeout(() => {
          setOpen(false)
          setSaved(false)
        }, 1500)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save")
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

    useImperativeHandle(ref, () => ({ openDialog }))

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Submissions Close & Judging Starts</DialogTitle>
          </DialogHeader>
          {saved ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <CheckCircle2 className="size-8 text-primary" />
              <p className="text-sm font-medium">Deadline updated</p>
              <p className="text-xs text-muted-foreground">
                {linkedToEventEnd
                  ? "Submissions close when the event ends"
                  : deadlineAt
                    ? `Submissions close ${deadlineAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : null}
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); handleSave() }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                When this time arrives, submissions are locked and the judging phase begins. Participants can no longer submit or edit projects after this point.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Deadline</Label>
                  {endsAt && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setLinkedToEventEnd(!linkedToEventEnd)}
                    >
                      {linkedToEventEnd ? "Use custom time" : "Use event end"}
                    </Button>
                  )}
                </div>
                {linkedToEventEnd && endsAt ? (
                  <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Closes when the event ends ({new Date(endsAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})
                  </p>
                ) : (
                  <DateTimePicker
                    value={deadlineAt}
                    onChange={setDeadlineAt}
                    placeholder="When should submissions close?"
                  />
                )}
              </div>
              {error && <p className="text-destructive text-xs">{error}</p>}
              <Button
                type="submit"
                disabled={saving || (!linkedToEventEnd && !deadlineAt)}
                className="w-full"
              >
                {saving && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    )
  },
)
