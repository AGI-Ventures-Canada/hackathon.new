"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { assertOkJson } from "@/lib/utils/fetch"
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
  ArrowUpDown,
  ListChecks,
  Vote,
  Award,
  ChevronRight,
  Plus,
  Trash2,
  Sliders,
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
    description: "Judges score by sorting each project into a group like great, okay, or not ready.",
    detail: "Good for: grand prize or overall winner",
    icon: ArrowUpDown,
  },
  {
    value: "gate_check",
    label: "Pass or fail",
    description: "Judges score by giving each project a yes or no on a list of rules.",
    detail: "Good for: “Best Use of [Product]” or rule-based prizes",
    icon: ListChecks,
  },
  {
    value: "crowd_vote",
    label: "Everyone votes",
    description: "Anyone at the event can vote. No judges needed.",
    detail: "Good for: People's Choice or Audience Award",
    icon: Vote,
  },
  {
    value: "judges_pick",
    label: "Judge's picks (by vibes)",
    description: "No scoring. Each judge picks their favorites. Most picks wins.",
    detail: "Example: 3 judges each pick 1 favorite from 6 finalists. The top-picked project wins.",
    icon: Award,
  },
  {
    value: "weighted_score",
    label: "Weighted scoring",
    description: "Judges rate each project on a set of categories you define, with a weight assigned to each.",
    detail: "Good for: sponsor prizes with a custom rubric on top of shared criteria",
    icon: Sliders,
  },
]

const DEFAULT_BUCKETS = [
  { level: 1, label: "Not Ready", description: "No working demo or unclear problem statement" },
  { level: 2, label: "Solid Effort", description: "Working demo, clear problem, but incremental or execution has gaps" },
  { level: 3, label: "Strong Contender", description: "Working demo, novel approach, good execution" },
  { level: 4, label: "Outstanding", description: "Would invest in this team today. Exceptional on multiple dimensions" },
]

type CreateStep = "style" | "details"

export type CreatedPrize = {
  id: string
  name: string
  description: string | null
  value: string | null
  type: string | null
  judgingStyle: PrizeJudgingStyle
  roundId: string | null
  maxPicks: number | null
  criteria:
    | { id: string; name: string; description: string | null }[]
    | null
  buckets:
    | { id: string; level: number; label: string; description: string | null }[]
    | null
}

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
  return `draft-${draftIdCounter}`
}

interface AddPrizeDialogProps {
  hackathonId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (created?: CreatedPrize) => void
  rounds?: RoundData[]
  coreWeightSum?: number
  coreCriteriaCount?: number
}

function initialWeightedCriteria(): WeightedCriterionDraft[] {
  return [{ id: nextDraftId(), name: "", description: "", weight: "", minScore: "1", maxScore: "10" }]
}

function emptyWeightedCriteria(): WeightedCriterionDraft[] {
  return []
}

function initialCriteria(): CriterionDraft[] {
  return [{ id: nextDraftId(), name: "", description: "" }]
}

function initialBuckets(): BucketDraft[] {
  return DEFAULT_BUCKETS.map((b) => ({
    id: nextDraftId(),
    level: b.level,
    label: b.label,
    description: b.description,
  }))
}

