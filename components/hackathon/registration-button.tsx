"use client"

import { useState } from "react"
import { useUser } from "@clerk/nextjs"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, Check, CalendarClock, Lock, Users } from "lucide-react"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { TermsAcceptanceBlock } from "@/components/hackathon/terms-acceptance-block"
import { useIsClient } from "@/hooks/use-is-client"

interface RegistrationButtonProps {
  hackathonSlug: string
  status: HackathonStatus
  startsAt: string | null
  endsAt: string | null
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  allowLateRegistration?: boolean
  maxParticipants: number | null
  participantCount: number
  isRegistered: boolean
  requireLocationVerification?: boolean
  requireTermsAcceptance?: boolean
  termsContent?: string | null
  termsHash?: string | null
  onRegistrationSuccess?: () => void
}

const blockedStatuses: HackathonStatus[] = ["draft", "archived", "completed", "judging"]
const openStatuses: HackathonStatus[] = ["published", "registration_open", "active"]

export function RegistrationButton({
  hackathonSlug,
  status,
  startsAt,
  endsAt,
  registrationOpensAt,
  registrationClosesAt,
  allowLateRegistration = true,
  maxParticipants,
  participantCount,
  isRegistered: initialIsRegistered,
  requireLocationVerification,
  requireTermsAcceptance,
  termsContent,
  termsHash,
  onRegistrationSuccess,
}: RegistrationButtonProps) {
  const { isSignedIn, isLoaded } = useUser()
  const isClient = useIsClient()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isJudgeLogin = searchParams.get("as") === "judge"
  const [isRegistered, setIsRegistered] = useState(initialIsRegistered)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const needsTerms = Boolean(requireTermsAcceptance && termsContent && termsHash)

  if (!isClient || !isLoaded) {
    return (
      <Button disabled variant="secondary" size="lg">
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </Button>
    )
  }

  if (isRegistered) {
    return (
      <Button disabled variant="secondary" size="lg">
        <Check className="size-4" />
        Registered
      </Button>
    )
  }

  const now = new Date()
  const eventStartsAt = startsAt ? new Date(startsAt) : null
  const opensAt = registrationOpensAt ? new Date(registrationOpensAt) : null
  const closesAt = registrationClosesAt ? new Date(registrationClosesAt) : null
  const eventEndsAt = endsAt ? new Date(endsAt) : null
  const canRegisterLate = Boolean(
    allowLateRegistration &&
    eventStartsAt &&
    now >= eventStartsAt &&
    (!eventEndsAt || now <= eventEndsAt) &&
    openStatuses.includes(status)
  )

  if (blockedStatuses.includes(status)) {
    const blockedMessage: Record<string, string> = {
      draft: "Registration Not Open Yet",
      judging: "Judging in Progress",
      completed: "Event Completed",
      archived: "Event Archived",
    }
    return (
      <Button disabled variant="secondary" size="lg">
        <Lock className="size-4" />
        {blockedMessage[status] ?? "Registration Not Available"}
      </Button>
    )
  }

  if (eventEndsAt && now > eventEndsAt) {
    return (
      <Button disabled variant="secondary" size="lg">
        <Lock className="size-4" />
        Event Ended
      </Button>
    )
  }

  if (opensAt && now < opensAt) {
    return (
      <Button disabled variant="secondary" size="lg">
        <CalendarClock className="size-4" />
        Opens {opensAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </Button>
    )
  }

  if (closesAt && now > closesAt && !canRegisterLate) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button disabled variant="secondary" size="lg">
          <span className="line-through opacity-60">Register to Attend</span>
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0" />
          Registration closed {closesAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
        {!isSignedIn && (
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}
            className="text-xs text-primary hover:text-primary/80"
          >
            Already signed up? Sign in
          </Link>
        )}
      </div>
    )
  }

  if (!opensAt && !closesAt && !openStatuses.includes(status)) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button disabled variant="secondary" size="lg">
          <span className="line-through opacity-60">Register to Attend</span>
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0" />
          Registration closed
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <Button asChild size="lg">
        <Link href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}>
          {isJudgeLogin ? "Log in to judge" : "Register to Attend"}
        </Link>
      </Button>
    )
  }

  if (maxParticipants && participantCount >= maxParticipants) {
    return (
      <Button disabled variant="secondary" size="lg">
        <Users className="size-4" />
        Event Full
      </Button>
    )
  }

  function getErrorMessage(code: string, fallback: string): string {
    const errorMessages: Record<string, string> = {
      not_authenticated: "Please sign in to register.",
      hackathon_not_found: "This hackathon no longer exists.",
      already_registered: "You're already registered for this event.",
      registration_not_open: "Registration is not currently open.",
      registration_closed: "Registration has closed.",
      event_ended: "This event has ended.",
      at_capacity: "This event has reached maximum capacity.",
      location_required: "Location verification required. Please share your location.",
      location_too_far: fallback,
      terms_required: "You must agree to the terms and conditions to register.",
      terms_record_failed: "Couldn't record your agreement. Please try again.",
    }
    return errorMessages[code] || fallback
  }

  async function handleRegister() {
    if (needsTerms && !termsAccepted) {
      setError("Please agree to the terms and conditions to register.")
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      const bodyPayload: Record<string, unknown> = {}
      if (requireLocationVerification) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
          })
          bodyPayload.latitude = position.coords.latitude
          bodyPayload.longitude = position.coords.longitude
        } catch {
          setError("Location access is required for this in-person event. Please enable location permissions and try again.")
          setIsLoading(false)
          return
        }
      }

      if (needsTerms) {
        bodyPayload.terms_hash = termsHash
      }

      const hasBody = Object.keys(bodyPayload).length > 0
      const response = await fetch(`/api/public/hackathons/${hackathonSlug}/register`, {
        method: "POST",
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? JSON.stringify(bodyPayload) : undefined,
      })

      let data
      try {
        data = await response.json()
      } catch {
        setError("Unable to process response. Please try again.")
        return
      }

      if (!response.ok) {
        setError(getErrorMessage(data.code, data.error || "Failed to register"))
        return
      }

      if (data.warning === "terms_record_failed") {
        console.warn("[terms] registration succeeded but acceptance was not recorded for hackathon", hackathonSlug)
      }

      setIsRegistered(true)
      onRegistrationSuccess?.()
      router.refresh()
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("Network error. Please check your connection and try again.")
      } else {
        setError("An unexpected error occurred. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {needsTerms && termsContent && (
        <TermsAcceptanceBlock
          termsContent={termsContent}
          accepted={termsAccepted}
          onChange={setTermsAccepted}
          disabled={isLoading}
        />
      )}
      <Button
        onClick={handleRegister}
        disabled={isLoading || (needsTerms && !termsAccepted)}
        size="lg"
      >
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Registering...
          </>
        ) : (
          "Register to Attend"
        )}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
