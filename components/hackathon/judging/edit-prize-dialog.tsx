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
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"
import type { PrizeJudgingStyle } from "@/lib/db/hackathon-types"
import { STYLE_OPTIONS, DEFAULT_BUCKETS } from "./judging-constants"

type CriterionDraft = { id: string; name: string; description: string }
type WeightedCriterionDraft = {
  id: string
  name: string
  description: string
  weight: string
  minScore: string
  maxScore: string
}
type BucketDraft = { id: string; level: number; label: string; description: string }

let draftIdCounter = 0
function nextDraftId(): string {
  draftIdCounter += 1
  return `edit-draft-${draftIdCounter}`
}

export type EditablePrize = {
  id: string
  name: string
  description: string | null
  value: string | null
  judgingStyle: PrizeJudgingStyle | null
  maxPicks: number | null
  criteria:
    | {
        id: string
        name: string
        description: string | null
        weight?: number
        minScore?: number
        maxScore?: number
      }[]
    | null
  buckets:
    | { id: string; level: number; label: string; description: string | null }[]
    | null
}

export type UpdatedPrize = {
  id: string
  name: string
  description: string | null
  value: string | null
  maxPicks: number | null
  criteria:
    | {
        id: string
        name: string
        description: string | null
        weight?: number
        minScore?: number
        maxScore?: number
      }[]
    | null
  buckets:
    | { id: string; level: number; label: string; description: string | null }[]
    | null
}

interface EditPrizeDialogProps {
  hackathonId: string
  prize: EditablePrize | null
  onClose: () => void
  onSuccess?: (updated: UpdatedPrize) => void
  coreWeightSum?: number
}

