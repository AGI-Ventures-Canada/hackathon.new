"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { createAuthResumeTarget } from "@/lib/auth/create-resume"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface SignInRequiredDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  redirectQuery?: string
  resumeImport?: { sourceUrl: string; storageKey: string }
  beforeNavigate?: () => true | string
}

export function SignInRequiredDialog({
  open,
  onOpenChange,
  title = "Sign in to continue",
  description = "Your progress has been saved. Sign in to continue.",
  redirectQuery,
  resumeImport,
  beforeNavigate,
}: SignInRequiredDialogProps) {
  const router = useRouter()
  const pathname = usePathname()
  const currentSearchParams = useSearchParams()
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  const redirectUrl = (() => {
    const params = new URLSearchParams(currentSearchParams.toString())
    if (redirectQuery) {
      new URLSearchParams(redirectQuery).forEach((value, key) => {
        params.set(key, value)
      })
    }
    const search = params.toString()
    return `${pathname}${search ? `?${search}` : ""}`
  })()

  const openAuth = (path: "/sign-in" | "/sign-up") => {
    if (isNavigating) return
    const readiness = beforeNavigate?.()
    if (readiness !== undefined && readiness !== true) {
      setResumeError(readiness)
      return
    }
    const target = createAuthResumeTarget(redirectUrl, resumeImport)
    if (!target) {
      setResumeError("We couldn't save the return path. Keep this page open and try again.")
      return
    }
    setResumeError(null)
    setIsNavigating(true)
    try {
      router.push(`${path}?redirect_url=${encodeURIComponent(target)}`)
    } catch {
      setIsNavigating(false)
      setResumeError("We couldn't open sign in. Keep this page open and try again.")
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsNavigating(false)
      setResumeError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {resumeError && (
            <p className="text-sm text-destructive sm:mr-auto">{resumeError}</p>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => openAuth("/sign-up")}
            disabled={isNavigating}
          >
            Sign Up
          </Button>
          <Button
            onClick={() => openAuth("/sign-in")}
            disabled={isNavigating}
          >
            Sign In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
