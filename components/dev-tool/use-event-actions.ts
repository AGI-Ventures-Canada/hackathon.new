"use client"

import { useCallback, useEffect, useState } from "react"
import { dispatchDevStatusChanged } from "./events"
import { EMPTY_SEED_STATUS, type SeedStatus } from "./tabs/event-shared"

export type EventActionRunner = (
  path: string,
  method?: string,
  body?: unknown
) => Promise<unknown>

export type EventActionsApi = {
  seedStatus: SeedStatus
  pending: string | null
  toast: string | null
  runAction: EventActionRunner
  showToast: (msg: string) => void
  setPending: (v: string | null) => void
  refreshSeedStatus: () => void
}

export function useEventActions(
  hackathonId: string | null,
  onSaveState: () => void,
  refreshContext: () => void
): EventActionsApi {
  const [seedStatus, setSeedStatus] = useState<SeedStatus>(EMPTY_SEED_STATUS)
  const [pending, setPending] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const refreshSeedStatus = useCallback(() => {
    if (!hackathonId) return
    fetch(`/api/dev/hackathons/${hackathonId}/seed-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSeedStatus(data)
      })
      .catch(() => {})
  }, [hackathonId])

  useEffect(() => {
    refreshSeedStatus()
  }, [refreshSeedStatus])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const runAction = useCallback<EventActionRunner>(
    async (path, method = "POST", body) => {
      if (!hackathonId) return
      const key = path + method
      if (pending) return
      setPending(key)
      try {
        const res = await fetch(`/api/dev/hackathons/${hackathonId}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          showToast(data?.error ?? "Action failed")
          return
        }
        const data = await res.json()
        const isSeedAction = path.includes("seed") || path === "/seed-data"
        if (isSeedAction) {
          onSaveState()
          window.location.reload()
        } else {
          refreshContext()
          dispatchDevStatusChanged()
        }
        return data
      } catch {
        showToast("Action failed")
      } finally {
        setPending(null)
      }
    },
    [hackathonId, pending, onSaveState, refreshContext, showToast]
  )

  return {
    seedStatus,
    pending,
    toast,
    runAction,
    showToast,
    setPending,
    refreshSeedStatus,
  }
}
