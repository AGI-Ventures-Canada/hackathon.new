"use client"

import { useEffect } from "react"
import { useAuth, useUser } from "@clerk/nextjs"

function PostHogIdentifier() {
  const { userId } = useAuth()
  const { user } = useUser()

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    let cancelled = false
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return
      if (userId && user) {
        posthog.identify(userId, {
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName,
        })
      } else if (!userId) {
        posthog.reset()
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId, user])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return <>{children}</>

  return (
    <>
      <PostHogIdentifier />
      {children}
    </>
  )
}
