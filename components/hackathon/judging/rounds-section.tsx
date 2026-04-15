"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Layers,
  Plus,
  ArrowDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Lock,
  Play,
  CheckCircle2,
  ArrowRight,
} from "lucide-react"
import { RoundsPresetDialog, type RoundsPresetKind } from "./rounds-preset-dialog"
import { RoundFormDialog } from "./round-form-dialog"
import { AdvanceFinalistsDialog } from "./advance-finalists-dialog"
import type { RoundData } from "./rounds-types"

interface RoundsSectionProps {
  hackathonId: string
  rounds: RoundData[]
}

export function RoundsSection({ hackathonId, rounds }: RoundsSectionProps) {
  const router = useRouter()
  const [presetKind, setPresetKind] = useState<RoundsPresetKind | null>(null)
  const [showAddRound, setShowAddRound] = useState(false)
  const [editRound, setEditRound] = useState<RoundData | null>(null)
  const [deleteRound, setDeleteRound] = useState<RoundData | null>(null)
  const [advanceFromRound, setAdvanceFromRound] = useState<RoundData | null>(null)
  const [hiddenRounds, setHiddenRounds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const visibleRounds = rounds
    .filter((r) => !hiddenRounds.has(r.id))
    .sort((a, b) => a.displayOrder - b.displayOrder)

  const anyRoundActive = visibleRounds.some((r) => r.status === "active" || r.status === "complete" || r.status === "advanced")

  async function handleDeleteRound(round: RoundData) {
    setHiddenRounds((prev) => new Set(prev).add(round.id))
    setDeleteRound(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rounds/${round.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete round")
      }
      router.refresh()
    } catch (err) {
      setHiddenRounds((prev) => {
        const next = new Set(prev)
        next.delete(round.id)
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to delete round")
    }
  }

  async function handleActivate(round: RoundData) {
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rounds/${round.id}/activate`,
        { method: "POST" }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to activate round")
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate round")
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4" />
          Rounds
          {visibleRounds.length > 0 && (
            <Badge variant="secondary">{visibleRounds.length}</Badge>
          )}
        </CardTitle>
        {visibleRounds.length > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAddRound(true)}>
              <Plus className="mr-2 size-4" />
              <span className="hidden sm:inline">Add round</span>
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}

        {visibleRounds.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 sm:p-8 space-y-6 text-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">No rounds yet</p>
              <p className="text-xs text-muted-foreground">
                Add a round to decide how judges score projects.
              </p>
            </div>
            <Button size="lg" onClick={() => setShowAddRound(true)}>
              <Plus className="mr-2 size-4" />
              Add round
            </Button>
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">Or start from a template</p>
              <div className="flex flex-wrap justify-center gap-2">
                <TemplateChip label="One round" onClick={() => setPresetKind("single")} />
                <TemplateChip label="Shortlist + Finals" onClick={() => setPresetKind("shortlist")} />
                <TemplateChip label="Score gate + Finals" onClick={() => setPresetKind("threshold")} />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleRounds.map((round, index) => {
              const nextRound = visibleRounds[index + 1]
              const canEdit = round.status === "planned" && !anyRoundActive
              const topN = round.advancementConfig?.topN
              const threshold = round.advancementConfig?.threshold
              const isLocked = round.status !== "planned"
              const canActivate = round.status === "planned" && !anyRoundActive && index === 0
              const canAdvance =
                round.status === "active" &&
                round.advancement === "top_n" &&
                nextRound &&
                round.screeningPrizeId

              return (
                <div key={round.id}>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{round.name}</span>
                          <RoundStatusBadge status={round.status} />
                          {isLocked && <Lock className="size-3 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {describeAdvancement(round.advancement, topN, threshold)}
                          {" \u00B7 "}
                          {round.prizeCount} prize{round.prizeCount !== 1 ? "s" : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canActivate && (
                          <Button size="sm" variant="outline" onClick={() => handleActivate(round)}>
                            <Play className="mr-2 size-3" />
                            <span className="hidden sm:inline">Activate</span>
                          </Button>
                        )}
                        {canAdvance && (
                          <Button
                            size="sm"
                            onClick={() => setAdvanceFromRound(round)}
                          >
                            <ArrowRight className="mr-2 size-3" />
                            <span className="hidden sm:inline">
                              Advance top {topN ?? ""} to {nextRound.name}
                            </span>
                            <span className="sm:hidden">Advance</span>
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setEditRound(round)}>
                                <Pencil className="mr-2 size-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canEdit && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteRound(round)}
                              disabled={round.status === "active"}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  {nextRound && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="size-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <RoundsPresetDialog
        hackathonId={hackathonId}
        preset={presetKind}
        open={!!presetKind}
        onOpenChange={(open) => {
          if (!open) setPresetKind(null)
        }}
      />

      <RoundFormDialog
        hackathonId={hackathonId}
        mode="create"
        open={showAddRound}
        onOpenChange={setShowAddRound}
      />

      {editRound && (
        <RoundFormDialog
          hackathonId={hackathonId}
          mode="edit"
          open={!!editRound}
          onOpenChange={(open) => {
            if (!open) setEditRound(null)
          }}
          initial={{
            id: editRound.id,
            name: editRound.name,
            advancement: editRound.advancement,
            topN: editRound.advancementConfig?.topN,
            threshold: editRound.advancementConfig?.threshold,
          }}
        />
      )}

      {advanceFromRound && (() => {
        const idx = visibleRounds.findIndex((r) => r.id === advanceFromRound.id)
        const next = visibleRounds[idx + 1]
        if (!next) return null
        return (
          <AdvanceFinalistsDialog
            hackathonId={hackathonId}
            fromRound={{ id: advanceFromRound.id, name: advanceFromRound.name }}
            toRound={{ id: next.id, name: next.name }}
            topN={advanceFromRound.advancementConfig?.topN ?? 10}
            open={!!advanceFromRound}
            onOpenChange={(open) => {
              if (!open) setAdvanceFromRound(null)
            }}
          />
        )
      })()}

      <AlertDialog
        open={!!deleteRound}
        onOpenChange={(open) => {
          if (!open) setDeleteRound(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteRound?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRound && deleteRound.prizeCount > 0
                ? `This round has ${deleteRound.prizeCount} prize${deleteRound.prizeCount !== 1 ? "s" : ""}. Those prizes will stay in the hackathon but will no longer be tied to a round. Screening prizes will be deleted.`
                : "This round has no prizes attached. It will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRound && handleDeleteRound(deleteRound)}
            >
              Delete round
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function TemplateChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  )
}

function RoundStatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return <Badge>Active</Badge>
  }
  if (status === "complete" || status === "advanced") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="size-3" />
        {status === "advanced" ? "Advanced" : "Complete"}
      </Badge>
    )
  }
  return <Badge variant="outline">Planned</Badge>
}

function describeAdvancement(
  advancement: RoundData["advancement"],
  topN: number | undefined,
  threshold: number | undefined
): string {
  if (advancement === "top_n") {
    return `Advance top ${topN ?? "N"} by score`
  }
  if (advancement === "threshold") {
    return `Advance submissions scoring \u2265 ${threshold ?? "\u2014"}`
  }
  return "Manual advancement"
}
