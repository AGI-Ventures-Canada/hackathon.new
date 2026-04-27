"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"
import {
  LIFECYCLE_STAGES as phases,
  TRANSITION_CONFIRMATIONS as confirmations,
  resolveStageIndex as resolvePhaseIndex,
  buildStatusTransitionBody,
  type StageKey as PhaseKey,
} from "@/lib/utils/lifecycle-stages"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import type { DevStatusDetail } from "@/components/dev-tool/events"

interface LifecycleStepperProps {
  hackathonId: string
  hackathonSlug: string
  status: HackathonStatus
  submissionCount?: number
  judgingProgress?: {
    totalAssignments: number
    completedAssignments: number
  }
  judgingSetupStatus?: {
    judgeCount: number
    hasUnassignedSubmissions: boolean
  }
  startsAt?: string | null
  endsAt?: string | null
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
  description?: string | null
  bannerUrl?: string | null
  locationType?: "in_person" | "virtual" | "hybrid" | null
  locationName?: string | null
  locationUrl?: string | null
  sponsorCount?: number
  prizeCount?: number
  judgeDisplayCount?: number
  criteriaCount?: number
  phase?: HackathonPhase | null
}

type HoverAction = {
  title: string
  description: string
  buttonText: string
  onClick: () => void
}

export function LifecycleStepper({
  hackathonId,
  hackathonSlug: _hackathonSlug,
  status,
  submissionCount = 0,
  judgingProgress,
  judgingSetupStatus: _judgingSetupStatus,
  startsAt,
  endsAt,
  registrationOpensAt: _registrationOpensAt,
  registrationClosesAt: _registrationClosesAt,
  description,
  bannerUrl,
  locationType,
  locationName,
  locationUrl,
  sponsorCount = 0,
  prizeCount = 0,
  judgeDisplayCount = 0,
  criteriaCount: _criteriaCount = 0,
  phase,
}: LifecycleStepperProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const actionItems = useActionItemsOptional()
  const [currentStatus, setCurrentStatus] = useState(status)
  const [updating, setUpdating] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<PhaseKey | null>(null)
  const devOverrideUntil = useRef(0)

  useEffect(() => {
    if (Date.now() < devOverrideUntil.current) return
    setCurrentStatus(status)
  }, [status])

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DevStatusDetail>).detail
      if (detail?.status) {
        devOverrideUntil.current = Date.now() + 30_000
        setCurrentStatus(detail.status as HackathonStatus)
      } else {
        router.refresh()
      }
    }
    document.addEventListener("dev-status-changed", handler)
    return () => document.removeEventListener("dev-status-changed", handler)
  }, [router])

  const currentIndex = resolvePhaseIndex(currentStatus)

  async function commitStatusChange(newStatus: PhaseKey) {
    setUpdating(true)
    actionItems?.setOptimisticStage(newStatus)
    try {
      if (newStatus === "completed") {
        const calcRes = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/results/calculate`,
          {
            method: "POST",
          },
        )
        if (calcRes.ok) {
          const publishRes = await fetch(
            `/api/dashboard/hackathons/${hackathonId}/results/publish`,
            {
              method: "POST",
            },
          )
          if (publishRes.ok) {
            setCurrentStatus(newStatus)
            router.refresh()
            return
          }
        }
        const res = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/settings`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
          },
        )
        if (!res.ok) throw new Error("Failed to update status")
        setCurrentStatus(newStatus)
        router.refresh()
        return
      }

      if (
        phases[currentIndex]?.key === "completed" &&
        (newStatus === "judging" ||
          newStatus === "active" ||
          newStatus === "published" ||
          newStatus === "draft")
      ) {
        await fetch(
          `/api/dashboard/hackathons/${hackathonId}/results/unpublish`,
          {
            method: "POST",
          },
        )
      }

      const body = buildStatusTransitionBody(newStatus, endsAt)
      if (newStatus === "active" && endsAt && new Date(endsAt) <= new Date()) {
        body.endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }

      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) throw new Error("Failed to update status")
      setCurrentStatus(newStatus)
      router.refresh()
    } catch {
      actionItems?.setOptimisticStage(null)
    } finally {
      setUpdating(false)
      setPendingTarget(null)
    }
  }

  function requestTransition(target: PhaseKey) {
    if (target === phases[currentIndex]?.key || updating) return
    setPendingTarget(target)
  }

  function getNodeAction(phaseIndex: number): HoverAction | null {
    if (updating) return null
    const distance = phaseIndex - currentIndex
    if (distance === 0) return null

    const phaseKey = phases[phaseIndex].key
    const currentKey = phases[currentIndex].key

    if (distance === 1) {
      if (currentKey === "draft" && phaseKey === "published")
        return {
          title: "Publish",
          description: "Make the event visible and open for registration",
          buttonText: "Publish",
          onClick: () => requestTransition("published"),
        }
      if (currentKey === "published" && phaseKey === "active")
        return {
          title: "Start Hackathon",
          description: "Start the hackathon and let participants begin building",
          buttonText: "Start Hackathon",
          onClick: () => requestTransition("active"),
        }
      if (currentKey === "active" && phaseKey === "judging") {
        return {
          title: "Start Judging",
          description: "Close submissions and begin judging",
          buttonText: "Start Judging",
          onClick: () => requestTransition("judging"),
        }
      }
      if (currentKey === "judging" && phaseKey === "completed")
        return {
          title: "End Event",
          description: "End the event and publish results",
          buttonText: "End Event",
          onClick: () => requestTransition("completed"),
        }
    }

    if (distance < 0) {
      if (phaseKey === "draft")
        return {
          title: "Revert to Draft",
          description:
            "Take the hackathon offline and hide it from the browse page",
          buttonText: "Revert to Draft",
          onClick: () => requestTransition("draft"),
        }
      if (phaseKey === "published")
        return {
          title: "Revert to Published",
          description: "Revert to published with registration open",
          buttonText: "Revert",
          onClick: () => requestTransition("published"),
        }
      if (phaseKey === "active")
        return {
          title: "Reopen Submissions",
          description: "Reopen the hackathon for new submissions",
          buttonText: "Reopen",
          onClick: () => requestTransition("active"),
        }
      if (phaseKey === "judging")
        return {
          title: "Reopen Judging",
          description: "Revert to the judging phase",
          buttonText: "Reopen",
          onClick: () => requestTransition("judging"),
        }
    }

    return null
  }

  const confirmation = pendingTarget
    ? (confirmations[`${phases[currentIndex].key}→${pendingTarget}`] ?? {
        title: `Switch to ${pendingTarget}?`,
        description: `This will change the hackathon status to "${pendingTarget}".`,
      })
    : null

  const missingDates = [
    !startsAt && "Event starts",
    !endsAt && "Event ends",
  ].filter(Boolean) as string[]
  const hasAllDates = missingDates.length === 0

  const goLiveWarnings = [
    !description && "No description",
    !bannerUrl && "No banner image",
    !locationType && "Location not set",
    (locationType === "in_person" || locationType === "hybrid") && !locationName && "Venue details missing",
    (locationType === "virtual" || locationType === "hybrid") && !locationUrl && "Virtual link missing",
    sponsorCount === 0 && "No sponsors",
    judgeDisplayCount === 0 && "No judges added",
    prizeCount === 0 && "No prizes defined",
  ].filter(Boolean) as string[]

  return (
    <>
      <div className="rounded-lg border bg-card">
        <div className="px-3 py-3 sm:px-5 sm:py-4">
          {phase && (
            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              <span>
                {phase === "build" && "Building"}
                {phase === "submission_open" && "Submissions Open"}
                {phase === "preliminaries" && "Preliminary Judging"}
                {phase === "finals" && "Grand Finals"}
                {phase === "results_pending" && "Results Pending"}
              </span>
            </div>
          )}
          <div className="flex items-start">
            {phases.map((phase, index) => {
              const isCompleted = index < currentIndex
              const isCurrent = index === currentIndex
              const isFuture = index > currentIndex
              const Icon = phase.icon
              const nodeAction = getNodeAction(index)
              const isActionable = !!nodeAction
              const isFutureDistant = isFuture && !isActionable

              const nodeElement = (
                <button
                  type="button"
                  className={cn(
                    "group/phase flex flex-col items-center gap-1.5 rounded-md px-2 pt-1 pb-1.5 transition-colors shrink-0",
                    isActionable && "hover:bg-muted cursor-pointer",
                    isCurrent && "cursor-default",
                    isFutureDistant && "cursor-default opacity-50",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                      isCompleted && "bg-muted-foreground text-background",
                      isCurrent && "bg-primary text-primary-foreground",
                      isFuture && "border-2 border-muted-foreground/30",
                    )}
                  >
                    {isCompleted ? (
                      phase.key === "draft" ? (
                        <phase.icon className="size-3.5" />
                      ) : (
                        <Check className="size-3.5" strokeWidth={2.5} />
                      )
                    ) : (
                      <Icon className="size-3.5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "hidden sm:block text-xs font-medium whitespace-nowrap",
                      isCompleted && "text-muted-foreground",
                      isCurrent && "text-foreground",
                      isFuture && "text-muted-foreground",
                    )}
                  >
                    {phase.label}
                  </span>
                </button>
              )

              const actionContent = nodeAction && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{nodeAction.title}</p>
                  <p className="text-muted-foreground">
                    {nodeAction.description}
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={nodeAction.onClick}
                  >
                    {nodeAction.buttonText}
                  </Button>
                </div>
              )

              let wrappedNode
              if (nodeAction) {
                if (isMobile) {
                  wrappedNode = (
                    <Popover>
                      <PopoverTrigger asChild>{nodeElement}</PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="center"
                        className="w-auto max-w-64"
                      >
                        {actionContent}
                      </PopoverContent>
                    </Popover>
                  )
                } else {
                  wrappedNode = (
                    <HoverCard openDelay={200}>
                      <HoverCardTrigger asChild>{nodeElement}</HoverCardTrigger>
                      <HoverCardContent
                        side="top"
                        align="center"
                        className="w-auto max-w-64"
                      >
                        {actionContent}
                      </HoverCardContent>
                    </HoverCard>
                  )
                }
              } else if (isFutureDistant) {
                wrappedNode = (
                  <Tooltip>
                    <TooltipTrigger asChild>{nodeElement}</TooltipTrigger>
                    <TooltipContent side="top">{phase.label}</TooltipContent>
                  </Tooltip>
                )
              } else {
                wrappedNode = nodeElement
              }

              return (
                <div
                  key={phase.key}
                  className={cn(
                    "flex items-start min-w-0",
                    index < phases.length - 1 ? "flex-1" : "flex-none",
                  )}
                >
                  {wrappedNode}

                  {index < phases.length - 1 && (
                    <div className="flex-1 flex items-start self-stretch pt-1">
                      <div
                        className={cn(
                          "h-px flex-1 mx-1 mt-4",
                          index < currentIndex
                            ? "bg-muted-foreground"
                            : "bg-border",
                        )}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <AlertDialog
        open={!!pendingTarget}
        onOpenChange={(open) => !open && setPendingTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingTarget === "published" && !hasAllDates && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <div className="text-sm text-destructive">
                <p className="font-medium">Timeline dates required</p>
                <p className="text-destructive/80">
                  Set the following dates before publishing:{" "}
                  {missingDates.join(", ")}.
                </p>
              </div>
            </div>
          )}
          {pendingTarget === "published" && goLiveWarnings.length > 0 && (
            <div className="flex items-start gap-3 rounded-md border border-muted p-3">
              <AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">Before you go live</p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {goLiveWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {pendingTarget === "judging" && submissionCount === 0 && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <div className="text-sm text-destructive">
                <p className="font-medium">No submissions yet</p>
                <p className="text-destructive/80">
                  There are currently no submitted projects. Starting judging
                  now means there will be nothing to judge.
                </p>
              </div>
            </div>
          )}
          {pendingTarget === "completed" &&
            judgingProgress &&
            judgingProgress.totalAssignments > 0 &&
            judgingProgress.completedAssignments <
              judgingProgress.totalAssignments && (
              <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <AlertTriangle className="size-5 shrink-0 text-destructive" />
                <div className="text-sm text-destructive">
                  <p className="font-medium">Judging incomplete</p>
                  <p className="text-destructive/80">
                    {judgingProgress.completedAssignments} of{" "}
                    {judgingProgress.totalAssignments} assignments have been
                    scored. All submissions must be judged before completing the
                    event.
                  </p>
                </div>
              </div>
            )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingTarget && commitStatusChange(pendingTarget)}
              disabled={
                updating ||
                (pendingTarget === "published" && !hasAllDates) ||
                (pendingTarget === "completed" &&
                  judgingProgress &&
                  judgingProgress.totalAssignments > 0 &&
                  judgingProgress.completedAssignments <
                    judgingProgress.totalAssignments)
              }
            >
              {updating && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
