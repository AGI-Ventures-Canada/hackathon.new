"use client"

import { useState, useEffect } from "react"
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

export type RoundsPresetKind = "single" | "shortlist" | "threshold" | "finalists_pick"

interface RoundsPresetDialogProps {
  hackathonId: string
  preset: RoundsPresetKind | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const COPY: Record<RoundsPresetKind, {
  title: string
  description: string
  round1Default: string
  round2Default?: string
  needsTopN?: boolean
  needsThreshold?: boolean
  needsPrizeName?: boolean
  needsMaxPicks?: boolean
  prizeNameDefault?: string
  helperText?: string
}> = {
  single: {
    title: "One round",
    description: "Judges score every project once. You pick the winners from the scores.",
    round1Default: "Judging",
  },
  shortlist: {
    title: "Shortlist + Finals",
    description: "Narrow everyone down to a shortlist, then pick winners from the shortlist.",
    round1Default: "Shortlist",
    round2Default: "Finals",
    needsTopN: true,
    helperText: "We'll add a hidden helper prize so judges have something to score in round 1.",
  },
  threshold: {
    title: "Score gate + Finals",
    description: "Everyone who hits the score or higher moves on to a finals round.",
    round1Default: "First round",
    round2Default: "Finals",
    needsThreshold: true,
    helperText: "We'll add a hidden helper prize so judges have something to score in round 1.",
  },
  finalists_pick: {
    title: "Finalists — judges pick",
    description: "You pick who makes finals. Judges each pick their favorite. Most picks wins.",
    round1Default: "Finals",
    needsPrizeName: true,
    needsMaxPicks: true,
    prizeNameDefault: "Grand Prize",
    helperText: "Example: 6 finalists, 3 judges, each judge picks 1 favorite. The project with the most picks wins. No scoring.",
  },
}

export function RoundsPresetDialog({
  hackathonId,
  preset,
  open,
  onOpenChange,
  onSuccess,
}: RoundsPresetDialogProps) {
  const router = useRouter()
  const [round1Name, setRound1Name] = useState("")
  const [round2Name, setRound2Name] = useState("")
  const [advanceTopN, setAdvanceTopN] = useState(10)
  const [threshold, setThreshold] = useState(3)
  const [prizeName, setPrizeName] = useState("")
  const [maxPicks, setMaxPicks] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!preset) return
    const copy = COPY[preset]
    setRound1Name(copy.round1Default)
    setRound2Name(copy.round2Default ?? "")
    setAdvanceTopN(10)
    setThreshold(3)
    setPrizeName(copy.prizeNameDefault ?? "")
    setMaxPicks(1)
    setError(null)
  }, [preset])

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!preset) return
    const copy = COPY[preset]

    if (copy.needsTopN && advanceTopN < 1) {
      setError("Advance at least 1 project")
      return
    }
    if (copy.needsMaxPicks && maxPicks < 1) {
      setError("Each judge must pick at least 1")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/rounds/preset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preset,
            round1Name: round1Name.trim() || copy.round1Default,
            round2Name: copy.round2Default ? (round2Name.trim() || copy.round2Default) : undefined,
            advanceTopN: copy.needsTopN ? advanceTopN : undefined,
            threshold: copy.needsThreshold ? threshold : undefined,
            seedScreeningPrize: true,
            prizeName: copy.needsPrizeName ? (prizeName.trim() || copy.prizeNameDefault) : undefined,
            maxPicks: copy.needsMaxPicks ? maxPicks : undefined,
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

  if (!preset) return null
  const copy = COPY[preset]
  const hasRound2 = !!copy.round2Default

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          This is a starter. You can rename, re-order, or delete rounds after.
        </p>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} autoComplete="off" className="space-y-5">
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">
              Round 1{hasRound2 ? " — narrows the pool" : ""}
            </p>
            <div className="space-y-2">
              <Label htmlFor="preset-r1-name">Name</Label>
              <Input
                id="preset-r1-name"
                value={round1Name}
                onChange={(e) => setRound1Name(e.target.value)}
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            {copy.needsTopN && (
              <div className="space-y-2">
                <Label htmlFor="preset-top-n">How many move on?</Label>
                <Input
                  id="preset-top-n"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={advanceTopN}
                  onChange={(e) =>
                    setAdvanceTopN(Math.max(1, Number(e.target.value) || 1))
                  }
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
                <p className="text-xs text-muted-foreground">
                  The top {advanceTopN} by score move on to the next round.
                </p>
              </div>
            )}
            {copy.needsThreshold && (
              <div className="space-y-2">
                <Label htmlFor="preset-threshold">Score to beat</Label>
                <Input
                  id="preset-threshold"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
                <p className="text-xs text-muted-foreground">
                  Everyone scoring {threshold} or higher moves on.
                </p>
              </div>
            )}
            {copy.needsPrizeName && (
              <div className="space-y-2">
                <Label htmlFor="preset-prize-name">Prize name</Label>
                <Input
                  id="preset-prize-name"
                  value={prizeName}
                  onChange={(e) => setPrizeName(e.target.value)}
                  placeholder={copy.prizeNameDefault}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
            )}
            {copy.needsMaxPicks && (
              <div className="space-y-2">
                <Label htmlFor="preset-max-picks">How many can each judge pick?</Label>
                <Input
                  id="preset-max-picks"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={maxPicks}
                  onChange={(e) => setMaxPicks(Math.max(1, Number(e.target.value) || 1))}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
                <p className="text-xs text-muted-foreground">
                  For example, 1 means each judge picks their single favorite.
                </p>
              </div>
            )}
          </div>

          {hasRound2 && (
            <>
              <div className="flex justify-center">
                <ArrowDown className="size-4 text-muted-foreground" />
              </div>
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">Round 2 — picks winners</p>
                <div className="space-y-2">
                  <Label htmlFor="preset-r2-name">Name</Label>
                  <Input
                    id="preset-r2-name"
                    value={round2Name}
                    onChange={(e) => setRound2Name(e.target.value)}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
              </div>
            </>
          )}

          {copy.helperText && (
            <p className="text-xs text-muted-foreground">{copy.helperText}</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create round{hasRound2 ? "s" : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
