"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import type { OrganizerPollResponse } from "@/lib/services/organizer-polling"

export const STALE_THRESHOLD = 3

interface UseOrganizerPollOptions {
  interval?: number
  enabled?: boolean
}

export type PollState = {
  data: OrganizerPollResponse | null
  isStale: boolean
  failCount: number
}

export async function executePoll(
  hackathonId: string,
  state: PollState,
  signal?: AbortSignal
): Promise<PollState> {
  if (document.hidden) return state

  try {
    const res = await fetch(
      `/api/dashboard/hackathons/${hackathonId}/action-items-poll`,
      { signal, cache: "no-store" }
    )
    if (!res.ok) {
      const failCount = state.failCount + 1
      return { ...state, failCount, isStale: failCount >= STALE_THRESHOLD }
    }
    const data: OrganizerPollResponse = await res.json()
    return { data, isStale: false, failCount: 0 }
  } catch (e) {
    if ((e as Error).name === "AbortError") return state
    const failCount = state.failCount + 1
    return { ...state, failCount, isStale: failCount >= STALE_THRESHOLD }
  }
}

export function useOrganizerPoll(
  hackathonId: string,
  options?: UseOrganizerPollOptions
) {
  const { interval = 30000, enabled = true } = options ?? {}
  const [data, setData] = useState<OrganizerPollResponse | null>(null)
  const [isStale, setIsStale] = useState(false)
  const stateRef = useRef<PollState>({ data: null, isStale: false, failCount: 0 })
  const abortRef = useRef<AbortController | null>(null)

  const poll = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const next = await executePoll(hackathonId, stateRef.current, controller.signal)
    stateRef.current = next
    setData(next.data)
    setIsStale(next.isStale)
  }, [hackathonId])

  useEffect(() => {
    if (!enabled) return

    const initialPoll = setTimeout(poll, 0)
    const id = setInterval(poll, interval)

    const onVisibilityChange = () => {
      if (!document.hidden) poll()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      clearTimeout(initialPoll)
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      abortRef.current?.abort()
    }
  }, [poll, interval, enabled])

  const refresh = useCallback(() => { poll() }, [poll])

  return { data, isStale, refresh }
}
