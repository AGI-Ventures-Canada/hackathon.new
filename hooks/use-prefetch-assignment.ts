import { useState, useEffect, useRef } from "react"
import type { AssignmentDetail } from "@/lib/services/judging"

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
          setCache((prev) => ({ ...prev, [nextAssignmentId]: data }))
        }
      })
      .catch((err) => console.warn("Prefetch failed:", err))
    return () => { cancelled = true }
  }, [nextAssignmentId, hackathonSlug])

  return cache
}
