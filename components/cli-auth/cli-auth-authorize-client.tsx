"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CliAuthOrgGate } from "@/components/cli-auth/cli-auth-org-gate"

const TOKEN_STORAGE_KEY = "hackathon.cli-auth-token"
const emptySubscribe = () => () => {}

function fragmentToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("token")
}

export function CliAuthAuthorizeClient({ action }: { action: (formData: FormData) => Promise<void> }) {
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const router = useRouter()
  const [code, setCode] = useState("")
  const ready = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const token = ready
    ? fragmentToken() ?? sessionStorage.getItem(TOKEN_STORAGE_KEY)
    : null

  useEffect(() => {
    const tokenFromFragment = fragmentToken()
    if (tokenFromFragment) sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenFromFragment)
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
  }, [])

  useEffect(() => {
    if (ready && isLoaded && !isSignedIn && token) {
      router.push("/sign-in?redirect_url=%2Fcli-auth")
    }
  }, [isLoaded, isSignedIn, ready, router, token])

  if (!ready || !isLoaded || (!isSignedIn && token)) return <p className="text-muted-foreground">Opening sign in…</p>
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return (
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">Invalid link</h1>
        <p className="text-muted-foreground">Run <code className="bg-muted px-1.5 py-0.5 rounded text-sm">hackathon login</code> again.</p>
      </div>
    )
  }
  if (!orgId) return <CliAuthOrgGate />

  return (
    <div className="text-center max-w-md">
      <h1 className="text-2xl font-bold mb-2">Allow CLI access?</h1>
      <p className="text-muted-foreground mb-4">Enter the six-letter code shown in your terminal.</p>
      <form action={action} autoComplete="off" onSubmit={() => sessionStorage.removeItem(TOKEN_STORAGE_KEY)}>
        <input type="hidden" name="token" value={token} />
        <input
          name="userCode"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          className="mb-4 w-full rounded-md border bg-background px-3 py-2 text-center tracking-[0.35em]"
          maxLength={6}
          autoFocus
          aria-label="CLI confirmation code"
        />
        <Button type="submit" disabled={code.length !== 6}>Allow access</Button>
      </form>
    </div>
  )
}
