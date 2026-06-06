"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

interface AutoRefreshProps {
  enabled?: boolean
  intervalMs?: number
}

const DEFAULT_INTERVAL_MS = 3000
const JITTER_RATIO = 1 / 6

function getRandomInterval(baseMs: number) {
  const jitter = baseMs * JITTER_RATIO
  return baseMs - jitter + Math.random() * jitter * 2
}

export function AutoRefresh({ enabled = true, intervalMs = DEFAULT_INTERVAL_MS }: AutoRefreshProps) {
  const router = useRouter()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    if (!enabled) return

    mountedRef.current = true

    const stopPolling = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const scheduleRefresh = () => {
      stopPolling()
      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        router.refresh()
        scheduleRefresh()
      }, getRandomInterval(intervalMs))
    }

    const handleVisibilityChange = () => {
      if (!mountedRef.current) return
      if (document.hidden) {
        stopPolling()
      } else {
        router.refresh()
        scheduleRefresh()
      }
    }

    scheduleRefresh()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      mountedRef.current = false
      stopPolling()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [router, enabled, intervalMs])

  return null
}
