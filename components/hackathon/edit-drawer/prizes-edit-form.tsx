"use client"

import { useState, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { assertOk } from "@/lib/utils/fetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import { useEdit } from "@/components/hackathon/preview/edit-context"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Trash2,
  Loader2,
  Undo2,
  Check,
  ChevronsUpDown,
  Trophy,
  Heart,
  Star,
  BarChart3,
} from "lucide-react"
import type {
  PrizeType,
  JudgingCriteria,
  JudgingMode,
} from "@/lib/db/hackathon-types"
import type { PublicPrize } from "@/lib/services/public-hackathons"

type Prize = PublicPrize & {
  monetary_value?: number | null
  currency?: string | null
  distribution_method?: string | null
}
import { cn } from "@/lib/utils"

interface PrizesEditFormProps {
  hackathonId: string
  initialPrizes: Prize[]
  criteria?: JudgingCriteria[]
  judgingMode?: JudgingMode
  onSaveAndNext?: () => void
  onSave?: (data: {
    prizes: {
      name: string
      description: string | null
      value: string | null
    }[]
  }) => Promise<boolean>
}

type PendingChange =
  | { type: "add"; prize: Prize; tempId: string }
  | { type: "delete"; prizeId: string; originalPrize: Prize }
  | {
      type: "update"
      prizeId: string
      field: string
      newValue: unknown
      oldValue: unknown
    }

type PresetContext = {
  currentPrizes: Prize[]
  criteria: JudgingCriteria[]
  judgingMode: JudgingMode
}

type PresetPrize = {
  name: string
  type: PrizeType
  rank: number | null
  kind: string
  criteria_id: string | null
}

type PresetDef = {
  id: string
  label: string | ((ctx: PresetContext) => string)
  description: string | ((ctx: PresetContext) => string)
  icon: React.ComponentType<{ className?: string }>
  prizes: (ctx: PresetContext) => PresetPrize[]
}

const STATIC_PRESETS: PresetDef[] = [
  {
    id: "podium",
    label: "1st, 2nd, 3rd Place",
    description:
      "Creates three prizes awarded to the highest-scoring submissions based on overall judge scores.",
    icon: Trophy,
    prizes: ({ currentPrizes }) => {
      const existingRanks = new Set(
        currentPrizes
          .filter((p) => p.type === "score" && p.rank != null)
          .map((p) => p.rank!),
      )
      const podium = [
        { rank: 1, name: "1st Place" },
        { rank: 2, name: "2nd Place" },
        { rank: 3, name: "3rd Place" },
      ]
      return podium
        .filter((p) => !existingRanks.has(p.rank))
        .map((p) => ({
          name: p.name,
          type: "score" as PrizeType,
          rank: p.rank,
          kind: "cash",
          criteria_id: null,
        }))
    },
  },
  {
    id: "audience",
    label: "Audience Favorite",
    description:
      "One prize decided by audience voting. Participants and spectators vote for their favorite.",
    icon: Heart,
    prizes: ({ currentPrizes }) => {
      const hasCrowd = currentPrizes.some((p) => p.type === "crowd")
      if (hasCrowd) return []
      return [
        {
          name: "Audience Favorite",
          type: "crowd" as PrizeType,
          rank: null,
          kind: "other",
          criteria_id: null,
        },
      ]
    },
  },
  {
    id: "judges-choice",
    label: (ctx) =>
      ctx.judgingMode === "subjective" ? "Judge's Choice" : "Organizer's Pick",
    description: (ctx) =>
      ctx.judgingMode === "subjective"
        ? "Judges vote for their top pick — most votes wins."
        : "One prize where you hand-pick the winner.",
    icon: Star,
    prizes: ({ currentPrizes }) => {
      const hasFavorite = currentPrizes.some((p) => p.type === "favorite")
      if (hasFavorite) return []
      return [
        {
          name: "Judge's Choice",
          type: "favorite" as PrizeType,
          rank: null,
          kind: "other",
          criteria_id: null,
        },
      ]
    },
  },
]