export function AddPrizeDialog({
  hackathonId,
  open,
  onOpenChange,
  onSuccess,
  rounds = [],
  coreWeightSum: coreWeightSumProp = 0,
  coreCriteriaCount: coreCriteriaCountProp = 0,
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
    criteria: initialCriteria(),
    weightedCriteria: initialWeightedCriteria(),
    buckets: initialBuckets(),
    maxPicks: "3",
  })
  const [error, setError] = useState<string | null>(null)
  const [coreWeightSum, setCoreWeightSum] = useState(coreWeightSumProp)
  const [coreCriteriaCount, setCoreCriteriaCount] = useState(coreCriteriaCountProp)
  const [seedingCore, setSeedingCore] = useState(false)
  const [seededInThisFlow, setSeededInThisFlow] = useState(false)
  const seedAttemptedRef = useRef(false)

  useEffect(() => {
    setCoreWeightSum(coreWeightSumProp)
  }, [coreWeightSumProp])
  useEffect(() => {
    setCoreCriteriaCount(coreCriteriaCountProp)
  }, [coreCriteriaCountProp])

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
        criteria: initialCriteria(),
        weightedCriteria: initialWeightedCriteria(),
        buckets: initialBuckets(),
        maxPicks: "3",
      })
      setError(null)
      setSeededInThisFlow(false)
      seedAttemptedRef.current = false
    }
    onOpenChange(nextOpen)
  }

  async function maybeSeedCoreCriteria() {
    if (seedAttemptedRef.current) return
    if (coreCriteriaCount > 0) return
    seedAttemptedRef.current = true
    setSeedingCore(true)
    try {
      const data = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/core-criteria/seed-defaults`,
        { method: "POST" }
      ).then(assertOkJson<{ criteria: { weight: number }[] }>)
      const seededSum = data.criteria.reduce((acc, c) => acc + c.weight, 0)
      setCoreWeightSum(seededSum)
      setCoreCriteriaCount(data.criteria.length)
      setSeededInThisFlow(true)
      router.refresh()
    } catch {
      // Seeding is best-effort. If it fails (e.g., already exists), the user can still configure.
    } finally {
      setSeedingCore(false)
    }
  }

  function selectStyle(style: PrizeJudgingStyle) {
    const willSeed = style === "weighted_score" && coreCriteriaCount === 0
    setForm({
      ...form,
      name: "",
      judgingStyle: style,
      criteria: style === "gate_check" ? initialCriteria() : form.criteria,
      weightedCriteria:
        style === "weighted_score"
          ? willSeed
            ? emptyWeightedCriteria()
            : initialWeightedCriteria()
          : form.weightedCriteria,
      buckets: style === "bucket_sort" ? initialBuckets() : form.buckets,
      maxPicks: style === "judges_pick" ? "3" : form.maxPicks,
    })
    setStep("details")
    if (style === "weighted_score") {
      void maybeSeedCoreCriteria()
    }
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError("Name is required")
      return
    }
    const description = form.description.trim()
    if (!description) {
      setError("Description is required — judges need to know what this prize is for")
      return
    }

    let criteriaPayload:
      | { name: string; description: string | null; weight?: number; minScore?: number; maxScore?: number }[]
      | undefined
    let bucketsPayload: { level: number; label: string; description: string | null }[] | undefined
    let maxPicksPayload: number | undefined

    if (form.judgingStyle === "weighted_score") {
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

    if (form.judgingStyle === "gate_check") {
      const cleaned = form.criteria
        .map((c) => ({ name: c.name.trim(), description: c.description.trim() || null }))
        .filter((c) => c.name.length > 0)
      if (cleaned.length === 0) {
        setError("Add at least one check")
        return
      }
      criteriaPayload = cleaned
    }

    if (form.judgingStyle === "bucket_sort") {
      const cleaned = form.buckets
        .map((b) => ({ level: b.level, label: b.label.trim(), description: b.description.trim() || null }))
        .filter((b) => b.label.length > 0)
      if (cleaned.length < 2) {
        setError("Add at least two sort groups")
        return
      }
      bucketsPayload = cleaned
    }

    if (form.judgingStyle === "judges_pick") {
      const parsed = parseInt(form.maxPicks, 10)
      if (!Number.isFinite(parsed) || parsed < 1) {
        setError("Max picks must be 1 or more")
        return
      }
      maxPicksPayload = parsed
    }

    setError(null)
    const savedForm = { ...form, name }
    handleOpenChange(false)

    try {
      const data = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/prizes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: form.description.trim() || undefined,
            value: form.value.trim() || undefined,
            judgingStyle: form.judgingStyle,
            ...(form.roundId ? { roundId: form.roundId } : {}),
            ...(criteriaPayload ? { criteria: criteriaPayload } : {}),
            ...(bucketsPayload ? { buckets: bucketsPayload } : {}),
            ...(maxPicksPayload !== undefined ? { maxPicks: maxPicksPayload } : {}),
          }),
        }
      ).then(assertOkJson<{ prize: { id: string; name: string; description: string | null; value: string | null; type: string | null; judging_style: string | null; round_id: string | null } }>)

      router.refresh()
      onSuccess?.({
        id: data.prize.id,
        name: data.prize.name,
        description: data.prize.description,
        value: data.prize.value,
        type: data.prize.type,
        judgingStyle: data.prize.judging_style as PrizeJudgingStyle,
        roundId: data.prize.round_id,
        maxPicks: maxPicksPayload ?? null,
        criteria: criteriaPayload
          ? criteriaPayload.map((c, i) => ({
              id: `optimistic-${data.prize.id}-criterion-${i}`,
              name: c.name,
              description: c.description,
            }))
          : null,
        buckets: bucketsPayload
          ? bucketsPayload.map((b, i) => ({
              id: `optimistic-${data.prize.id}-bucket-${i}`,
              level: b.level,
              label: b.label,
              description: b.description,
            }))
          : null,
      })
    } catch (err) {
      setForm(savedForm)
      setStep("details")
      setError(err instanceof Error ? err.message : "Something went wrong")
      onOpenChange(true)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleCreate(e as unknown as React.FormEvent)
    }
  }

  const selectedOption = STYLE_OPTIONS.find((o) => o.value === form.judgingStyle)
  const SelectedIcon = selectedOption?.icon ?? ArrowUpDown

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={step === "style" ? "sm:max-w-lg" : "sm:max-w-xl max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>
            {step === "style" ? "How should judges pick the winner?" : "Prize details"}
          </DialogTitle>
        </DialogHeader>
        {step === "style" ? (
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
          <form onSubmit={handleCreate} onKeyDown={handleKeyDown} autoComplete="off" className="space-y-4">
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

            {form.judgingStyle === "gate_check" && (
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

            {form.judgingStyle === "bucket_sort" && (
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

            {form.judgingStyle === "weighted_score" && (
              <div className="space-y-2">
                {seedingCore && (
                  <p className="text-xs text-muted-foreground">Setting up starter score categories…</p>
                )}
                {seededInThisFlow && !seedingCore && (
                  <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                    We added 4 starter score categories you can edit later. Together they cover the full 100%, so this prize doesn&apos;t need any extra categories.
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Bonus categories for this prize (optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Add extra things judges score this prize on. Together with the score categories ({coreWeightSum}%), all weights must add up to 100.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addWeighted}>
                    <Plus className="mr-1 size-3.5" />
                    Add bonus category
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

            {form.judgingStyle === "judges_pick" && (
              <div className="space-y-2">
                <Label htmlFor="add-prize-max-picks">How many can each judge pick?</Label>
                <Input
                  id="add-prize-max-picks"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={form.maxPicks}
                  onChange={(e) => setForm({ ...form, maxPicks: e.target.value })}
                  className="w-full sm:w-32"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  For example, 3 means each judge picks their top 3.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("style")}>
                Back
              </Button>
              <Button type="submit">
                Create Prize
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
