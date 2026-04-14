"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowDown } from "lucide-react"

interface FinalistsPresetDialogProps {
  hackathonId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function FinalistsPresetDialog({
  hackathonId,
  open,
  onOpenChange,
  onSuccess,
}: FinalistsPresetDialogProps) {
  const router = useRouter()
  const [form, setForm] = useState({
    round1Name: "Semifinals",
    round2Name: "Finals",
    advanceTopN: 10,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm({ round1Name: "Semifinals", round2Name: "Finals", advanceTopN: 10 })
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.advanceTopN < 1) {
      setError("Advance at least 1 submission")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rounds/finalists-preset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            advanceTopN: form.advanceTopN,
            round1Name: form.round1Name.trim() || "Semifinals",
            round2Name: form.round2Name.trim() || "Finals",
            seedScreeningPrize: true,
          }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create rounds")
      }
      router.refresh()
      onSuccess?.()
      handleOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up finalists judging</DialogTitle>
          <DialogDescription>
            Round 1 narrows submissions to a shortlist. Round 2 picks the winners from that shortlist. You can add or rename rounds later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} autoComplete="off" className="space-y-5">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Round 1 — narrows to finalists</p>
              <span className="text-xs text-muted-foreground">Bucket Sort</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="finalists-r1-name">Name</Label>
              <Input
                id="finalists-r1-name"
                value={form.round1Name}
                onChange={(e) => setForm({ ...form, round1Name: e.target.value })}
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finalists-top-n">Advance the top N submissions</Label>
              <Input
                id="finalists-top-n"
                type="number"
                min={1}
                inputMode="numeric"
                value={form.advanceTopN}
                onChange={(e) =>
                  setForm({ ...form, advanceTopN: Math.max(1, Number(e.target.value) || 1) })
                }
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
              <p className="text-xs text-muted-foreground">
                Judges score every submission. The top {form.advanceTopN} by score advance to the next round.
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="size-4 text-muted-foreground" />
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Round 2 — picks winners</p>
              <span className="text-xs text-muted-foreground">Default for new prizes</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="finalists-r2-name">Name</Label>
              <Input
                id="finalists-r2-name"
                value={form.round2Name}
                onChange={(e) => setForm({ ...form, round2Name: e.target.value })}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            We&apos;ll add a hidden &ldquo;Screening Scores&rdquo; prize to Round 1 so judges have something to score. It won&apos;t show on the event page or results.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create rounds
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
