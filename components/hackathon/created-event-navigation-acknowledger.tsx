"use client"

import { useEffect } from "react"
import { acknowledgeCreatedEventNavigation } from "@/lib/created-event-navigation"

export function CreatedEventNavigationAcknowledger({ slug }: { slug: string }) {
  useEffect(() => {
    acknowledgeCreatedEventNavigation(slug)
  }, [slug])

  return null
}
