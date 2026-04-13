"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Loader2,
  CheckCircle2,
  ArrowUpDown,
  ListChecks,
  Vote,
  Award,
  ChevronRight,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PrizeJudgingStyle } from "@/lib/db/hackathon-types"
import type { RoundData } from "./rounds-types"

const STYLE_OPTIONS: {
  value: PrizeJudgingStyle
  label: string
  description: string
  detail: string
  icon: typeof ArrowUpDown
}[] = [
  {
    value: "bucket_sort",
    label: "Bucket Sort",
    description: "Judges sort submissions into tiers",
    detail: "Best for: Grand Prize, Overall Winner",
    icon: ArrowUpDown,
  },
  {
    value: "gate_check",
    label: "Gate Check",
    description: "Pass/fail checklist for each submission",
    detail: 'Best for: "Best Use of [Product]", compliance prizes',
    icon: ListChecks,
  },
  {
    value: "crowd_vote",
    label: "Crowd Vote",
    description: "Open voting for all attendees",
    detail: "Best for: People's Choice, Audience Award",
    icon: Vote,
  },
  {
    value: "judges_pick",
    label: "Judge's Pick",
    description: "Each judge picks their top N favorites",
    detail: "Best for: Expert panels, sponsor prizes",
    icon: Award,
  },
]

type CreateStep = "style" | "details"

interface AddPrizeDialogProps {
  hackathonId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  rounds?: RoundData[]
}

export function AddPrizeDialog({
  hackathonId,
  open,
  onOpenChange,
  onSuccess,
  rounds = [],
}: AddPrizeDialogProps) {
  const router = useRouter()
  const visibleRounds = [...rounds].sort((a, b) => a.displayOrder - b.displayOrder)
  const defaultRoundId = visibleRounds.length > 0
    ? visibleRounds[visibleRounds.length - 1].id
    : null
  const [step, setStep] = useState<CreateStep>("style")
  const [form, setForm] = useState({
    name: "",
    description: "",
    value: "",
    judgingStyle: "bucket_sort" as PrizeJudgingStyle,
    roundId: defaultRoundId,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("style")
      setForm({
        name: "",
        description: "",
        value: "",
        judgingStyle: "bucket_sort",
        roundId: defaultRoundId,
      })
      setError(null)
      setSuccess(false)
    }
    onOpenChange(nextOpen)
  }

  function selectStyle(style: PrizeJudgingStyle) {
    setForm({ ...form, name: "", judgingStyle: style })
    setStep("details")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError("Name is required")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: form.description.trim() || null,
            value: form.value.trim() || null,
            judgingStyle: form.judgingStyle,
            roundId: form.roundId,
          }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create prize")
      }

      setSuccess(true)
      router.refresh()
      onSuccess?.()
      setTimeout(() => handleOpenChange(false), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleCreate(e as unknown as React.FormEvent)
    }
  }

  const selectedOption = STYLE_OPTIONS.find((o) => o.value === form.judgingStyle)
  const SelectedIcon = selectedOption?.icon ?? ArrowUpDown

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={step === "style" ? "sm:max-w-lg" : undefined}>
        <DialogHeader>
          <DialogTitle>
            {step === "style" ? "How should this prize be judged?" : "Prize details"}
          </DialogTitle>
        </DialogHeader>
        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="size-10 text-primary" />
            <p className="text-sm font-medium">Prize created</p>
          </div>
        ) : step === "style" ? (
          <div className="space-y-2">
            {STYLE_OPTIONS.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectStyle(option.value)}
                  className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="size-5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{option.label}</span>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {option.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {option.detail}
                      </p>
                    </div>
                    <ChevronRight className="size-4 mt-1 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <form onSubmit={handleCreate} onKeyDown={handleKeyDown} autoComplete="off" className="space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <SelectedIcon className="size-4 shrink-0" />
                <span className="font-medium truncate">{selectedOption?.label}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto shrink-0 px-2 py-1 text-xs"
                onClick={() => setStep("style")}
              >
                Change
              </Button>
            </div>
            {visibleRounds.length >= 1 && (
              <div className="space-y-2">
                <Label htmlFor="add-prize-round">Round</Label>
                <Select
                  value={form.roundId ?? "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, roundId: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger id="add-prize-round">
                    <SelectValue placeholder="Select a round" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleRounds.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="none">No round</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Prizes in a round only see submissions that advance into it.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="add-prize-name">Name</Label>
              <Input
                id="add-prize-name"
                name="add-prize-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Grand Prize"
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-prize-value">Reward</Label>
              <Input
                id="add-prize-value"
                name="add-prize-value"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="e.g. $5,000, MacBook Pro"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-prize-description">Description</Label>
              <Textarea
                id="add-prize-description"
                name="add-prize-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What does the winner receive?"
                rows={2}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("style")}>
                Back
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create Prize
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
