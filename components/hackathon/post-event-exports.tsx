"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Loader2, Download, AlertCircle, CheckCircle2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { useOptimisticList } from "@/hooks/use-optimistic-list"
import { assertOkJson } from "@/lib/utils/fetch"

export type ExportListItem = {
  id: string
  status: "pending" | "processing" | "ready" | "failed" | "expired"
  submissionCount: number | null
  fileSizeBytes: number | null
  createdAt: string
  readyAt: string | null
  expiresAt: string | null
  errorMessage: string | null
}

type ExportFilters = {
  winnersOnly: boolean
  includeDrafts: boolean
  includeJudgeNotes: boolean
}

const DEFAULT_FILTERS: ExportFilters = {
  winnersOnly: false,
  includeDrafts: false,
  includeJudgeNotes: true,
}

const MAX_VISIBLE = 3

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatExpires(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function StatusBadge({ status }: { status: ExportListItem["status"] }) {
  if (status === "ready") {
    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle2 className="size-3" />
        Ready
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="size-3" />
        Failed
      </Badge>
    )
  }
  if (status === "expired") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        Expired
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="size-3 animate-spin" />
      {status === "processing" ? "Packaging" : "Queued"}
    </Badge>
  )
}

export function PostEventExports({
  hackathonId,
  initialExports,
}: {
  hackathonId: string
  initialExports: ExportListItem[]
}) {
  const [filters, setFilters] = useState<ExportFilters>(DEFAULT_FILTERS)
  const [showAll, setShowAll] = useState(false)
  const [optimisticId, setOptimisticId] = useState<string | null>(null)

  const list = useOptimisticList<ExportListItem>({
    items: initialExports,
    getId: (e) => e.id,
  })
  const exports = list.visibleItems
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const hasActiveExport = exports.some(
    (e) => e.status === "pending" || e.status === "processing"
  )

  const { execute: requestExport, isPending, error, clearError } = useOptimisticMutation<
    ExportFilters,
    { exportId: string }
  >({
    fn: async (input) => {
      return fetch(`/api/dashboard/hackathons/${hackathonId}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }).then(assertOkJson<{ exportId: string }>)
    },
    onOptimistic: () => {
      const tempId = `pending-${Date.now()}`
      setOptimisticId(tempId)
      list.addPendingItem({
        id: tempId,
        status: "pending",
        submissionCount: null,
        fileSizeBytes: null,
        createdAt: new Date().toISOString(),
        readyAt: null,
        expiresAt: null,
        errorMessage: null,
      })
    },
    onSuccess: () => {
      if (optimisticId) {
        list.removePendingItem(optimisticId)
        setOptimisticId(null)
      }
    },
    onRevert: () => {
      if (optimisticId) {
        list.removePendingItem(optimisticId)
        setOptimisticId(null)
      }
    },
    refreshOnSuccess: true,
  })

  const visible = showAll ? exports : exports.slice(0, MAX_VISIBLE)
  const hiddenCount = Math.max(0, exports.length - MAX_VISIBLE)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export submissions</CardTitle>
        <CardDescription>
          Download a ZIP with every project, judge score, and screenshot.
          We&rsquo;ll email you when it&rsquo;s ready (usually a few minutes).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-medium">What to include</Label>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={filters.includeJudgeNotes}
                onCheckedChange={(v) =>
                  setFilters((f) => ({ ...f, includeJudgeNotes: v === true }))
                }
                className="mt-0.5"
              />
              <span>
                Judge notes
                <span className="block text-xs text-muted-foreground">
                  Comments judges left on each project.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={filters.winnersOnly}
                onCheckedChange={(v) =>
                  setFilters((f) => ({ ...f, winnersOnly: v === true }))
                }
                className="mt-0.5"
              />
              <span>
                Winners only
                <span className="block text-xs text-muted-foreground">
                  Skip everyone who didn&rsquo;t win a prize.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={filters.includeDrafts}
                onCheckedChange={(v) =>
                  setFilters((f) => ({ ...f, includeDrafts: v === true }))
                }
                className="mt-0.5"
              />
              <span>
                Unfinished drafts
                <span className="block text-xs text-muted-foreground">
                  Include teams that started a submission but never hit submit.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            onClick={() => requestExport(filters)}
            disabled={isPending || hasActiveExport}
          >
            {(isPending || hasActiveExport) && (
              <Loader2 className="mr-1 size-4 animate-spin" />
            )}
            {hasActiveExport ? "Already packaging…" : "Email me the export"}
          </Button>
          {hasActiveExport && (
            <span className="text-xs text-muted-foreground">
              You&rsquo;ll get an email when the current one finishes.
            </span>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">{error}</div>
            <button
              type="button"
              onClick={clearError}
              className="text-xs underline"
            >
              dismiss
            </button>
          </div>
        )}

        {exports.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Recent exports</Label>
            <div className="space-y-2">
              {visible.map((exp) => (
                <ExportRow
                  key={exp.id}
                  exp={exp}
                  hackathonId={hackathonId}
                />
              ))}
            </div>
            {!showAll && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs text-muted-foreground underline"
              >
                Show {hiddenCount} more
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ExportRow({
  exp,
  hackathonId,
}: {
  exp: ExportListItem
  hackathonId: string
}) {
  const detailParts: string[] = []
  if (exp.submissionCount !== null) {
    detailParts.push(
      `${exp.submissionCount} ${
        exp.submissionCount === 1 ? "submission" : "submissions"
      }`
    )
  }
  if (exp.fileSizeBytes !== null) {
    detailParts.push(formatFileSize(exp.fileSizeBytes))
  }

  const relativeTime = formatDistanceToNow(new Date(exp.createdAt), {
    addSuffix: true,
  })

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={exp.status} />
          {detailParts.length > 0 && (
            <span className="text-sm">{detailParts.join(" · ")}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Requested {relativeTime}
          {exp.status === "ready" && exp.expiresAt && (
            <> · download expires {formatExpires(exp.expiresAt)}</>
          )}
        </div>
        {exp.status === "failed" && exp.errorMessage && (
          <div className="text-xs text-destructive">{exp.errorMessage}</div>
        )}
      </div>
      {exp.status === "ready" && !exp.id.startsWith("pending-") && (
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/dashboard/hackathons/${hackathonId}/exports/${exp.id}/download`}
          >
            <Download className="mr-1 size-4" />
            Download
          </a>
        </Button>
      )}
    </div>
  )
}
