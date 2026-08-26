"use client"

import { useEffect } from "react"
import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { safeRedirectUrl } from "@/lib/utils/url"

export function SSOCallback() {
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const stored = searchParams.get("redirect_url")
  const storedDestination = safeRedirectUrl(stored ?? undefined, "")

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const timeout = window.setTimeout(() => {
      if (window.location.pathname === "/sso-callback") {
        const fallback = orgId ? "/home" : "/onboarding"
        const destination = safeRedirectUrl(stored ?? undefined, fallback)
        console.warn("[sso-callback] Clerk redirect stalled; falling back to", destination)
        router.replace(destination)
      }
    }, 8000)
    return () => window.clearTimeout(timeout)
  }, [isLoaded, isSignedIn, orgId, router, stored])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4">
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={storedDestination || "/home"}
        signUpFallbackRedirectUrl={storedDestination || "/onboarding"}
      />
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground text-sm">Signing you in…</p>
      <div id="clerk-captcha" />
    </div>
  )
}
