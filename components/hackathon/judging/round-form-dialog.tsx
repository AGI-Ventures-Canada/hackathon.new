"use client"

import { useEffect, useState } from "react"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2 } from "lucide-react"
import type { AdvancementRule, RoundData } from "./rounds-types"

export type CreatedRound = RoundData

interface RoundFormValues {
  name: string
  advancement: AdvancementRule
  topN: number
  threshold: number
}

interface RoundFormDialogProps {
  hackathonId: string
  mode: "create" | "edit"
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: {
    id: string
    name: string
    advancement: AdvancementRule
    topN?: number
    threshold?: number
  }
  onSuccess?: (created?: CreatedRound) => void
}

export function RoundFormDialog({
  hackathonId,
  mode,
  open,
  onOpenChange,
  initial,
  onSuccess,
}: RoundFormDialogProps) {
  const router = useRouter()
  const [form, setForm] = useState<RoundFormValues>({
    name: "",
    advancement: "manual",
    topN: 10,
    threshold: 3,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && initial) {
      setForm({
        name: initial.name,
        advancement: initial.advancement,
        topN: initial.topN ?? 10,
        threshold: initial.threshold ?? 3,
      })
    } else {
      setForm({ name: "", advancement: "manual", topN: 10, threshold: 3 })
    }
    setError(null)
  }, [open, mode, initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError("Name is required")
      return
    }

    setSaving(true)
    setError(null)

    const advancementConfig =
      form.advancement === "top_n"
        ? { topN: Math.max(1, form.topN) }
        : form.advancement === "threshold"
          ? { threshold: form.threshold }
          : {}

    const body = {
      name,
      advancement: form.advancement,
      advancementConfig,
    }

    try {
      const url =
        mode === "edit" && initial
          ? `/api/dashboard/hackathons/${hackathonId}/rounds/${initial.id}`
          : `/api/dashboard/hackathons/${hackathonId}/rounds`
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Failed to save round")
      }
      if (mode === "create" && data.round) {
        const r = data.round
        const created: CreatedRound = {
          id: r.id,
          name: r.name,
          status: r.status ?? "planned",
          isActive: r.status === "active",
          displayOrder: r.display_order ?? r.displayOrder ?? 0,
          advancement: (r.advancement ?? form.advancement) as AdvancementRule,
          advancementConfig:
            r.advancement_config ?? r.advancementConfig ?? advancementConfig,
          prizeCount: 0,
          screeningPrizeId: null,
        }
        onSuccess?.(created)
      } else {
        onSuccess?.()
      }
      router.refresh()
      onOpenChange(false)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit round" : "Add a round"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Change the name or how projects move on."
              : "A round is one step of judging. Use rounds if you want to pick a shortlist first, then pick winners from it."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} autoComplete="off" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="round-name">Round name</Label>
            <Input
              id="round-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Semifinals"
              autoFocus
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>

          <div className="space-y-2">
            <Label>Who moves to the next round?</Label>
            <RadioGroup
              value={form.advancement}
              onValueChange={(v) =>
                setForm({ ...form, advancement: v as AdvancementRule })
              }
              className="gap-2"
            >
              <Label
                htmlFor="adv-manual"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal"
              >
                <RadioGroupItem id="adv-manual" value="manual" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">I&apos;ll pick</div>
                  <div className="text-xs text-muted-foreground">
                    Choose who moves on after judges finish scoring.
                  </div>
                </div>
              </Label>

              <Label
                htmlFor="adv-topn"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal"
              >
                <RadioGroupItem id="adv-topn" value="top_n" className="mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="text-sm font-medium">The top few scorers</div>
                    <div className="text-xs text-muted-foreground">
                      The submissions with the highest scores move on.
                    </div>
                  </div>
                  {form.advancement === "top_n" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">How many?</span>
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={form.topN}
                        onChange={(e) =>
                          setForm({ ...form, topN: Math.max(1, Number(e.target.value) || 1) })
                        }
                        className="h-8 w-20"
                      />
                    </div>
                  )}
                </div>
              </Label>

              <Label
                htmlFor="adv-threshold"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal"
              >
                <RadioGroupItem id="adv-threshold" value="threshold" className="mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="text-sm font-medium">Anyone who scores high enough</div>
                    <div className="text-xs text-muted-foreground">
                      Set a score. Everyone who hits it or higher moves on.
                    </div>
                  </div>
                  {form.advancement === "threshold" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Score to beat</span>
                      <Input
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        value={form.threshold}
                        onChange={(e) =>
                          setForm({ ...form, threshold: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-24"
                      />
                    </div>
                  )}
                </div>
              </Label>
            </RadioGroup>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {mode === "edit" ? "Save" : "Create round"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
