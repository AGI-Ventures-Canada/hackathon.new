"use client"

import { useEffect, useState } from "react"
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
    label: "Sort into groups",
    description: "Judges put each project into a group like great, okay, or not ready.",
    detail: "Good for: grand prize or overall winner",
    icon: ArrowUpDown,
  },
  {
    value: "gate_check",
    label: "Pass or fail",
    description: "Each project gets a yes or no on a list of rules.",
    detail: "Good for: “Best Use of [Product]” or rule-based prizes",
    icon: ListChecks,
  },
  {
    value: "crowd_vote",
    label: "Everyone votes",
    description: "Anyone at the event can vote.",
    detail: "Good for: People's Choice or Audience Award",
    icon: Vote,
  },
  {
    value: "judges_pick",
    label: "Judge's picks",
    description: "Each judge picks their top few favorites.",
    detail: "Good for: expert panels or sponsor prizes",
    icon: Award,
  },
]

type CreateStep = "style" | "details"

export type CreatedPrize = {
  id: string
  name: string
  description: string | null
  value: string | null
  judgingStyle: PrizeJudgingStyle
  roundId: string | null
}

interface AddPrizeDialogProps {
  hackathonId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (created?: CreatedPrize) => void
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

  useEffect(() => {
    if (!open) return
    setForm((prev) => {
      const stillValid =
        prev.roundId !== null && visibleRounds.some((r) => r.id === prev.roundId)
      if (stillValid) return prev
      return { ...prev, roundId: defaultRoundId }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rounds])

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
            ...(form.roundId ? { roundId: form.roundId } : {}),
          }),
        }
      )

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to create prize")
      }

      const created: CreatedPrize = {
        id: data.id ?? data.prize?.id ?? "",
        name,
        description: form.description.trim() || null,
        value: form.value.trim() || null,
        judgingStyle: form.judgingStyle,
        roundId: form.roundId ?? null,
      }

      onSuccess?.(created)
      router.refresh()
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
            {step === "style" ? "How should judges pick the winner?" : "Prize details"}
          </DialogTitle>
        </DialogHeader>
        {step === "style" ? (
          <div className="space-y-3">
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
                  Judges only score this prize with the projects that made it into this round.
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
