"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Search, Check } from "lucide-react"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"

type AssignmentRow = {
  submissionId: string
  projectTitle: string
  teamId: string | null
  teamName: string | null
  isAssigned: boolean
  isOwnTeam: boolean
}

interface PickProjectsDialogProps {
  hackathonId: string
  judgeParticipantId: string
  judgeDisplayName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PickProjectsDialog({
  hackathonId,
  judgeParticipantId,
  judgeDisplayName,
  open,
  onOpenChange,
}: PickProjectsDialogProps) {
  const router = useRouter()
  const [rows, setRows] = useState<AssignmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(
      `/api/dashboard/hackathons/${hackathonId}/judging/judges/${judgeParticipantId}/submissions`
    )
      .then(assertOkJson<{ submissions: AssignmentRow[] }>)
      .then((data) => {
        if (cancelled) return
        setRows(data.submissions)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load projects")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, hackathonId, judgeParticipantId])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (hasChanges) {
        router.refresh()
        setHasChanges(false)
      }
      setSearchQuery("")
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  async function toggle(row: AssignmentRow) {
    if (row.isOwnTeam) return
    setError(null)
    setToggling((prev) => new Set(prev).add(row.submissionId))
    const nextAssigned = !row.isAssigned
    setRows((prev) =>
      prev.map((r) =>
        r.submissionId === row.submissionId ? { ...r, isAssigned: nextAssigned } : r
      )
    )
    try {
      const url = `/api/dashboard/hackathons/${hackathonId}/judging/judges/${judgeParticipantId}/submissions/${row.submissionId}`
      await fetch(url, { method: nextAssigned ? "POST" : "DELETE" }).then(assertOk)
      setHasChanges(true)
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.submissionId === row.submissionId ? { ...r, isAssigned: row.isAssigned } : r
        )
      )
      setError(err instanceof Error ? err.message : "Failed to update assignment")
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(row.submissionId)
        return next
      })
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.projectTitle.toLowerCase().includes(q) ||
        (r.teamName ?? "").toLowerCase().includes(q)
    )
  }, [rows, searchQuery])

  const assignedCount = rows.filter((r) => r.isAssigned).length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pick projects for {judgeDisplayName}</DialogTitle>
          <DialogDescription>
            {assignedCount} of {rows.length} projects assigned. Tap a row to add or remove.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects or teams"
              className="pl-9"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No projects submitted yet.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No projects match &ldquo;{searchQuery}&rdquo;.
            </p>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filtered.map((row) => {
                const isLoading = toggling.has(row.submissionId)
                return (
                  <button
                    key={row.submissionId}
                    type="button"
                    onClick={() => toggle(row)}
                    disabled={isLoading || row.isOwnTeam}
                    className="flex items-center gap-3 w-full rounded-lg p-2 text-left hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.projectTitle}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.teamName ?? "No team"}
                        {row.isOwnTeam ? " — judge's own team" : ""}
                      </p>
                    </div>
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                    ) : row.isAssigned ? (
                      <div className="flex items-center justify-center size-5 rounded bg-primary text-primary-foreground shrink-0">
                        <Check className="size-3" />
                      </div>
                    ) : (
                      <div className="size-5 rounded border shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
