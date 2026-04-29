"use client"

import { useState } from "react"
import { useUser } from "@clerk/nextjs"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, Check, CalendarClock, Lock, Users } from "lucide-react"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

interface RegistrationButtonProps {
  hackathonSlug: string
  status: HackathonStatus
  endsAt: string | null
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  maxParticipants: number | null
  participantCount: number
  isRegistered: boolean
  requireLocationVerification?: boolean
  onRegistrationSuccess?: () => void
}

const blockedStatuses: HackathonStatus[] = ["draft", "archived", "completed", "judging"]
const openStatuses: HackathonStatus[] = ["published", "registration_open", "active"]

export function RegistrationButton({
  hackathonSlug,
  status,
  endsAt,
  registrationOpensAt,
  registrationClosesAt,
  maxParticipants,
  participantCount,
  isRegistered: initialIsRegistered,
  requireLocationVerification,
  onRegistrationSuccess,
}: RegistrationButtonProps) {
  const { isSignedIn, isLoaded } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const [isRegistered, setIsRegistered] = useState(initialIsRegistered)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isLoaded) {
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
  const opensAt = registrationOpensAt ? new Date(registrationOpensAt) : null
  const closesAt = registrationClosesAt ? new Date(registrationClosesAt) : null
  const eventEndsAt = endsAt ? new Date(endsAt) : null

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

  if (closesAt && now > closesAt) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button disabled variant="secondary" size="lg">
          <span className="line-through opacity-60">Register to Attend</span>
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0" />
          Registration closed {closesAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
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
          Register to Attend
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
    }
    return errorMessages[code] || fallback
  }

  async function handleRegister() {
    setIsLoading(true)
    setError(null)

    try {
      let fetchBody: string | undefined
      let fetchHeaders: Record<string, string> | undefined

      if (requireLocationVerification) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
          })
          fetchBody = JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
          fetchHeaders = { "Content-Type": "application/json" }
        } catch {
          setError("Location access is required for this in-person event. Please enable location permissions and try again.")
          setIsLoading(false)
          return
        }
      }

      const response = await fetch(`/api/public/hackathons/${hackathonSlug}/register`, {
        method: "POST",
        headers: fetchHeaders,
        body: fetchBody,
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
    <div className="flex flex-col gap-2">
      <Button onClick={handleRegister} disabled={isLoading} size="lg">
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
