"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { assertOk } from "@/lib/utils/fetch"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CalendarClock, Check, Clock, Mail, Scale, X } from "lucide-react"
import { TermsAcceptanceBlock } from "@/components/hackathon/terms-acceptance-block"

interface JudgeInviteAcceptClientProps {
  token: string
  invitation: {
    hackathonName: string
    hackathonSlug: string
    email: string
    status: string
    expiresAt: string
    expiresLabel?: string | null
    eventSchedule?: string | null
    requireTermsAcceptance?: boolean
    termsContent?: string | null
    termsHash?: string | null
  }
  isAuthenticated: boolean
  autoAccept?: boolean
}

export function JudgeInviteAcceptClient({
  token,
  invitation,
  isAuthenticated,
  autoAccept = false,
}: JudgeInviteAcceptClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const autoAcceptStarted = useRef(false)
  const autoAcceptStorageKey = `judge-invite-auto-accept:${token}`

  const isValid = invitation.status === "pending"
  const needsTerms = Boolean(invitation.requireTermsAcceptance && invitation.termsContent && invitation.termsHash)
  const canAccept = !loading && (!needsTerms || termsAccepted)

  const handleAccept = useCallback(async () => {
    if (needsTerms && !termsAccepted) {
      setError("Please agree to the terms and conditions to continue.")
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/public/judge-invitations/${token}/accept`, {
        method: "POST",
        ...(needsTerms && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: invitation.termsHash }),
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Request failed with status ${res.status}`)
      }
      const body = await res.json().catch(() => ({}))
      if (body.warning === "terms_record_failed") {
        console.warn("[terms] judge-invite accept succeeded but acceptance was not recorded for hackathon", invitation.hackathonSlug)
      }

      setSuccess(true)
      router.replace(`/e/${invitation.hackathonSlug}/judge`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation")
    } finally {
      setLoading(false)
    }
  }, [
    invitation.hackathonSlug,
    invitation.termsHash,
    needsTerms,
    termsAccepted,
    token,
    router,
  ])

  useEffect(() => {
    if (
      !autoAccept ||
      !isAuthenticated ||
      !isValid ||
      needsTerms ||
      autoAcceptStarted.current
    ) {
      return
    }
    let explicitlyRequested = false
    try {
      explicitlyRequested = sessionStorage.getItem(autoAcceptStorageKey) === "1"
      sessionStorage.removeItem(autoAcceptStorageKey)
    } catch {
      explicitlyRequested = false
    }
    if (!explicitlyRequested) return
    autoAcceptStarted.current = true
    void handleAccept()
  }, [autoAccept, autoAcceptStorageKey, handleAccept, isAuthenticated, isValid, needsTerms])

  const rememberAcceptIntent = () => {
    try {
      sessionStorage.setItem(autoAcceptStorageKey, "1")
    } catch {
      return
    }
  }

  async function handleDecline() {
    setLoading(true)
    setError(null)

    try {
      await fetch(`/api/public/judge-invitations/${token}/decline`, {
        method: "POST",
      }).then(assertOk)

      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decline invitation")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="rounded-full bg-primary/10 p-4 w-fit mx-auto mb-4">
            <Check className="size-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">You&apos;re a Judge!</h2>
          <p className="text-muted-foreground">
            You&apos;ve accepted the invitation to judge {invitation.hackathonName}.
          </p>
          <Button className="mt-4 w-full" asChild>
            <Link href={`/e/${invitation.hackathonSlug}/judge`}>Open Judging</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!isValid) {
    const statusMessages: Record<
      string,
      { icon: React.ReactNode; title: string; description: string }
    > = {
      expired: {
        icon: <Clock className="size-8 text-muted-foreground" />,
        title: "Invitation Expired",
        description:
          "This invitation has expired. Please ask the organizer to send a new one.",
      },
      accepted: {
        icon: <Check className="size-8 text-primary" />,
        title: "Already Accepted",
        description: "This invitation has already been accepted.",
      },
      cancelled: {
        icon: <X className="size-8 text-muted-foreground" />,
        title: "Invitation Cancelled",
        description: "This invitation was cancelled by the organizer.",
      },
      declined: {
        icon: <X className="size-8 text-muted-foreground" />,
        title: "Invitation Declined",
        description: "You declined this invitation.",
      },
    }

    const status = statusMessages[invitation.status] || statusMessages.expired

    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="rounded-full bg-muted p-4 w-fit mx-auto mb-4">
            {status.icon}
          </div>
          <h2 className="text-xl font-bold mb-2">{status.title}</h2>
          <p className="text-muted-foreground">{status.description}</p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full" asChild>
            <Link
              href={invitation.status === "accepted"
                ? `/e/${invitation.hackathonSlug}/judge`
                : `/e/${invitation.hackathonSlug}`}
            >
              {invitation.status === "accepted" ? "Open Judging" : "View Event"}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="rounded-full bg-primary/10 p-4 w-fit mx-auto mb-4">
          <Scale className="size-8 text-primary" />
        </div>
        <CardTitle>Judge Invitation</CardTitle>
        <CardDescription>You&apos;ve been invited to judge a hackathon</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <Scale className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Hackathon</p>
            <p className="font-medium">{invitation.hackathonName}</p>
          </div>
        </div>

        {invitation.eventSchedule && (
          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <CalendarClock className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Event time</p>
              <p className="font-medium">{invitation.eventSchedule}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
          <Mail className="size-5 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Invitation email</p>
            <p className="truncate font-medium">{invitation.email}</p>
          </div>
        </div>

        {invitation.expiresLabel && (
          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <Clock className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Accept by</p>
              <p className="font-medium">{invitation.expiresLabel}</p>
            </div>
          </div>
        )}

        {!isAuthenticated && (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>
              Sign in or create an account to accept this invitation.
            </AlertDescription>
          </Alert>
        )}

        {isAuthenticated && needsTerms && invitation.termsContent && (
          <TermsAcceptanceBlock
            termsContent={invitation.termsContent}
            accepted={termsAccepted}
            onChange={setTermsAccepted}
            disabled={loading}
          />
        )}
      </CardContent>

      <CardFooter className="flex-col gap-3">
        {isAuthenticated ? (
          <>
            <Button className="w-full" onClick={handleAccept} disabled={!canAccept}>
              {loading ? "Accepting..." : "Accept & Become Judge"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDecline}
              disabled={loading}
            >
              Decline
            </Button>
          </>
        ) : (
          <>
            <Button className="w-full" asChild>
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(`/judge-invite/${token}?accept=true`)}&email=${encodeURIComponent(invitation.email)}`}
                onClick={rememberAcceptIntent}
              >
                Sign In to Accept
              </Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link
                href={`/sign-up?redirect_url=${encodeURIComponent(`/judge-invite/${token}?accept=true`)}&email=${encodeURIComponent(invitation.email)}`}
                onClick={rememberAcceptIntent}
              >
                Create Account
              </Link>
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
