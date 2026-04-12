"use client"

import { useState, useImperativeHandle, forwardRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MarkdownEditor } from "@/components/ui/markdown-editor"
import type { ScheduleItem } from "@/lib/services/schedule-items"

export type ChallengeDialogsHandle = {
  openChallengeDialog: () => void
  openReleaseDialog: () => void
}

type Props = {
  hackathonId: string
  challengeExists: boolean
  scheduleItems: ScheduleItem[]
  startsAt: string | null
  onChallengeCreated?: () => void
  onChallengeReleased?: () => void
}

export const ChallengeDialogs = forwardRef<ChallengeDialogsHandle, Props>(
  function ChallengeDialogs({ hackathonId, challengeExists, scheduleItems, startsAt, onChallengeCreated, onChallengeReleased }, ref) {
    const router = useRouter()
    const challengeReleaseItem = scheduleItems.find((s) => s.trigger_type === "challenge_release")
    const defaultReleaseTime = challengeReleaseItem?.starts_at ? new Date(challengeReleaseItem.starts_at) : null
    const defaultLinkedToEventStart = challengeReleaseItem?.linked_to === "event_start"

    const [challengeDialogOpen, setChallengeDialogOpen] = useState(false)
    const [challengeTitle, setChallengeTitle] = useState("")
    const [challengeBody, setChallengeBody] = useState("")
    const [challengeReleaseAt, setChallengeReleaseAt] = useState<Date | null>(defaultReleaseTime)
    const [linkedToEventStart, setLinkedToEventStart] = useState(defaultLinkedToEventStart)
    const [challengeSaving, setChallengeSaving] = useState(false)
    const [challengeError, setChallengeError] = useState<string | null>(null)
    const [challengeSaved, setChallengeSaved] = useState(false)
    const [challengeExistsLocal, setChallengeExistsLocal] = useState(challengeExists)

    const [releaseDialogOpen, setReleaseDialogOpen] = useState(false)
    const [releasing, setReleasing] = useState(false)
    const [releaseSuccess, setReleaseSuccess] = useState(false)
    const [releaseError, setReleaseError] = useState<string | null>(null)

    async function openChallengeDialog() {
      setChallengeError(null)
      setChallengeSaved(false)
      setChallengeReleaseAt(defaultReleaseTime)
      setLinkedToEventStart(defaultLinkedToEventStart)
      if (challengeExistsLocal) {
        try {
          const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/challenge`)
          if (res.ok) {
            const data = await res.json()
            setChallengeTitle(data.title ?? "")
            setChallengeBody(data.body ?? "")
          }
        } catch {
          // Fall through with empty fields
        }
      } else {
        setChallengeTitle("")
        setChallengeBody("")
      }
      setChallengeDialogOpen(true)
    }

    async function handleChallengeSave() {
      if (!challengeTitle.trim()) return
      setChallengeSaving(true)
      setChallengeError(null)
      try {
        const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/challenge`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: challengeTitle, body: challengeBody }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Failed to save challenge")
        }
        if (challengeReleaseItem) {
          const releaseTime = linkedToEventStart && startsAt ? startsAt : challengeReleaseAt?.toISOString()
          if (releaseTime) {
            await fetch(`/api/dashboard/hackathons/${hackathonId}/schedule/${challengeReleaseItem.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: "Challenge Release",
                startsAt: releaseTime,
                linkedTo: linkedToEventStart ? "event_start" : null,
              }),
            })
          }
        }
        setChallengeExistsLocal(true)
        setChallengeSaved(true)
        onChallengeCreated?.()
        setTimeout(() => {
          setChallengeDialogOpen(false)
          setChallengeSaved(false)
        }, 1500)
        router.refresh()
      } catch (err) {
        setChallengeError(err instanceof Error ? err.message : "Failed to save challenge")
      } finally {
        setChallengeSaving(false)
      }
    }

    async function handleChallengeRelease() {
      setReleasing(true)
      setReleaseError(null)
      try {
        const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/challenge/release`, { method: "POST" })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Failed to release challenge")
        }
        setReleaseSuccess(true)
        onChallengeReleased?.()
        router.refresh()
        setTimeout(() => {
          setReleaseDialogOpen(false)
          setReleaseSuccess(false)
        }, 1500)
      } catch (err) {
        setReleaseError(err instanceof Error ? err.message : "Failed to release challenge")
      } finally {
        setReleasing(false)
      }
    }

    function handleChallengeKeyDown(e: React.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !challengeSaving) {
        e.preventDefault()
        handleChallengeSave()
      }
    }

    useImperativeHandle(ref, () => ({
      openChallengeDialog,
      openReleaseDialog: () => {
        setReleaseError(null)
        setReleaseDialogOpen(true)
      },
    }))

    return (
      <>
        <Dialog open={challengeDialogOpen} onOpenChange={setChallengeDialogOpen}>
          <DialogContent onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{challengeExistsLocal ? "Edit Challenge" : "Create Challenge"}</DialogTitle>
            </DialogHeader>
            {challengeSaved ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <CheckCircle2 className="size-8 text-primary" />
                <p className="text-sm font-medium">Challenge saved</p>
                <p className="text-xs text-muted-foreground">
                  {linkedToEventStart
                    ? "Releases when the event starts"
                    : challengeReleaseAt
                      ? `Releases ${challengeReleaseAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : null}
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); handleChallengeSave() }}
                onKeyDown={handleChallengeKeyDown}
                autoComplete="off"
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="challenge-title">Title</Label>
                  <Input
                    id="challenge-title"
                    name="challenge-title"
                    value={challengeTitle}
                    onChange={(e) => setChallengeTitle(e.target.value)}
                    placeholder="Challenge title"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="challenge-body">Description</Label>
                  <MarkdownEditor
                    id="challenge-body"
                    value={challengeBody}
                    onChange={setChallengeBody}
                    placeholder="Describe the challenge in detail..."
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">Supports markdown: **bold**, _italic_, ## headings, lists, and [links](url)</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Release time</Label>
                    {startsAt && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setLinkedToEventStart(!linkedToEventStart)}
                      >
                        {linkedToEventStart ? "Use custom time" : "Use event start"}
                      </Button>
                    )}
                  </div>
                  {linkedToEventStart && startsAt ? (
                    <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      Releases when the event starts ({new Date(startsAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})
                    </p>
                  ) : (
                    <DateTimePicker
                      value={challengeReleaseAt}
                      onChange={setChallengeReleaseAt}
                      placeholder="When should participants see this?"
                    />
                  )}
                </div>
                {challengeError && <p className="text-destructive text-xs">{challengeError}</p>}
                <Button type="submit" disabled={challengeSaving || !challengeTitle.trim()} className="w-full">
                  {challengeSaving && <Loader2 className="animate-spin" />}
                  Save Challenge
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={releaseDialogOpen} onOpenChange={(open) => { if (!releaseSuccess) setReleaseDialogOpen(open) }}>
          <AlertDialogContent>
            {releaseSuccess ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <CheckCircle2 className="size-8 text-primary" />
                <p className="text-sm font-medium">Challenge released</p>
                <p className="text-xs text-muted-foreground">Participants can now see the challenge</p>
              </div>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Release challenge to participants?</AlertDialogTitle>
                  <AlertDialogDescription>Once released, participants will see the challenge on the event page. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                {releaseError && <p className="text-destructive text-xs">{releaseError}</p>}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={releasing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={(e) => { e.preventDefault(); handleChallengeRelease() }} disabled={releasing}>
                    {releasing ? "Releasing..." : "Release"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  },
)