export function EditPrizeDialog({
  hackathonId,
  prize,
  onClose,
  onSuccess,
  coreWeightSum = 0,
}: EditPrizeDialogProps) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: "",
    description: "",
    value: "",
    maxPicks: "3",
    criteria: [] as CriterionDraft[],
    weightedCriteria: [] as WeightedCriterionDraft[],
    buckets: [] as BucketDraft[],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickedStyle, setPickedStyle] = useState<PrizeJudgingStyle | null>(null)
  const effectiveStyle: PrizeJudgingStyle | null = pickedStyle ?? prize?.judgingStyle ?? null

  useEffect(() => {
    if (!prize) return
    setError(null)
    setPickedStyle(null)
    setForm({
      name: prize.name,
      description: prize.description ?? "",
      value: prize.value ?? "",
      maxPicks: prize.maxPicks != null ? String(prize.maxPicks) : "3",
      criteria:
        prize.judgingStyle === "gate_check"
          ? (prize.criteria ?? []).map((c) => ({
              id: nextDraftId(),
              name: c.name,
              description: c.description ?? "",
            }))
          : [],
      weightedCriteria:
        prize.judgingStyle === "weighted_score"
          ? (prize.criteria ?? []).map((c) => ({
              id: nextDraftId(),
              name: c.name,
              description: c.description ?? "",
              weight: c.weight != null ? String(c.weight) : "",
              minScore: c.minScore != null ? String(c.minScore) : "1",
              maxScore: c.maxScore != null ? String(c.maxScore) : "10",
            }))
          : [],
      buckets:
        prize.judgingStyle === "bucket_sort"
          ? (prize.buckets ?? []).map((b) => ({
              id: nextDraftId(),
              level: b.level,
              label: b.label,
              description: b.description ?? "",
            }))
          : [],
    })
  }, [prize])

  function updateCriterion(index: number, patch: Partial<CriterionDraft>) {
    setForm({
      ...form,
      criteria: form.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    })
  }

  function addCriterion() {
    setForm({
      ...form,
      criteria: [...form.criteria, { id: nextDraftId(), name: "", description: "" }],
    })
  }

  function removeCriterion(index: number) {
    if (form.criteria.length <= 1) return
    setForm({ ...form, criteria: form.criteria.filter((_, i) => i !== index) })
  }

  function updateBucket(index: number, patch: Partial<BucketDraft>) {
    setForm({
      ...form,
      buckets: form.buckets.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    })
  }

  function addBucket() {
    const nextLevel = form.buckets.length > 0
      ? Math.max(...form.buckets.map((b) => b.level)) + 1
      : 1
    setForm({
      ...form,
      buckets: [
        ...form.buckets,
        { id: nextDraftId(), level: nextLevel, label: "", description: "" },
      ],
    })
  }

  function removeBucket(index: number) {
    if (form.buckets.length <= 2) return
    setForm({ ...form, buckets: form.buckets.filter((_, i) => i !== index) })
  }

  function updateWeighted(index: number, patch: Partial<WeightedCriterionDraft>) {
    setForm({
      ...form,
      weightedCriteria: form.weightedCriteria.map((c, i) =>
        i === index ? { ...c, ...patch } : c
      ),
    })
  }

  function addWeighted() {
    setForm({
      ...form,
      weightedCriteria: [
        ...form.weightedCriteria,
        { id: nextDraftId(), name: "", description: "", weight: "", minScore: "1", maxScore: "10" },
      ],
    })
  }

  function removeWeighted(index: number) {
    setForm({
      ...form,
      weightedCriteria: form.weightedCriteria.filter((_, i) => i !== index),
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!prize) return

    const name = form.name.trim()
    if (!name) {
      setError("Name is required")
      return
    }

    let criteriaPayload:
      | { name: string; description: string | null; weight?: number; minScore?: number; maxScore?: number }[]
      | undefined
    let bucketsPayload: { level: number; label: string; description: string | null }[] | undefined
    let maxPicksPayload: number | undefined

    if (!effectiveStyle) {
      setError("Pick how judges should score this prize")
      return
    }

    if (effectiveStyle === "weighted_score") {
      const cleaned = form.weightedCriteria
        .map((c) => ({
          name: c.name.trim(),
          description: c.description.trim() || null,
          weight: Number(c.weight),
          minScore: Number(c.minScore),
          maxScore: Number(c.maxScore),
        }))
        .filter((c) => c.name.length > 0)
      for (const c of cleaned) {
        if (!Number.isFinite(c.weight) || c.weight < 0 || c.weight > 100) {
          setError("Each weight must be between 0 and 100")
          return
        }
        if (
          !Number.isFinite(c.minScore) ||
          !Number.isFinite(c.maxScore) ||
          c.minScore < 0 ||
          !(c.minScore < c.maxScore)
        ) {
          setError(`"${c.name}": min must be 0 or higher and less than max`)
          return
        }
      }
      criteriaPayload = cleaned
    }

    if (effectiveStyle === "gate_check") {
      const cleaned = form.criteria
        .map((c) => ({ name: c.name.trim(), description: c.description.trim() || null }))
        .filter((c) => c.name.length > 0)
      if (cleaned.length === 0) {
        setError("Add at least one check")
        return
      }
      criteriaPayload = cleaned
    }

    if (effectiveStyle === "bucket_sort") {
      const cleaned = form.buckets
        .map((b) => ({ level: b.level, label: b.label.trim(), description: b.description.trim() || null }))
        .filter((b) => b.label.length > 0)
      if (cleaned.length < 2) {
        setError("Add at least two sort groups")
        return
      }
      bucketsPayload = cleaned
    }

    if (effectiveStyle === "judges_pick") {
      const parsed = parseInt(form.maxPicks, 10)
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
        setError("Max picks must be between 1 and 100")
        return
      }
      maxPicksPayload = parsed
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes/${prize.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: form.description.trim() || null,
            value: form.value.trim() || null,
            judgingStyle: effectiveStyle,
            ...(criteriaPayload ? { criteria: criteriaPayload } : {}),
            ...(bucketsPayload ? { buckets: bucketsPayload } : {}),
            ...(maxPicksPayload !== undefined ? { maxPicks: maxPicksPayload } : {}),
          }),
        }
      )

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to save")
      }

      const updated: UpdatedPrize = {
        id: prize.id,
        name,
        description: form.description.trim() || null,
        value: form.value.trim() || null,
        maxPicks: maxPicksPayload ?? prize.maxPicks,
        criteria: criteriaPayload
          ? criteriaPayload.map((c, i) => ({
              id: `optimistic-edit-${prize.id}-criterion-${i}`,
              name: c.name,
              description: c.description,
              ...(c.weight !== undefined ? { weight: c.weight } : {}),
              ...(c.minScore !== undefined ? { minScore: c.minScore } : {}),
              ...(c.maxScore !== undefined ? { maxScore: c.maxScore } : {}),
            }))
          : prize.criteria,
        buckets: bucketsPayload
          ? bucketsPayload.map((b, i) => ({
              id: `optimistic-edit-${prize.id}-bucket-${i}`,
              level: b.level,
              label: b.label,
              description: b.description,
            }))
          : prize.buckets,
      }

      onSuccess?.(updated)
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleSave(e as unknown as React.FormEvent)
    }
  }

  const open = prize !== null

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit prize</DialogTitle>
        </DialogHeader>
        {prize && (
          <form onSubmit={handleSave} onKeyDown={handleKeyDown} autoComplete="off" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-prize-name">Name</Label>
              <Input
                id="edit-prize-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-prize-value">Reward</Label>
              <Input
                id="edit-prize-value"
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
              <Label htmlFor="edit-prize-description">Description</Label>
              <Textarea
                id="edit-prize-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>

            {effectiveStyle && pickedStyle && !prize.judgingStyle && (() => {
              const selectedOption = STYLE_OPTIONS.find((o) => o.value === effectiveStyle)
              if (!selectedOption) return null
              const SelectedIcon = selectedOption.icon
              return (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <SelectedIcon className="size-4 shrink-0" />
                    <span className="font-medium truncate">{selectedOption.label}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto shrink-0 px-2 py-1 text-xs"
                    onClick={() => setPickedStyle(null)}
                  >
                    Change
                  </Button>
                </div>
              )
            })()}

            {!effectiveStyle && (
              <div className="space-y-2">
                <Label>How should judges score this prize?</Label>
                <div className="space-y-2">
                  {STYLE_OPTIONS.map((option) => {
                    const Icon = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setPickedStyle(option.value)
                          if (option.value === "bucket_sort") {
                            setForm({
                              ...form,
                              buckets: DEFAULT_BUCKETS.map((b) => ({
                                id: nextDraftId(),
                                level: b.level,
                                label: b.label,
                                description: b.description,
                              })),
                            })
                          } else if (option.value === "gate_check") {
                            setForm({
                              ...form,
                              criteria: [{ id: nextDraftId(), name: "", description: "" }],
                            })
                          } else if (option.value === "weighted_score") {
                            setForm({
                              ...form,
                              weightedCriteria: [
                                { id: nextDraftId(), name: "", description: "", weight: "", minScore: "1", maxScore: "10" },
                              ],
                            })
                          }
                        }}
                        className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="size-5 mt-0.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{option.label}</span>
                            <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{option.detail}</p>
                          </div>
                          <ChevronRight className="size-4 mt-1 shrink-0 text-muted-foreground" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {effectiveStyle === "gate_check" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>What should each project pass?</Label>
                    <p className="text-xs text-muted-foreground">
                      Judges answer yes or no for each rule.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addCriterion}>
                    <Plus className="mr-1 size-3.5" />
                    Add rule
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.criteria.map((c, i) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-md border p-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <Input
                          value={c.name}
                          onChange={(e) => updateCriterion(i, { name: e.target.value })}
                          placeholder="e.g. Uses the sponsor's API"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                        <Input
                          value={c.description}
                          onChange={(e) => updateCriterion(i, { description: e.target.value })}
                          placeholder="Helper text for judges (optional)"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => removeCriterion(i)}
                        disabled={form.criteria.length <= 1}
                        aria-label="Remove rule"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {effectiveStyle === "bucket_sort" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Sort groups</Label>
                    <p className="text-xs text-muted-foreground">
                      Judges put each project into one of these.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addBucket}>
                    <Plus className="mr-1 size-3.5" />
                    Add group
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.buckets.map((b, i) => (
                    <div key={b.id} className="flex items-start gap-2 rounded-md border p-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <Input
                          value={b.label}
                          onChange={(e) => updateBucket(i, { label: e.target.value })}
                          placeholder="Group name (e.g. Great)"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                        <Input
                          value={b.description}
                          onChange={(e) => updateBucket(i, { description: e.target.value })}
                          placeholder="What goes here? (optional)"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => removeBucket(i)}
                        disabled={form.buckets.length <= 2}
                        aria-label="Remove group"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {effectiveStyle === "weighted_score" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>What this prize cares about</Label>
                    <p className="text-xs text-muted-foreground">
                      Judges score each on a custom range (default 1–10). Together with the score categories ({coreWeightSum}%), aim for weights that add to 100.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addWeighted}>
                    <Plus className="mr-1 size-3.5" />
                    Add criterion
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.weightedCriteria.map((c, i) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-md border p-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <Input
                          value={c.name}
                          onChange={(e) => updateWeighted(i, { name: e.target.value })}
                          placeholder="e.g. Use of sponsor API"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                        <Input
                          value={c.description}
                          onChange={(e) => updateWeighted(i, { description: e.target.value })}
                          placeholder="Helper text for judges (optional)"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-center w-16">
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={c.minScore}
                              onChange={(e) => updateWeighted(i, { minScore: e.target.value })}
                              className="text-center"
                              autoComplete="off"
                            />
                            <span className="text-xs text-muted-foreground mt-1">min</span>
                          </div>
                          <span className="text-muted-foreground pt-2">–</span>
                          <div className="flex flex-col items-center w-16">
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={c.maxScore}
                              onChange={(e) => updateWeighted(i, { maxScore: e.target.value })}
                              className="text-center"
                              autoComplete="off"
                            />
                            <span className="text-xs text-muted-foreground mt-1">max</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center w-20 shrink-0">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          value={c.weight}
                          onChange={(e) => updateWeighted(i, { weight: e.target.value })}
                          placeholder="%"
                          className="text-center"
                          autoComplete="off"
                        />
                        <span className="text-xs text-muted-foreground mt-1">weight %</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => removeWeighted(i)}
                        aria-label="Remove criterion"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {(() => {
                  const prizeSum = form.weightedCriteria.reduce(
                    (acc, c) => acc + (Number(c.weight) || 0),
                    0
                  )
                  const total = coreWeightSum + prizeSum
                  const ok = Math.abs(total - 100) < 0.01
                  return (
                    <p className="text-xs text-muted-foreground">
                      Score categories {coreWeightSum}% + this prize {prizeSum}% = {total}% {ok ? "✓" : "(aim for 100)"}
                    </p>
                  )
                })()}
              </div>
            )}

            {effectiveStyle === "judges_pick" && (
              <div className="space-y-2">
                <Label htmlFor="edit-prize-max-picks">How many can each judge pick?</Label>
                <Input
                  id="edit-prize-max-picks"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={form.maxPicks}
                  onChange={(e) => setForm({ ...form, maxPicks: e.target.value })}
                  className="w-full sm:w-32"
                  autoComplete="off"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
