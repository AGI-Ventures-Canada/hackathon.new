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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (!err || typeof err !== "object") return String(err)
  const errors = (err as { errors?: Array<{ message?: unknown; longMessage?: unknown }> }).errors
  if (!Array.isArray(errors)) return String(err)
  return errors
    .flatMap((entry) => [entry.message, entry.longMessage])
    .filter((message): message is string => typeof message === "string")
    .join(" ")
}

function isStaleSessionError(err: unknown): boolean {
  const status = getErrorStatus(err)
  const message = getErrorMessage(err)
  if (status === 401 || status === 404) return true
  if (status === 403) return /not found|unauthorized/i.test(message)
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
        if (isSignedIn) {
          try {
            if (session?.id) {
              await signOut({ sessionId: session.id })
            } else {
              await signOut()
            }
          } catch (err) {
            if (!isStaleSessionError(err)) throw err
            console.warn("Ignoring stale Clerk session during dev switch sign-out:", err)
          }
        }

        const result = await signIn!.create({
          strategy: "ticket",
          ticket: token,
        })

        if (result.status === "complete") {
          await setActive({
            session: result.createdSessionId,
            organization: org ?? null,
          })
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
