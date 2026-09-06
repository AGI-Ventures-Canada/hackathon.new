"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { usePathname } from "next/navigation"

export type EventContext = {
  hackathonId: string
  slug: string
  name: string
  status: string
  phase: string | null
  startsAt: string | null
  endsAt: string | null
  judgingOpensAt: string | null
  judgingClosesAt: string | null
  judgingTimezone: string
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  allowLateRegistration: boolean
  refetch: () => void
}

const SLUG_REGEX = /^\/e\/([^/]+)/

export function useEventContext(): EventContext | null {
  const pathname = usePathname()
  const [data, setData] = useState<Omit<EventContext, "refetch"> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const slug = pathname ? SLUG_REGEX.exec(pathname)?.[1] ?? null : null

  const fetchData = useCallback(
    async (eventSlug: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(`/api/dev/hackathons/by-slug/${eventSlug}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          setData(null)
          return
        }
        const json = await res.json()
        setData({
          hackathonId: json.id,
          slug: json.slug,
          name: json.name,
          status: json.status,
          phase: json.phase,
          startsAt: json.starts_at,
          endsAt: json.ends_at,
          judgingOpensAt: json.judging_opens_at,
          judgingClosesAt: json.judging_closes_at,
          judgingTimezone: json.judging_timezone ?? "UTC",
          registrationOpensAt: json.registration_opens_at,
          registrationClosesAt: json.registration_closes_at,
          allowLateRegistration: json.allow_late_registration ?? true,
        })
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setData(null)
        }
      }
    },
    []
  )

  useEffect(() => {
    if (!slug) {
      const id = requestAnimationFrame(() => setData(null))
      return () => cancelAnimationFrame(id)
    }

    const id = requestAnimationFrame(() => fetchData(slug))
    return () => {
      cancelAnimationFrame(id)
      abortRef.current?.abort()
    }
  }, [slug, fetchData])

  if (!data) return null

  return {
    ...data,
    refetch: () => {
      if (slug) fetchData(slug)
    },
  }
}