function getCriteriaPresets(criteria: JudgingCriteria[]): PresetDef[] {
  return criteria.map((c) => ({
    id: `criteria-${c.id}`,
    label: `Best in ${c.name}`,
    description: `Awarded to the submission with the highest score in ${c.name}.`,
    icon: BarChart3,
    prizes: ({ currentPrizes }) => {
      const exists = currentPrizes.some(
        (p) => p.type === "criteria" && p.criteria_id === c.id,
      )
      if (exists) return []
      return [
        {
          name: `Best in ${c.name}`,
          type: "criteria" as PrizeType,
          rank: null,
          kind: "other",
          criteria_id: c.id,
        },
      ]
    },
  }))
}

const KIND_PRESETS = [
  { value: "cash", label: "Cash" },
  { value: "credit", label: "Credit" },
  { value: "swag", label: "Swag" },
  { value: "experience", label: "Experience" },
  { value: "other", label: "Other" },
]

function getTypeInfo(
  type: PrizeType,
  judgingMode?: JudgingMode,
  criterionName?: string,
): string {
  switch (type) {
    case "score":
      return "Awarded to rank #N based on overall judging scores"
    case "criteria":
      return criterionName
        ? `Awarded to highest score in ${criterionName}`
        : "Awarded to highest score in a specific criterion"
    case "favorite":
      return judgingMode === "subjective"
        ? "Judges vote for their pick — most-picked wins"
        : "You'll manually select the winner"
    case "crowd":
      return "Determined by audience votes"
    default:
      return ""
  }
}

