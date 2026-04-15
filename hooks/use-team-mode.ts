"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export type TeamMode = "in_person" | "virtual"

export function useTeamMode(hackathonId: string, teamId: string, currentMode: TeamMode | null) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optimisticMode, setOptimisticMode] = useState<TeamMode | null>(currentMode)

  async function setMode(mode: TeamMode) {
    if (mode === optimisticMode) return
    const previous = optimisticMode
    setOptimisticMode(mode)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/teams/${teamId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update team mode")
      }
      router.refresh()
    } catch (err) {
      setOptimisticMode(previous)
      setError(err instanceof Error ? err.message : "Failed to update team mode")
    } finally {
      setSaving(false)
    }
  }

  return { mode: optimisticMode, setMode, saving, error }
}
