"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEventLifecycleClock } from "@/hooks/use-event-lifecycle-clock"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { assertOkJson } from "@/lib/utils/fetch"
import {
  canPrepareMentorRequest,
  createAttendeeMentorWebMcpTools,
  type MyMentorRequest,
} from "@/lib/webmcp/mentor-tools"

type AttendeeMentorWebMcpProps = {
  slug: string
  status: HackathonStatus
  startsAt: string | null
  endsAt: string | null
  isParticipant: boolean
  teamStatus: string | null
}

type MentorRequestResponse = {
  request: MyMentorRequest | null
}

export function AttendeeMentorWebMcp({
  slug,
  status,
  startsAt,
  endsAt,
  isParticipant,
  teamStatus,
}: AttendeeMentorWebMcpProps) {
  const router = useRouter()
  const [request, setRequest] = useState<MyMentorRequest | null>(null)
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null)
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitPending = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const { effectiveStatus, nowIso } = useEventLifecycleClock({
    status,
    startsAt,
    endsAt,
  })

  useEffect(() => {
    if (!isParticipant) return
    const controller = new AbortController()
    fetch(`/api/public/hackathons/${slug}/mentor-request/me`, {
      signal: controller.signal,
    })
      .then(assertOkJson<MentorRequestResponse>)
      .then((result) => {
        setRequest(result.request)
        setLoadedSlug(slug)
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : "We couldn't check the queue.")
      })
    return () => controller.abort()
  }, [isParticipant, slug])

  const requestIsLoaded = loadedSlug === slug
  const eventOpen = nowIso !== null && (
    !endsAt ||
    !Number.isFinite(Date.parse(endsAt)) ||
    Date.parse(nowIso) < Date.parse(endsAt)
  )
  const canPrepare = canPrepareMentorRequest({
    requestLoaded: requestIsLoaded,
    request,
    isParticipant,
    status: effectiveStatus,
    teamStatus,
    eventOpen,
  })
  const tools = useMemo(
    () =>
      isParticipant && requestIsLoaded
        ? createAttendeeMentorWebMcpTools({
            getRequest: () => request,
            canPrepare,
            onPrepare: (input) => {
              setCategory(input.category ?? "")
              setDescription(input.description ?? "")
              setError(null)
              setDialogOpen(true)
            },
          })
        : [],
    [canPrepare, isParticipant, request, requestIsLoaded],
  )
  useWebMcpTools(tools)

  async function submitRequest() {
    if (submitPending.current) return
    if (!category.trim() && !description.trim()) {
      setError("Add a short topic or note.")
      return
    }

    submitPending.current = true
    setIsSubmitting(true)
    const previous = request
    const optimistic: MyMentorRequest = {
      category: category.trim() || null,
      description: description.trim() || null,
      status: "open",
      createdAt: new Date().toISOString(),
    }
    setRequest(optimistic)
    setDialogOpen(false)
    setError(null)

    try {
      const result = await fetch(`/api/public/hackathons/${slug}/mentor-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim() || undefined,
          description: description.trim() || undefined,
        }),
      }).then(assertOkJson<MentorRequestResponse>)
      setRequest(result.request)
      router.refresh()
    } catch (submitError) {
      setRequest(previous)
      setError(
        submitError instanceof Error ? submitError.message : "We couldn't ask a mentor.",
      )
      setDialogOpen(true)
    } finally {
      submitPending.current = false
      setIsSubmitting(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      void submitRequest()
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask a mentor</DialogTitle>
          <DialogDescription>Review your note. Nothing is sent until you click Ask mentor.</DialogDescription>
        </DialogHeader>
        <form
          autoComplete="off"
          className="space-y-4"
          onKeyDown={handleKeyDown}
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="space-y-2">
            <Label htmlFor="mentor-category">What do you need help with?</Label>
            <Input
              id="mentor-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              maxLength={80}
              autoFocus
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mentor-description">Add a note</Label>
            <Textarea
              id="mentor-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2_000}
              rows={4}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={submitRequest}>
            {isSubmitting ? "Asking..." : "Ask mentor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
