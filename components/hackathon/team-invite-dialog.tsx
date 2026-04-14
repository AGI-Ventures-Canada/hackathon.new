"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserPlus, Check, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface TeamInviteDialogProps {
  teamId: string
  hackathonId: string
  teamName: string
  maxTeamSize: number
}

const INVITE_COUNTDOWN = 6

export function TeamInviteDialog({ teamId, hackathonId, teamName, maxTeamSize }: TeamInviteDialogProps) {
  const router = useRouter()
  const emailInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressValue, setProgressValue] = useState(0)
  const rafRef = useRef<number | null>(null)

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  useEffect(() => {
    if (open && !success) {
      setTimeout(() => emailInputRef.current?.focus(), 0)
    }
  }, [open, success])

  useEffect(() => {
    if (!success || !open) {
      setProgressValue(0)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    const start = performance.now()
    const duration = INVITE_COUNTDOWN * 1000
    const animate = (now: number) => {
      const value = Math.min(((now - start) / duration) * 100, 100)
      setProgressValue(value)
      if (value < 100) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setOpen(false)
        setEmail("")
        setError(null)
        setSuccess(false)
        router.refresh()
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [success, open, router])

  useEffect(() => {
    if (!success || !open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        setOpen(false)
        setEmail("")
        setError(null)
        setSuccess(false)
        router.refresh()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [success, open, router])

  async function handleInvite() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/dashboard/teams/${teamId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hackathonId, email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send invitation")
        return
      }

      setSuccess(true)
    } catch {
      setError("Failed to send invitation")
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen)
    if (!isOpen) {
      setEmail("")
      setError(null)
      if (success) {
        setSuccess(false)
        router.refresh()
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && isValidEmail && !loading) {
      e.preventDefault()
      handleInvite()
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="size-4 mr-2" />
          Invite Member
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        {success ? (
          <>
            <AlertDialogTitle className="sr-only">Invitation sent</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Invitation sent to {email}
            </AlertDialogDescription>
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="animate-in zoom-in-50 fade-in duration-300 rounded-full bg-primary/10 p-3">
                <Check className="size-5 text-primary" strokeWidth={2.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Invitation sent</p>
                <p className="text-sm text-muted-foreground mt-1">{email}</p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogAction className="relative overflow-hidden" onClick={() => handleOpenChange(false)}>
                <span
                  className="absolute inset-0 origin-left bg-primary-foreground/20 transition-none"
                  style={{ transform: `scaleX(${progressValue / 100})` }}
                />
                <span className="relative">Done</span>
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Invite Team Member</AlertDialogTitle>
              <AlertDialogDescription>
                Send an email invitation to join &quot;{teamName}&quot;.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (isValidEmail && !loading) handleInvite()
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            >
              <div className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    ref={emailInputRef}
                    id="email"
                    type="email"
                    placeholder="teammate@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                This person will be added to your team and count toward the {maxTeamSize}-member limit.
              </p>

              <AlertDialogFooter className="mt-4">
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                <Button type="submit" disabled={!isValidEmail || loading}>
                  {loading ? "Sending..." : "Send Invitation"}
                </Button>
              </AlertDialogFooter>
            </form>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
