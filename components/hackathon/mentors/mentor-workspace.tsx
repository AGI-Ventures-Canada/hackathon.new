"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import { assertOkJson } from "@/lib/utils/fetch"
import {
  createMentorQueueWebMcpTools,
  createPublicMentorWebMcpTools,
  type MentorQueueWebMcpItem,
  type MentorQueueWebMcpSnapshot,
} from "@/lib/webmcp/mentor-tools"

const emptySubscribe = () => () => {}

function mutableValue<T>(initialValue: T) {
  let value = initialValue
  return {
    get: () => value,
    set: (nextValue: T) => {
      value = nextValue
    },
  }
}

type QueueStats = {
  open: number
  claimed: number
  resolved: number
}

type MentorWorkspaceProps = {
  slug: string
  status: string
  stats: QueueStats
  isMentor: boolean
  initialRequests: MentorQueueWebMcpItem[]
  initialTotal: number
  initialTruncated: boolean
}

type ReviewAction = {
  requestId: string
  action: "claim" | "resolve"
}

type PendingAction = ReviewAction & {
  request: MentorQueueWebMcpItem
  index: number
}

function timeElapsed(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function MentorWorkspace({
  slug,
  status,
  stats,
  isMentor,
  initialRequests,
  initialTotal,
  initialTruncated,
}: MentorWorkspaceProps) {
  const router = useRouter()
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const initialQueue = useMemo(
    () => ({
      requests: initialRequests,
      total: Math.max(initialTotal, initialRequests.length),
      truncated: initialTruncated || initialTotal > initialRequests.length,
    }),
    [initialRequests, initialTotal, initialTruncated],
  )
  const [queue, setQueue] = useState<MentorQueueWebMcpSnapshot>(initialQueue)
  const [queueStore] = useState(() => mutableValue(initialQueue))
  const [statsStore] = useState(() => mutableValue(stats))
  const [review, setReview] = useState<ReviewAction | null>(null)
  const [pendingRequestIds, setPendingRequestIds] = useState<Set<string>>(
    () => new Set(),
  )
  const pendingActions = useRef(new Map<string, PendingAction>())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (pendingActions.current.size > 0) return
    queueStore.set(initialQueue)
    setQueue(initialQueue)
  }, [initialQueue, queueStore])

  useEffect(() => {
    statsStore.set(stats)
  }, [stats, statsStore])

  const openReview = useCallback((requestId: string, action: "claim" | "resolve"): boolean => {
    if (pendingActions.current.has(requestId)) return false

    const request = queueStore.get().requests.find((item) => item.id === requestId)
    if (!request) return false
    if (action === "claim" && request.status !== "open") return false
    if (action === "resolve" && (request.status !== "claimed" || !request.claimedByMe)) {
      return false
    }

    setError(null)
    setReview({ requestId, action })
    return true
  }, [queueStore])

  const mentorTools = useMemo(
    () =>
      createMentorQueueWebMcpTools({
        getQueue: queueStore.get,
        onReview: openReview,
      }),
    [openReview, queueStore],
  )
  const publicTools = useMemo(
    () => createPublicMentorWebMcpTools(statsStore.get),
    [statsStore],
  )
  const tools = useMemo(
    () =>
      isMentor
        ? status === "active"
          ? mentorTools
          : mentorTools.filter(
              (tool) => tool.name === "get_mentor_queue" || tool.name === "get_mentor_request",
            )
        : publicTools,
    [isMentor, mentorTools, publicTools, status],
  )
  useWebMcpTools(tools)

  const reviewedRequest = review
    ? queue.requests.find((request) => request.id === review.requestId) ?? null
    : null

  function setRequestPending(requestId: string, pending: boolean) {
    setPendingRequestIds((current) => {
      const next = new Set(current)
      if (pending) next.add(requestId)
      else next.delete(requestId)
      return next
    })
  }

  async function confirmAction() {
    if (!review) return

    const current = queueStore.get()
    const index = current.requests.findIndex((request) => request.id === review.requestId)
    const request = current.requests[index]
    if (!request || pendingActions.current.has(request.id)) return

    const pendingAction: PendingAction = { ...review, request, index }
    pendingActions.current.set(request.id, pendingAction)
    setRequestPending(request.id, true)

    const requests =
      review.action === "claim"
        ? current.requests.map((item) =>
            item.id === request.id
              ? { ...item, status: "claimed" as const, claimedByMe: true }
              : item,
          )
        : current.requests.filter((item) => item.id !== request.id)
    const total = review.action === "resolve" ? Math.max(0, current.total - 1) : current.total
    const optimistic = {
      requests,
      total,
      truncated: total > requests.length,
    }

    queueStore.set(optimistic)
    setQueue(optimistic)
    setReview(null)
    setError(null)

    try {
      await fetch(
        `/api/public/hackathons/${slug}/mentor-request/${request.id}/${review.action}`,
        { method: "POST" },
      ).then(assertOkJson<{ success: true }>)
      router.refresh()
    } catch (actionError) {
      const latest = queueStore.get()
      let requests = latest.requests
      const existingIndex = requests.findIndex((item) => item.id === request.id)
      if (existingIndex >= 0) {
        requests = requests.map((item) => item.id === request.id ? request : item)
      } else {
        requests = [...requests]
        requests.splice(Math.min(index, requests.length), 0, request)
      }
      const total = review.action === "resolve" ? latest.total + 1 : latest.total
      const reverted = {
        requests,
        total,
        truncated: total > requests.length,
      }
      queueStore.set(reverted)
      setQueue(reverted)
      setError(
        actionError instanceof Error
          ? actionError.message
          : "We couldn't update this request.",
      )
    } finally {
      pendingActions.current.delete(request.id)
      setRequestPending(request.id, false)
    }
  }

  if (!isMentor) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Waiting</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.open}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Being helped</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.claimed}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Finished</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.resolved}</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Badge variant="secondary">{queue.total} in queue</Badge>
        {status !== "active" && (
          <p className="text-sm text-muted-foreground">Mentor help isn&apos;t open now.</p>
        )}
      </div>

      {queue.truncated && (
        <p className="text-sm text-muted-foreground">
          Showing the first {queue.requests.length} requests.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {queue.requests.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No open requests</p>
      ) : (
        <div className="space-y-3">
          {queue.requests.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {request.category && <Badge variant="outline">{request.category}</Badge>}
                    <Badge variant="secondary">
                      {request.status === "open" ? "Waiting" : "Being helped"}
                    </Badge>
                  </div>
                  {request.teamName && <p className="text-sm font-medium">{request.teamName}</p>}
                  {request.description && (
                    <p className="text-sm text-muted-foreground">{request.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {isClient ? timeElapsed(request.createdAt) : "Waiting"}
                  </p>
                </div>
                {status === "active" && (
                  <div className="shrink-0">
                    {request.status === "open" ? (
                      <Button
                        variant="outline"
                        disabled={pendingRequestIds.has(request.id)}
                        onClick={() => openReview(request.id, "claim")}
                      >
                        {pendingRequestIds.has(request.id) ? "Updating..." : "Review claim"}
                      </Button>
                    ) : request.claimedByMe ? (
                      <Button
                        variant="outline"
                        disabled={pendingRequestIds.has(request.id)}
                        onClick={() => openReview(request.id, "resolve")}
                      >
                        {pendingRequestIds.has(request.id) ? "Updating..." : "Review finish"}
                      </Button>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {review?.action === "claim" ? "Claim this request?" : "Finish this request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {review?.action === "claim"
                ? "You'll take this request. Other mentors will see it's claimed."
                : "This removes the request from the open queue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(reviewedRequest && pendingRequestIds.has(reviewedRequest.id))}
              onClick={confirmAction}
            >
              {review?.action === "claim" ? "Claim request" : "Finish request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
