"use client"

import { useState, useImperativeHandle, forwardRef } from "react"
import { useRouter } from "next/navigation"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import { AlertTriangle, Loader2 } from "lucide-react"
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
import { useActionItems } from "./action-items-context"
import { isCompleted } from "@/lib/utils/organizer-actions"
import {
  buildStatusTransitionBody,
  getTransitionConfirmation,
  isStageKey,
  type StageKey,
} from "@/lib/utils/lifecycle-stages"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

export type TransitionConfirmDialogHandle = {
  openTransitionDialog: (targetStatus: string) => void
}

type Props = {
  hackathonId: string
  status: HackathonStatus
  endsAt: string | null
  judgingSetupIssues: string[]
  onTransitioned?: () => void
}

export const TransitionConfirmDialog = forwardRef<TransitionConfirmDialogHandle, Props>(
  function TransitionConfirmDialog({ hackathonId, status, endsAt, judgingSetupIssues, onTransitioned }, ref) {
    const router = useRouter()
    const { activeItems, setOptimisticStage } = useActionItems()
    const [pendingTarget, setPendingTarget] = useState<StageKey | null>(null)
    const [updating, setUpdating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const skippedItems = pendingTarget
      ? activeItems.filter((i) => i.close.kind !== "transition" && !isCompleted(i))
      : []

    useImperativeHandle(ref, () => ({
      openTransitionDialog(targetStatus: string) {
        if (!isStageKey(targetStatus)) return
        setError(null)
        setSuccessMessage(null)
        setPendingTarget(targetStatus)
      },
    }))

    function closeDialog() {
      setPendingTarget(null)
      setError(null)
      setSuccessMessage(null)
    }

    async function commitTransition() {
      if (!pendingTarget) return
      setUpdating(true)
      setError(null)
      setOptimisticStage(pendingTarget)

      try {
        if (pendingTarget === "completed") {
          const calcRes = await fetch(
            `/api/dashboard/hackathons/${hackathonId}/results/calculate`,
            { method: "POST" },
          )
          if (calcRes.ok) {
            const publishRes = await fetch(
              `/api/dashboard/hackathons/${hackathonId}/results/publish`,
              { method: "POST" },
            )
            if (publishRes.ok) {
              onTransitioned?.()
              router.refresh()
              closeDialog()
              return
            }
            // Calculate succeeded but publish failed — complete the event but warn
            await fetch(
              `/api/dashboard/hackathons/${hackathonId}/settings`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "completed" }),
              },
            ).then(assertOk)
            onTransitioned?.()
            router.refresh()
            setError("Event completed, but results could not be published automatically. Please publish them from the Judging tab.")
            return
          }
          // Calculate failed — just mark as completed
          await fetch(
            `/api/dashboard/hackathons/${hackathonId}/settings`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "completed" }),
            },
          ).then(assertOk)
          onTransitioned?.()
          router.refresh()
          closeDialog()
          return
        }

        // Reverting from completed — unpublish results first
        if (status === "completed" || status === "archived") {
          await fetch(
            `/api/dashboard/hackathons/${hackathonId}/results/unpublish`,
            { method: "POST" },
          )
        }

        const body = buildStatusTransitionBody(pendingTarget, endsAt)

        const result = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/settings`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        ).then(assertOkJson<{ notificationDispatch?: "queued" }>)
        onTransitioned?.()
        router.refresh()
        if (result.notificationDispatch === "queued") {
          setSuccessMessage("Your event is live. Any saved team and judge emails are sending now.")
        } else {
          closeDialog()
        }
      } catch (err) {
        setOptimisticStage(null)
        setError(err instanceof Error ? err.message : "Something went wrong")
      } finally {
        setUpdating(false)
      }
    }

    const confirmation = pendingTarget ? getTransitionConfirmation(status, pendingTarget) : null

    return (
      <AlertDialog
        open={!!pendingTarget}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {skippedItems.length > 0 && (
            <div className="flex items-start gap-3 rounded-md border border-muted p-3">
              <AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">Before you proceed</p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {skippedItems.map((i) => (
                    <li key={i.id}>{i.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {successMessage && (
            <div className="rounded-md border p-3">
              <p className="text-sm">{successMessage}</p>
            </div>
          )}
          {pendingTarget === "judging" && judgingSetupIssues.length > 0 && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <div className="text-sm text-destructive">
                <p className="font-medium">Finish scoring setup first</p>
                <ul className="mt-1 list-disc pl-4 text-destructive/80">
                  {judgingSetupIssues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            {successMessage ? (
              <AlertDialogAction onClick={closeDialog}>Close</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={updating} onClick={closeDialog}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); commitTransition() }}
                  disabled={updating || (pendingTarget === "judging" && judgingSetupIssues.length > 0)}
                >
                  {updating && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                  Confirm
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  },
)
