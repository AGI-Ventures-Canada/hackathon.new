"use client"

import { useEffect, useRef, useState } from "react"
import { useSignIn, useUser, useClerk, useSession } from "@clerk/nextjs"
import { Loader2 } from "lucide-react"
import Link from "next/link"

function getErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null
  const status = (err as { status?: unknown; statusCode?: unknown }).status
  if (typeof status === "number") return status
  const statusCode = (err as { statusCode?: unknown }).statusCode
  return typeof statusCode === "number" ? statusCode : null
}

function getErrorCodes(err: unknown): string[] {
  if (!err || typeof err !== "object") return []
  const errors = (err as { errors?: Array<{ code?: unknown }> }).errors
  if (!Array.isArray(errors)) return []
  return errors
    .map((entry) => entry.code)
    .filter((code): code is string => typeof code === "string")
}

function isStaleSessionError(
  err: unknown,
  options: { allowStaleOrganization?: boolean } = {}
): boolean {
  const status = getErrorStatus(err)
  const codes = getErrorCodes(err)
  if (codes.includes("organization_not_found_or_unauthorized")) {
    return options.allowStaleOrganization === true
  }
  if (
    codes.some(
      (code) =>
        code.includes("session") &&
        (code.includes("not_found") || code.includes("unauthorized"))
    )
  ) {
    return true
  }
  if (codes.length > 0 && status === 403) return false
  if (status === 401 || status === 404) return true
  return false
}

export function DevSwitchClient({
  token,
  redirect,
  org,
}: {
  token: string
  redirect: string
  org: string | null
}) {
  const { signIn, isLoaded: signInLoaded } = useSignIn()
  const { isSignedIn, isLoaded: userLoaded } = useUser()
  const { session, isLoaded: sessionLoaded } = useSession()
  const { signOut, setActive } = useClerk()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!signInLoaded || !userLoaded || !sessionLoaded || !signIn) return
    if (started.current) return
    started.current = true

    async function doSwitch() {
      try {
        async function activateSession(sessionId: string) {
          if (!org) {
            try {
              await setActive({ session: sessionId, organization: null })
            } catch (err) {
              if (!isStaleSessionError(err, { allowStaleOrganization: true })) throw err
              console.warn("Retrying dev switch after stale Clerk session activation:", err)
              await setActive({ session: sessionId, organization: null })
            }
            return
          }

          try {
            await setActive({
              session: sessionId,
              organization: org,
            })
          } catch (err) {
            if (!isStaleSessionError(err)) throw err
            console.warn("Retrying dev switch after stale Clerk organization activation:", err)
            await setActive({
              session: sessionId,
              organization: org,
            })
          }
        }

        if (isSignedIn) {
          try {
            if (session?.id) {
              await signOut({ sessionId: session.id })
            } else {
              await signOut()
            }
          } catch (err) {
            if (!isStaleSessionError(err, { allowStaleOrganization: true })) throw err
            console.warn("Ignoring stale Clerk session during dev switch sign-out:", err)
          }
        }

        const result = await signIn!.create({
          strategy: "ticket",
          ticket: token,
        })

        if (result.status === "complete") {
          if (!result.createdSessionId) {
            setError("No session was created.")
            return
          }
          await activateSession(result.createdSessionId)
          window.location.replace(redirect)
        } else {
          setError(`Unexpected sign-in status: ${result.status}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sign-in failed"
        setError(msg)
      }
    }

    doSwitch()
  }, [signInLoaded, userLoaded, sessionLoaded, signIn, isSignedIn, signOut, session?.id, token, redirect, org, setActive])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/sign-in" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Switching account…</p>
    </div>
  )
}
