"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { assertOk } from "@/lib/utils/fetch"
import { SignInButton, SignUpButton } from "@clerk/nextjs"
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
import { Scale, Check, X, AlertCircle, Clock } from "lucide-react"

interface JudgeInviteAcceptClientProps {
  token: string
  invitation: {
    hackathonName: string
    hackathonSlug: string
    email: string
    status: string
    expiresAt: string
  }
  isAuthenticated: boolean
}

export function JudgeInviteAcceptClient({
  token,
  invitation,
  isAuthenticated,
}: JudgeInviteAcceptClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isValid = invitation.status === "pending"

  async function handleAccept() {
    setLoading(true)
    setError(null)

    try {
      await fetch(`/api/public/judge-invitations/${token}/accept`, {
        method: "POST",
      }).then(assertOk)

      setSuccess(true)
      setTimeout(() => {
        router.push(`/e/${invitation.hackathonSlug}`)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation")
    } finally {
      setLoading(false)
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
            You&apos;ve accepted the invitation to judge {invitation.hackathonName}. Redirecting...
          </p>
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
          <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
            Go Home
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

        {!isAuthenticated && (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>
              Sign in or create an account to accept this invitation.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-3">
        {isAuthenticated ? (
          <>
            <Button className="w-full" onClick={handleAccept} disabled={loading}>
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
            <SignInButton mode="modal" forceRedirectUrl={`/judge-invite/${token}`}>
              <Button className="w-full">Sign In to Accept</Button>
            </SignInButton>
            <SignUpButton mode="modal" forceRedirectUrl={`/judge-invite/${token}`}>
              <Button variant="outline" className="w-full">
                Create Account
              </Button>
            </SignUpButton>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
