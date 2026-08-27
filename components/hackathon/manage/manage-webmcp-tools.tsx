"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import {
  createManageHackathonTools,
  type ManageHackathonWebMcpContext,
} from "@/lib/webmcp/manage-hackathon-tools"
import type {
  ManageWebMcpCommittedChange,
  ManageWebMcpOptimisticChange,
} from "@/lib/webmcp/manage-optimistic-state"
import { WebMcpActionRegistry } from "@/lib/webmcp/action-registry"
import { useActionItems } from "./action-items-context"

type ManageHackathonWebMcpToolsProps = {
  context: ManageHackathonWebMcpContext
}

type ManageHackathonWebMcpActions = {
  optimistic: ManageWebMcpOptimisticChange
  committed: {
    optimistic: ManageWebMcpOptimisticChange
    committed: ManageWebMcpCommittedChange
  }
  reverted: {
    optimistic: ManageWebMcpOptimisticChange
    message: string
  }
  openTransition: string
}

export function ManageHackathonWebMcpTools({
  context,
}: ManageHackathonWebMcpToolsProps) {
  const router = useRouter()
  const {
    triggerTransition,
    hackathonStatus,
    activeItems,
    manageWebMcpView,
    beginManageWebMcpChange,
    commitManageWebMcpChange,
    rollbackManageWebMcpChange,
  } = useActionItems()
  const [notice, setNotice] = useState<{
    title: string
    message: string
    error: boolean
  } | null>(null)
  const registryContext = useMemo<ManageHackathonWebMcpContext>(
    () => ({
      ...context,
      hackathon: {
        ...context.hackathon,
        name: manageWebMcpView.details.name,
        description: manageWebMcpView.details.description,
        status: hackathonStatus,
        startsAt: manageWebMcpView.timeline.startsAt,
        endsAt: manageWebMcpView.timeline.endsAt,
      },
      stats: {
        ...context.stats,
        prizeCount: manageWebMcpView.prizes.length,
      },
      actionItems: activeItems.map((item) => ({
        label: item.label,
        hint: item.hint ?? null,
        severity: item.severity,
      })),
      scheduleItems: manageWebMcpView.scheduleItems.map((item) => ({
        title: item.title,
        description: item.description,
        startsAt: item.starts_at,
        endsAt: item.ends_at,
        location: item.location,
      })),
      challenges: manageWebMcpView.challenges.map((challenge) => ({
        title: challenge.title,
        description: challenge.description,
        resourceCount: challenge.resources.length,
      })),
      prizes: manageWebMcpView.prizes.map((prize) => {
        const existing = context.prizes.find((candidate) => candidate.id === prize.id)
        return {
          id: prize.id,
          name: prize.name,
          description: prize.description,
          value: prize.value,
          judgingStyle: prize.judging_style,
          judgeCount: existing?.judgeCount ?? 0,
          totalAssignments: existing?.totalAssignments ?? 0,
          completedAssignments: existing?.completedAssignments ?? 0,
        }
      }),
    }),
    [activeItems, context, hackathonStatus, manageWebMcpView],
  )
  const registrationStatus = hackathonStatus
  const onOptimistic = useCallback(
    (change: ManageWebMcpOptimisticChange) => {
      beginManageWebMcpChange(change)
      setNotice({
        title: "Your agent is making a change",
        message: change.summary,
        error: false,
      })
      router.push(change.href)
    },
    [beginManageWebMcpChange, router],
  )
  const onCommitted = useCallback(
    ({ committed }: ManageHackathonWebMcpActions["committed"]) => {
      commitManageWebMcpChange(committed)
      setNotice({
        title: "The change was saved",
        message: "Review it below before making another change.",
        error: false,
      })
      router.refresh()
    },
    [commitManageWebMcpChange, router],
  )
  const onReverted = useCallback(
    ({ optimistic, message }: ManageHackathonWebMcpActions["reverted"]) => {
      rollbackManageWebMcpChange(optimistic.mutationId)
      setNotice({ title: "That change wasn't saved", message, error: true })
    },
    [rollbackManageWebMcpChange],
  )
  const onNavigate = useCallback((href: string, section: string) => {
    router.push(href)
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (opened: boolean) => {
        if (settled) return
        settled = true
        observer.disconnect()
        window.clearTimeout(timeout)
        resolve(opened)
      }
      const findVisibleTarget = () => {
        const target = document.querySelector<HTMLElement>(
          `[data-webmcp-section="${section}"]`,
        )
        if (!target || target.closest('[data-state="inactive"]')) return false
        target.scrollIntoView({ behavior: "smooth", block: "start" })
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1
        target.focus({ preventScroll: true })
        finish(true)
        return true
      }
      const observer = new MutationObserver(findVisibleTarget)
      const timeout = window.setTimeout(() => finish(false), 4_000)
      if (findVisibleTarget()) return
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["data-state"],
      })
    })
  }, [router])
  const onOpenTransition = useCallback(
    (status: string) => triggerTransition(status),
    [triggerTransition],
  )
  const [actionRegistry] = useState(
    () =>
      new WebMcpActionRegistry<
        ManageHackathonWebMcpContext,
        ManageHackathonWebMcpActions
      >(registryContext, {
        optimistic: onOptimistic,
        committed: onCommitted,
        reverted: onReverted,
        openTransition: onOpenTransition,
      }),
  )
  useEffect(() => {
    actionRegistry.update(registryContext, {
      optimistic: onOptimistic,
      committed: onCommitted,
      reverted: onReverted,
      openTransition: onOpenTransition,
    })
  }, [
    actionRegistry,
    registryContext,
    onCommitted,
    onNavigate,
    onOpenTransition,
    onOptimistic,
    onReverted,
  ])

  const tools = useMemo(
    () =>
      createManageHackathonTools(
        {
          getContext: () => actionRegistry.getContext(),
          fetcher: fetch,
          onOptimistic: (change) =>
            actionRegistry.dispatch("optimistic", change),
          onCommitted: (optimistic, committed) =>
            actionRegistry.dispatch("committed", { optimistic, committed }),
          onReverted: (optimistic, message) =>
            actionRegistry.dispatch("reverted", { optimistic, message }),
          onNavigate,
          onOpenTransition: (status) =>
            actionRegistry.dispatch("openTransition", status),
        },
        registrationStatus,
      ),
    [actionRegistry, onNavigate, registrationStatus],
  )

  useWebMcpTools(tools)
  if (!notice) return null
  return (
    <Alert variant={notice.error ? "destructive" : "default"}>
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.message}</AlertDescription>
    </Alert>
  )
}
