"use client"

import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, startTransition } from "react"
import { useRouter } from "next/navigation"
import { getOrganizerActionItems, type ActionItem, type ActionSeverity } from "@/lib/utils/organizer-actions"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"
import { useOrganizerPoll } from "@/hooks/use-organizer-poll"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChallengeDialogs, type ChallengeDialogsHandle } from "./challenge-dialogs"
import { TransitionConfirmDialog, type TransitionConfirmDialogHandle } from "./transition-confirm-dialog"
import { SubmissionDeadlineDialog, type SubmissionDeadlineDialogHandle } from "./submission-deadline-dialog"
import { ScheduleEditor } from "@/components/hackathon/schedule-editor"
import type { ScheduleItem } from "@/lib/services/schedule-items"

const SEVERITY_ORDER: ActionSeverity[] = ["urgent", "warning", "info"]

interface ActionItemsContextValue {
  actionItems: ActionItem[]
  completedIds: Set<string>
  dismissedIds: Set<string>
  activeItems: ActionItem[]
  completedItems: ActionItem[]
  remainingCount: number
  totalCount: number
  toggleComplete: (id: string) => void
  dismissItem: (id: string) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  handleActionClick: (item: ActionItem) => void
  triggerTransition: (targetStatus: string) => void
  addCustomItem: (label: string, severity?: ActionSeverity) => void
  removeCustomItem: (id: string) => void
  customItems: ActionItem[]
  hackathonStatus: HackathonStatus
  hackathonPhase: HackathonPhase | null
  slug: string
}

const ActionItemsContext = createContext<ActionItemsContextValue | null>(null)

export function useActionItems() {
  const ctx = useContext(ActionItemsContext)
  if (!ctx) throw new Error("useActionItems must be used within ActionItemsProvider")
  return ctx
}

export function useActionItemsOptional() {
  return useContext(ActionItemsContext)
}

export function buildActionHref(slug: string, item: ActionItem): string | null {
  if (item.action) return null
  if (!item.tab) return null
  const params = new URLSearchParams({ tab: item.tab })
  if (item.subtab && item.subtabKey) params.set(item.subtabKey, item.subtab)
  return `/e/${slug}/manage?${params.toString()}`
}

type ProviderProps = {
  actionItems: ActionItem[]
  hackathonId: string
  slug: string
  status: HackathonStatus
  phase: HackathonPhase | null
  challengeExists: boolean
  challengeReleasedAt: string | null
  scheduleItems: ScheduleItem[]
  startsAt: string | null
  endsAt: string | null
  children: React.ReactNode
}

