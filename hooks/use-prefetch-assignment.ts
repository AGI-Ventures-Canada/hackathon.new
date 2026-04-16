import { useState, useEffect, useRef } from "react"
import type { AssignmentDetail } from "@/lib/services/judging"

const MAX_CACHE_SIZE = 3

export function usePrefetchAssignment(
  hackathonSlug: string,
  nextAssignmentId: string | null
) {
  const [cache, setCache] = useState<Record<string, AssignmentDetail>>({})
  const prefetchedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!nextAssignmentId || prefetchedIdsRef.current.has(nextAssignmentId)) return
    prefetchedIdsRef.current.add(nextAssignmentId)

    let cancelled = false
    fetch(`/api/public/hackathons/${hackathonSlug}/judging/assignments/${nextAssignmentId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && !cancelled) {
          setCache((prev) => {
            const next = { ...prev, [nextAssignmentId]: data }
            const keys = Object.keys(next)
            if (keys.length > MAX_CACHE_SIZE) {
              const keysToRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE)
              for (const key of keysToRemove) {
                delete next[key]
              }
            }
            return next
          })
        }
      })
      .catch((err) => console.warn("Prefetch failed:", err))
    return () => { cancelled = true }
  }, [nextAssignmentId, hackathonSlug])

  return cache
}
