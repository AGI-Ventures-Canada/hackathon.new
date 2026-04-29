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
import { Users, Calendar, Check, X, AlertCircle, Clock } from "lucide-react"

interface InviteAcceptClientProps {
  token: string
  invitation: {
    teamName: string
    hackathonName: string
    hackathonSlug: string
    hackathonStatus: string
    email: string
    status: string
    expiresAt: string
  }
  isAuthenticated: boolean
}

export function InviteAcceptClient({
  token,
  invitation,
  isAuthenticated,
}: InviteAcceptClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isValid = invitation.status === "pending"

  async function handleAccept() {
    setLoading(true)
    setError(null)

    try {
      await fetch(`/api/public/invitations/${token}/accept`, {
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
      await fetch(`/api/public/invitations/${token}/decline`, {
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
          <h2 className="text-xl font-bold mb-2">Welcome to the Team!</h2>
          <p className="text-muted-foreground">
            You&apos;ve joined &quot;{invitation.teamName}&quot;. Redirecting to the hackathon
            page...
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
          "This invitation has expired. Please ask the team captain to send a new one.",
      },
      accepted: {
        icon: <Check className="size-8 text-primary" />,
        title: "Already Accepted",
        description: "This invitation has already been accepted.",
      },
      declined: {
        icon: <X className="size-8 text-muted-foreground" />,
        title: "Invitation Declined",
        description: "This invitation was declined.",
      },
      cancelled: {
        icon: <AlertCircle className="size-8 text-muted-foreground" />,
        title: "Invitation Cancelled",
        description: "This invitation was cancelled by the team captain.",
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
          <Users className="size-8 text-primary" />
        </div>
        <CardTitle>Join Team</CardTitle>
        <CardDescription>You&apos;ve been invited to join a team</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Users className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Team</p>
              <p className="font-medium">{invitation.teamName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Calendar className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Hackathon</p>
              <p className="font-medium">{invitation.hackathonName}</p>
            </div>
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
              {loading ? "Joining..." : "Accept & Join Team"}
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
            <SignInButton
              mode="modal"
              forceRedirectUrl={`/invite/${token}`}
              initialValues={{ emailAddress: invitation.email }}
            >
              <Button className="w-full">Sign In to Accept</Button>
            </SignInButton>
            <SignUpButton
              mode="modal"
              forceRedirectUrl={`/invite/${token}`}
              initialValues={{ emailAddress: invitation.email }}
            >
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