export function ActionItemsProvider({
  actionItems: serverActionItems,
  hackathonId,
  slug,
  status: serverStatus,
  phase: serverPhase,
  challengeExists,
  challengeReleasedAt,
  scheduleItems,
  startsAt,
  endsAt: serverEndsAt,
  children,
}: ProviderProps) {
  const router = useRouter()
  const challengeRef = useRef<ChallengeDialogsHandle>(null)
  const transitionRef = useRef<TransitionConfirmDialogHandle>(null)
  const submissionDeadlineRef = useRef<SubmissionDeadlineDialogHandle>(null)
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false)
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false)

  const { data: pollData, refresh: refreshPoll } = useOrganizerPoll(hackathonId)
  const actionItems = pollData ? getOrganizerActionItems(pollData) : serverActionItems
  const liveChallengeExists = pollData ? pollData.challengeExists : challengeExists
  const liveEndsAt = pollData ? pollData.endsAt : serverEndsAt
  const liveStatus = (pollData ? pollData.status : serverStatus) as HackathonStatus
  const livePhase = (pollData ? pollData.phase : serverPhase) as HackathonPhase | null

  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      const stored = localStorage.getItem(`completed-actions-${hackathonId}`)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      const stored = localStorage.getItem(`dismissed-actions-${hackathonId}`)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const [customItems, setCustomItems] = useState<ActionItem[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const stored = localStorage.getItem(`custom-actions-${hackathonId}`)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const [completedSnapshots, setCompletedSnapshots] = useState<Record<string, ActionItem>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const stored = localStorage.getItem(`completed-snapshots-${hackathonId}`)
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })
  const snapshotsRef = useRef(completedSnapshots)
  snapshotsRef.current = completedSnapshots

  const [panelOpen, setPanelOpenState] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(`action-panel-open-${hackathonId}`)
    if (stored !== null) startTransition(() => setPanelOpenState(stored === "true"))
  }, [hackathonId])

  const allItems = useMemo(() => [...actionItems, ...customItems], [actionItems, customItems])
  const actionItemIds = useMemo(() => new Set(allItems.map((i) => i.id)), [allItems])

  const effectiveCompletedIds = useMemo(() => {
    const filtered = new Set<string>()
    for (const id of completedIds) {
      if (actionItemIds.has(id) || snapshotsRef.current[id]) filtered.add(id)
    }
    return filtered.size !== completedIds.size ? filtered : completedIds
  }, [completedIds, actionItemIds])

  const effectiveDismissedIds = useMemo(() => {
    const filtered = new Set<string>()
    for (const id of dismissedIds) {
      if (actionItemIds.has(id)) filtered.add(id)
    }
    return filtered.size !== dismissedIds.size ? filtered : dismissedIds
  }, [dismissedIds, actionItemIds])

  useEffect(() => {
    if (effectiveDismissedIds !== dismissedIds) {
      localStorage.setItem(`dismissed-actions-${hackathonId}`, JSON.stringify([...effectiveDismissedIds]))
    }
  }, [effectiveDismissedIds, dismissedIds, hackathonId])

  const toggleComplete = useCallback((id: string) => {
    const wasCompleted = completedIds.has(id)
    setCompletedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      localStorage.setItem(`completed-actions-${hackathonId}`, JSON.stringify([...next]))
      return next
    })
    setCompletedSnapshots((prev) => {
      const next = { ...prev }
      if (wasCompleted) {
        delete next[id]
      } else {
        const item = allItems.find((i) => i.id === id)
        if (item) next[id] = item
      }
      localStorage.setItem(`completed-snapshots-${hackathonId}`, JSON.stringify(next))
      return next
    })
  }, [hackathonId, allItems, completedIds])

  const dismissItem = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(`dismissed-actions-${hackathonId}`, JSON.stringify([...next]))
      return next
    })
  }, [hackathonId])

  const addCustomItem = useCallback((label: string, severity: ActionSeverity = "info") => {
    const item: ActionItem = {
      id: `custom-${Date.now()}`,
      label,
      severity,
    }
    setCustomItems((prev) => {
      const next = [...prev, item]
      localStorage.setItem(`custom-actions-${hackathonId}`, JSON.stringify(next))
      return next
    })
  }, [hackathonId])

  const removeCustomItem = useCallback((id: string) => {
    setCustomItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      localStorage.setItem(`custom-actions-${hackathonId}`, JSON.stringify(next))
      return next
    })
    setCompletedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      localStorage.setItem(`completed-actions-${hackathonId}`, JSON.stringify([...next]))
      return next
    })
    setCompletedSnapshots((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      localStorage.setItem(`completed-snapshots-${hackathonId}`, JSON.stringify(next))
      return next
    })
  }, [hackathonId])

  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState(open)
    localStorage.setItem(`action-panel-open-${hackathonId}`, String(open))
  }, [hackathonId])

  const handleActionClick = useCallback((item: ActionItem) => {
    if (item.action === "confirm-promote") {
      setPromoteDialogOpen(true)
    } else if (item.action === "open-challenge-dialog") {
      challengeRef.current?.openChallengeDialog()
    } else if (item.action === "release-challenge") {
      challengeRef.current?.openReleaseDialog()
    } else if (item.action === "open-agenda-dialog") {
      setAgendaDialogOpen(true)
      if (!completedIds.has(item.id)) toggleComplete(item.id)
    } else if (item.action === "open-submission-deadline-dialog") {
      submissionDeadlineRef.current?.openDialog()
      if (!completedIds.has(item.id)) toggleComplete(item.id)
    } else if (item.action?.startsWith("transition-to-")) {
      const targetStatus = item.action.replace("transition-to-", "")
      transitionRef.current?.openTransitionDialog(targetStatus)
    } else {
      const href = buildActionHref(slug, item)
      if (href) router.push(href)
    }
  }, [slug, router, completedIds, toggleComplete])

  const triggerTransition = useCallback((targetStatus: string) => {
    transitionRef.current?.openTransitionDialog(targetStatus)
  }, [])

  // Snapshot server-completed and user-completed items so they persist across status changes
  useEffect(() => {
    const current = snapshotsRef.current
    let changed = false
    const next = { ...current }
    for (const item of allItems) {
      if ((item.completed || completedIds.has(item.id)) && !next[item.id]) {
        next[item.id] = item
        changed = true
      }
      if (!item.completed && !completedIds.has(item.id) && next[item.id]) {
        delete next[item.id]
        changed = true
      }
    }
    if (changed) {
      snapshotsRef.current = next
      setCompletedSnapshots(next)
      localStorage.setItem(`completed-snapshots-${hackathonId}`, JSON.stringify(next))
    }
  }, [allItems, completedIds, hackathonId])

  const { activeItems, completedItems } = useMemo(() => {
    const active: ActionItem[] = []
    const completed: ActionItem[] = []
    const seenIds = new Set<string>()
    for (const item of allItems) {
      seenIds.add(item.id)
      if (effectiveDismissedIds.has(item.id)) continue
      if (item.completed || effectiveCompletedIds.has(item.id)) {
        completed.push(item)
      } else {
        active.push(item)
      }
    }
    // Include completed items from previous statuses that are no longer in current action items
    for (const [id, item] of Object.entries(completedSnapshots)) {
      if (!seenIds.has(id) && !effectiveDismissedIds.has(id)) {
        completed.push(item)
      }
    }
    active.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
    return { activeItems: active, completedItems: completed }
  }, [allItems, effectiveCompletedIds, effectiveDismissedIds, completedSnapshots])

  const persistedCount = Object.keys(completedSnapshots).filter((id) => !actionItemIds.has(id) && !effectiveDismissedIds.has(id)).length
  const totalCount = allItems.filter((i) => !effectiveDismissedIds.has(i.id)).length + persistedCount
  const remainingCount = activeItems.length

  const value = useMemo<ActionItemsContextValue>(() => ({
    actionItems,
    completedIds: effectiveCompletedIds,
    dismissedIds: effectiveDismissedIds,
    activeItems,
    completedItems,
    remainingCount,
    totalCount,
    toggleComplete,
    dismissItem,
    panelOpen,
    setPanelOpen,
    handleActionClick,
    triggerTransition,
    addCustomItem,
    removeCustomItem,
    customItems,
    hackathonStatus: liveStatus,
    hackathonPhase: livePhase,
    slug,
  }), [actionItems, effectiveCompletedIds, effectiveDismissedIds, activeItems, completedItems, remainingCount, totalCount, toggleComplete, dismissItem, panelOpen, setPanelOpen, handleActionClick, triggerTransition, addCustomItem, removeCustomItem, customItems, liveStatus, livePhase, slug])

  return (
    <ActionItemsContext.Provider value={value}>
      {children}
      <ChallengeDialogs
        ref={challengeRef}
        hackathonId={hackathonId}
        challengeExists={liveChallengeExists}
        scheduleItems={scheduleItems}
        startsAt={startsAt}
      />
      <TransitionConfirmDialog
        ref={transitionRef}
        hackathonId={hackathonId}
        status={liveStatus}
        endsAt={liveEndsAt}
        onTransitioned={refreshPoll}
      />
      <SubmissionDeadlineDialog
        ref={submissionDeadlineRef}
        hackathonId={hackathonId}
        scheduleItems={scheduleItems}
        endsAt={liveEndsAt}
      />
      <Dialog open={agendaDialogOpen} onOpenChange={setAgendaDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your agenda</DialogTitle>
          </DialogHeader>
          <ScheduleEditor
            hackathonId={hackathonId}
            scheduleItems={scheduleItems}
            challengeReleasedAt={challengeReleasedAt}
            challengeExists={liveChallengeExists}
            hideHeader
            onEditTriggerItem={(item) => {
              if (item.trigger_type === "challenge_release") {
                challengeRef.current?.openChallengeDialog()
              } else if (item.trigger_type === "submission_deadline") {
                submissionDeadlineRef.current?.openDialog()
              }
            }}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Have you promoted your event?</AlertDialogTitle>
            <AlertDialogDescription>
              Share the event link on social media, email potential participants, and spread the word through your community.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggleComplete("promote-event")}>
              Yes, done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ActionItemsContext.Provider>
  )
}
