"use client"

import { useEffect } from "react"
import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/nextjs"
import { Loader2 } from "lucide-react"

export function SSOCallback() {
  const { isLoaded, isSignedIn, orgId } = useAuth()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const timeout = window.setTimeout(() => {
      if (window.location.pathname === "/sso-callback") {
        const stored = new URLSearchParams(window.location.search).get("redirect_url")
        const destination = stored ?? (orgId ? "/home" : "/onboarding")
        window.location.replace(destination)
      }
    }, 8000)
    return () => window.clearTimeout(timeout)
  }, [isLoaded, isSignedIn, orgId])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4">
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/home"
        signUpFallbackRedirectUrl="/onboarding"
      />
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground text-sm">Signing you in…</p>
      <div id="clerk-captcha" />
    </div>
  )
}
