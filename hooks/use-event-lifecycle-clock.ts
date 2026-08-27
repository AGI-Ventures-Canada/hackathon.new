"use client"

import { useEffect, useState } from "react"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { getEffectiveStatusAt } from "@/lib/utils/timeline"

export function useEventLifecycleClock({
  status,
  startsAt,
  endsAt,
}: {
  status: HackathonStatus
  startsAt: string | null
  endsAt: string | null
}) {
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setNowMs(Date.now())
    tick()
    const interval = setInterval(tick, 30_000)
    window.addEventListener("focus", tick)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", tick)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [])

  const effectiveStatus = nowMs === null
    ? status
    : getEffectiveStatusAt(
        { status, starts_at: startsAt, ends_at: endsAt },
        new Date(nowMs),
      )

  return {
    effectiveStatus,
    nowIso: nowMs === null ? null : new Date(nowMs).toISOString(),
  }
}