export function PrizesEditForm({
  hackathonId,
  initialPrizes,
  criteria = [],
  judgingMode = "points",
  onSaveAndNext,
  onSave,
}: PrizesEditFormProps) {
  const isLocalMode = !!onSave
  const router = useRouter()
  const { closeDrawer } = useEdit()
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState("")
  const tempIdCounter = useRef(0)

  const currentPrizes = useMemo(() => {
    let prizes = [...initialPrizes]

    for (const change of pendingChanges) {
      if (change.type === "add") {
        prizes.push(change.prize)
      } else if (change.type === "delete") {
        prizes = prizes.filter((p) => p.id !== change.prizeId)
      } else if (change.type === "update") {
        prizes = prizes.map((p) =>
          p.id === change.prizeId
            ? { ...p, [change.field]: change.newValue }
            : p,
        )
      }
    }

    return prizes
  }, [initialPrizes, pendingChanges])

  const hasChanges = pendingChanges.length > 0

  function handleAddPrize() {
    if (!nameInput.trim()) return

    const tempId = `temp-${++tempIdCounter.current}`
    const newPrize: Prize = {
      id: tempId,
      hackathon_id: hackathonId,
      name: nameInput.trim(),
      description: null,
      value: null,
      type: "favorite",
      rank: null,
      kind: "other",
      monetary_value: null,
      currency: "USD",
      distribution_method: null,
      display_value: null,
      criteria_id: null,
      prize_track_id: null,
      judging_style: null,
      round_id: null,
      assignment_mode: null,
      max_picks: null,
      is_screening: false,
      allowed_team_modes: null,
      display_order: currentPrizes.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setPendingChanges([
      ...pendingChanges,
      { type: "add", prize: newPrize, tempId },
    ])
    setNameInput("")
  }

  const presetCtx: PresetContext = useMemo(
    () => ({ currentPrizes, criteria, judgingMode }),
    [currentPrizes, criteria, judgingMode],
  )

  const allPresets = useMemo(
    () => [...STATIC_PRESETS, ...getCriteriaPresets(criteria)],
    [criteria],
  )

  function handleAddPreset(preset: PresetDef) {
    const prizes = preset.prizes(presetCtx)
    if (prizes.length === 0) return

    const newChanges: PendingChange[] = prizes.map((p) => {
      const tempId = `temp-${++tempIdCounter.current}`
      return {
        type: "add" as const,
        tempId,
        prize: {
          id: tempId,
          hackathon_id: hackathonId,
          name: p.name,
          description: null,
          value: null,
          type: p.type,
          rank: p.rank,
          kind: p.kind,
          monetary_value: null,
          currency: "USD",
          distribution_method: null,
          display_value: null,
          criteria_id: p.criteria_id,
          prize_track_id: null,
          judging_style: null,
          round_id: null,
          assignment_mode: null,
          max_picks: null,
          is_screening: false,
          allowed_team_modes: null,
          display_order: currentPrizes.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }
    })

    setPendingChanges([...pendingChanges, ...newChanges])
  }

  function handleDeletePrize(prizeId: string) {
    const addChange = pendingChanges.find(
      (c) => c.type === "add" && c.tempId === prizeId,
    )

    if (addChange) {
      setPendingChanges(pendingChanges.filter((c) => c !== addChange))
      return
    }

    const originalPrize = initialPrizes.find((p) => p.id === prizeId)
    if (!originalPrize) return

    const relatedChanges = pendingChanges.filter(
      (c) => c.type === "update" && c.prizeId === prizeId,
    )
    const filtered = pendingChanges.filter((c) => !relatedChanges.includes(c))
    setPendingChanges([
      ...filtered,
      { type: "delete", prizeId, originalPrize },
    ])
  }

  function handleFieldChange(prizeId: string, field: string, value: unknown) {
    const addChange = pendingChanges.find(
      (c) => c.type === "add" && c.tempId === prizeId,
    ) as Extract<PendingChange, { type: "add" }> | undefined

    if (addChange) {
      setPendingChanges(
        pendingChanges.map((c) =>
          c === addChange ? { ...c, prize: { ...c.prize, [field]: value } } : c,
        ),
      )
      return
    }

    const existingUpdate = pendingChanges.findIndex(
      (c) => c.type === "update" && c.prizeId === prizeId && c.field === field,
    )

    const original = initialPrizes.find((p) => p.id === prizeId)
    if (!original) return

    const oldValue = (original as unknown as Record<string, unknown>)[field]

    if (existingUpdate >= 0) {
      if (value === oldValue || (value === "" && oldValue === null)) {
        setPendingChanges(
          pendingChanges.filter((_, i) => i !== existingUpdate),
        )
      } else {
        const updated = [...pendingChanges]
        updated[existingUpdate] = {
          type: "update",
          prizeId,
          field,
          newValue: value,
          oldValue,
        }
        setPendingChanges(updated)
      }
      return
    }

    if (value !== oldValue && !(value === "" && oldValue === null)) {
      setPendingChanges([
        ...pendingChanges,
        { type: "update", prizeId, field, newValue: value, oldValue },
      ])
    }
  }

  function handleUndo(index: number) {
    setPendingChanges(pendingChanges.filter((_, i) => i !== index))
  }

  function handleUndoAll() {
    setPendingChanges([])
  }

  async function saveChanges() {
    if (!hasChanges) return true

    if (isLocalMode) {
      const prizesData = currentPrizes.map((p) => ({
        name: p.name,
        description: p.description,
        value: p.value,
      }))
      const ok = await onSave!({ prizes: prizesData })
      if (ok) {
        setPendingChanges([])
      }
      return ok
    }

    setSaving(true)
    setError(null)

    try {
      for (const change of pendingChanges) {
        if (change.type === "add") {
          await fetch(`/api/dashboard/hackathons/${hackathonId}/prizes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: change.prize.name,
              description: change.prize.description,
              value: change.prize.value,
              type: change.prize.type,
              rank: change.prize.rank,
              kind: change.prize.kind,
              monetaryValue: change.prize.monetary_value,
              currency: change.prize.currency,
              distributionMethod: change.prize.distribution_method,
              displayValue: change.prize.display_value,
              criteriaId: change.prize.criteria_id,
              displayOrder: change.prize.display_order,
            }),
          }).then(assertOk)
        } else if (change.type === "delete") {
          await fetch(
            `/api/dashboard/hackathons/${hackathonId}/prizes/${change.prizeId}`,
            { method: "DELETE" },
          ).then(assertOk)
        } else if (change.type === "update") {
          const body: Record<string, unknown> = {}
          const fieldMap: Record<string, string> = {
            type: "type",
            rank: "rank",
            kind: "kind",
            monetary_value: "monetaryValue",
            currency: "currency",
            distribution_method: "distributionMethod",
            display_value: "displayValue",
            criteria_id: "criteriaId",
          }

          const apiField = fieldMap[change.field] ?? change.field
          body[apiField] = change.newValue ?? null

          await fetch(
            `/api/dashboard/hackathons/${hackathonId}/prizes/${change.prizeId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          ).then(assertOk)
        }
      }

      router.refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!hasChanges) {
      closeDrawer()
      return
    }

    const ok = await saveChanges()
    if (ok) closeDrawer()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      if (nameInput.trim() && !saving) {
        handleAddPrize()
      } else if (!saving) {
        saveChanges().then((ok) => {
          if (ok) {
            if (onSaveAndNext) {
              onSaveAndNext()
            } else {
              closeDrawer()
            }
          }
        })
      }
    }
  }

  function isDeleted(prizeId: string) {
    return pendingChanges.some(
      (c) => c.type === "delete" && c.prizeId === prizeId,
    )
  }

  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      <FieldGroup>
        <Field>
          <FieldLabel>Quick Add</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {allPresets.map((preset) => {
              const remaining = preset.prizes(presetCtx)
              const fullyUsed = remaining.length === 0
              const label =
                typeof preset.label === "function"
                  ? preset.label(presetCtx)
                  : preset.label
              const description =
                typeof preset.description === "function"
                  ? preset.description(presetCtx)
                  : preset.description
              const Icon = preset.icon

              return (
                <HoverCard key={preset.id} openDelay={300}>
                  <HoverCardTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={fullyUsed}
                      onClick={() => handleAddPreset(preset)}
                    >
                      {fullyUsed ? (
                        <Check className="size-3 mr-1" />
                      ) : (
                        <Icon className="size-3 mr-1" />
                      )}
                      {label}
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent side="bottom" align="start">
                    {description}
                  </HoverCardContent>
                </HoverCard>
              )
            })}
          </div>
        </Field>

        <Field>
          <FieldLabel>Or add manually</FieldLabel>
          <Input
            placeholder="Prize name..."
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nameInput.trim()) {
                e.preventDefault()
                handleAddPrize()
              }
            }}
            autoFocus
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter to add
          </p>
        </Field>

        {error && <p className="text-destructive text-sm">{error}</p>}
      </FieldGroup>

      {currentPrizes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              Prizes ({currentPrizes.length})
            </h4>
            {hasChanges && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUndoAll}
                className="h-7 text-xs"
              >
                <Undo2 className="size-3 mr-1" />
                Undo all
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {currentPrizes.map((prize) => {
              const deleted = isDeleted(prize.id)
              const criterionName = prize.criteria_id
                ? criteria.find((c) => c.id === prize.criteria_id)?.name
                : undefined

              return (
                <div
                  key={prize.id}
                  className={`rounded-lg border p-3 space-y-3 ${
                    prize.id.startsWith("temp-")
                      ? "border-dashed bg-muted/30"
                      : ""
                  } ${deleted ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Input
                        value={prize.name}
                        onChange={(e) =>
                          handleFieldChange(prize.id, "name", e.target.value)
                        }
                        placeholder="Prize name"
                        disabled={deleted}
                        className="h-8 text-sm font-medium"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePrize(prize.id)}
                      disabled={deleted}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0 shrink-0"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <Textarea
                    value={prize.description ?? ""}
                    onChange={(e) =>
                      handleFieldChange(prize.id, "description", e.target.value)
                    }
                    placeholder="Description"
                    disabled={deleted}
                    rows={2}
                    className="text-sm resize-none"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      What&apos;s the prize?
                    </p>
                    <KindCombobox
                      value={prize.kind}
                      onChange={(v) => handleFieldChange(prize.id, "kind", v)}
                      disabled={deleted}
                    />
                    {prize.kind !== "cash" && prize.kind !== "credit" && (
                      <Input
                        value={prize.display_value ?? ""}
                        onChange={(e) =>
                          handleFieldChange(
                            prize.id,
                            "display_value",
                            e.target.value,
                          )
                        }
                        placeholder='Display value (e.g. "$5,000 USD")'
                        disabled={deleted}
                        className="h-8 text-sm"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                    )}
                    {(prize.kind === "cash" || prize.kind === "credit") && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          value={prize.monetary_value ?? ""}
                          onChange={(e) =>
                            handleFieldChange(
                              prize.id,
                              "monetary_value",
                              e.target.value
                                ? parseFloat(e.target.value)
                                : null,
                            )
                          }
                          placeholder="Amount"
                          disabled={deleted}
                          className="h-8 text-sm"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                        <Input
                          value={prize.currency ?? "USD"}
                          onChange={(e) =>
                            handleFieldChange(
                              prize.id,
                              "currency",
                              e.target.value,
                            )
                          }
                          placeholder="Currency (e.g. USD)"
                          disabled={deleted}
                          className="h-8 text-sm"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                        />
                      </div>
                    )}
                    <div className="rounded-md border border-border p-2 space-y-1.5">
                      <p className="text-xs font-bold text-primary">
                        Not shown to participants
                      </p>
                      <Input
                        value={prize.distribution_method ?? ""}
                        onChange={(e) =>
                          handleFieldChange(
                            prize.id,
                            "distribution_method",
                            e.target.value,
                          )
                        }
                        placeholder="Distribution note (e.g. Wire to captain)"
                        disabled={deleted}
                        className="h-8 text-sm"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      How is the winner decided?
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={prize.type}
                        onValueChange={(v) => {
                          handleFieldChange(prize.id, "type", v as PrizeType)
                          if (v !== "score")
                            handleFieldChange(prize.id, "rank", null)
                          if (v !== "criteria")
                            handleFieldChange(prize.id, "criteria_id", null)
                        }}
                        disabled={deleted}
                      >
                        <SelectTrigger className="w-44 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="score">Score-based</SelectItem>
                          <SelectItem value="criteria">
                            Best in Category
                          </SelectItem>
                          <SelectItem value="favorite">
                            {judgingMode === "subjective"
                              ? "Judge's Choice"
                              : "Organizer's Pick"}
                          </SelectItem>
                          <SelectItem value="crowd">
                            Crowd&apos;s Favorite
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {prize.type === "score" && (
                        <Select
                          value={prize.rank?.toString() ?? "1"}
                          onValueChange={(v) =>
                            handleFieldChange(prize.id, "rank", parseInt(v))
                          }
                          disabled={deleted}
                        >
                          <SelectTrigger className="w-20 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1st</SelectItem>
                            <SelectItem value="2">2nd</SelectItem>
                            <SelectItem value="3">3rd</SelectItem>
                            <SelectItem value="4">4th</SelectItem>
                            <SelectItem value="5">5th</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {prize.type === "criteria" && criteria.length > 0 && (
                        <Select
                          value={prize.criteria_id ?? ""}
                          onValueChange={(v) =>
                            handleFieldChange(
                              prize.id,
                              "criteria_id",
                              v || null,
                            )
                          }
                          disabled={deleted}
                        >
                          <SelectTrigger className="w-44 h-8 text-xs">
                            <SelectValue placeholder="Select criterion" />
                          </SelectTrigger>
                          <SelectContent>
                            {criteria.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {getTypeInfo(prize.type, judgingMode, criterionName)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {hasChanges && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <h4 className="text-xs font-medium text-muted-foreground">
            Pending changes ({pendingChanges.length})
          </h4>
          <div className="space-y-1">
            {pendingChanges.map((change, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">
                  {change.type === "add" && `+ Add "${change.prize.name}"`}
                  {change.type === "delete" &&
                    `- Remove "${change.originalPrize.name}"`}
                  {change.type === "update" && `~ Update ${change.field}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUndo(index)}
                  className="h-6 w-6 p-0"
                >
                  <Undo2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 pt-2">
        <div className="flex gap-2">
          {hasChanges ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  handleUndoAll()
                  closeDrawer()
                }}
              >
                Discard
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
                Save changes
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={closeDrawer}>
              Done
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <KbdGroup>
              <Kbd>&#x2318;</Kbd>
              <Kbd>&#x21B5;</Kbd>
            </KbdGroup>{" "}
            save & next
          </span>
        </div>
      </div>
    </div>
  )
}

function KindCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const selectedLabel =
    KIND_PRESETS.find((k) => k.value === value)?.label ?? value

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between h-8 text-xs"
        >
          {selectedLabel || "Select kind..."}
          <ChevronsUpDown className="ml-2 size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type custom..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-sm text-left hover:bg-accent"
                  onClick={() => {
                    onChange(search.trim().toLowerCase())
                    setOpen(false)
                    setSearch("")
                  }}
                >
                  Use &quot;{search.trim()}&quot;
                </button>
              ) : (
                "No results"
              )}
            </CommandEmpty>
            <CommandGroup>
              {KIND_PRESETS.map((kind) => (
                <CommandItem
                  key={kind.value}
                  value={kind.value}
                  onSelect={(v) => {
                    onChange(v)
                    setOpen(false)
                    setSearch("")
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-3",
                      value === kind.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {kind.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
