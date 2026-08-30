"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { FlaskConical, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { assertOkJson } from "@/lib/utils/fetch"
import { OPEN_TEST_EVENT_CONVERSION_EVENT } from "@/lib/webmcp/test-event-actions"

type ConversionResponse = {
  id: string
  slug: string
  status: "draft"
  isTestEvent: false
}

export function TestEventBanner({ hackathonId }: { hackathonId: string }) {
  const router = useRouter()
  const { orgId } = useAuth()
  const [open, setOpen] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const openReview = () => setOpen(true)
    window.addEventListener(OPEN_TEST_EVENT_CONVERSION_EVENT, openReview)
    return () => window.removeEventListener(OPEN_TEST_EVENT_CONVERSION_EVENT, openReview)
  }, [])

  async function convert() {
    if (isConverting || !orgId) return
    setIsConverting(true)
    setError(null)
    try {
      await fetch(`/api/dashboard/hackathons/${encodeURIComponent(hackathonId)}/convert-test-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedOrganizationId: orgId }),
      }).then(assertOkJson<ConversionResponse>)
      setOpen(false)
      router.refresh()
    } catch (conversionError) {
      setError(conversionError instanceof Error
        ? conversionError.message
        : "We couldn't make this a real event. Try again.")
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <Alert>
      <FlaskConical className="size-4" />
      <AlertTitle>Test event</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          This event uses fake people and projects. It&apos;s private, and emails are off.
        </span>
        <AlertDialog open={open} onOpenChange={(nextOpen) => {
          if (!isConverting) setOpen(nextOpen)
          if (!nextOpen) setError(null)
        }}>
          <AlertDialogTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              Make this a real event
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Make this a real event?</AlertDialogTitle>
              <AlertDialogDescription>
                We&apos;ll remove everyone, all teams, projects, judges, invites, and scores from this test event. Event setup stays. The event goes back to a private draft.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isConverting}>Keep it as a test</AlertDialogCancel>
              <AlertDialogAction
                disabled={isConverting || !orgId}
                onClick={(event) => {
                  event.preventDefault()
                  void convert()
                }}
              >
                {isConverting && <Loader2 className="size-4 animate-spin" />}
                {isConverting ? "Removing test data…" : "Make it real"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AlertDescription>
    </Alert>
  )
}
