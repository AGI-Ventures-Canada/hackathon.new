"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { assertOk } from "@/lib/utils/fetch"
import { Webhook, MoreHorizontal, Trash2, AlertTriangle } from "lucide-react"
import type { Webhook as WebhookType } from "@/lib/db/hackathon-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface WebhookListProps {
  webhooks: WebhookType[]
}

const eventLabels: Record<string, string> = {
  "hackathon.created": "Hackathon Created",
  "hackathon.updated": "Hackathon Updated",
  "participant.registered": "Participant Registered",
  "submission.created": "Submission Created",
  "submission.submitted": "Submission Submitted",
  "submission.updated": "Submission Updated",
  "results.published": "Results Published",
}

export function WebhookList({ webhooks }: WebhookListProps) {
  const router = useRouter()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const handleDelete = async () => {
    if (!deleteId) return
    const id = deleteId
    setDeleteId(null)
    setHiddenIds((prev) => new Set(prev).add(id))
    try {
      await fetch(`/api/dashboard/webhooks/${id}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch {
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const visibleWebhooks = webhooks.filter((w) => !hiddenIds.has(w.id))

  if (visibleWebhooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Webhook className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No webhooks yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Create a webhook to receive notifications when hackathon events occur
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL</TableHead>
            <TableHead>Events</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Triggered</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleWebhooks.map((webhook) => (
            <TableRow key={webhook.id}>
              <TableCell>
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded truncate max-w-xs block">
                  {webhook.url}
                </code>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {webhook.events.map((event) => (
                    <Badge key={event} variant="outline" className="text-xs">
                      {eventLabels[event] ?? event}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {webhook.is_active ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {(webhook.failure_count ?? 0) > 0 && (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle className="size-4 text-amber-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {webhook.failure_count} failed deliveries
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {webhook.last_triggered_at
                  ? (() => {
                      const d = new Date(webhook.last_triggered_at)
                      const year = d.getFullYear()
                      const month = String(d.getMonth() + 1).padStart(2, "0")
                      const day = String(d.getDate()).padStart(2, "0")
                      const hours = String(d.getHours()).padStart(2, "0")
                      const minutes = String(d.getMinutes()).padStart(2, "0")
                      return `${year}-${month}-${day} ${hours}:${minutes}`
                    })()
                  : "Never"}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setDeleteId(webhook.id)}
                    >
                      <Trash2 className="size-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this webhook? You will stop
              receiving notifications for the configured events.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}

              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
