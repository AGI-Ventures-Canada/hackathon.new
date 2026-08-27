"use client"

import { useState, useEffect, useRef } from "react"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, CheckCircle2, Send, Eye, ThumbsUp, ThumbsDown, Plus, Pencil, Trash2, Megaphone, Zap, MessageCircle, Share2, Mail } from "lucide-react"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import type {
  Announcement,
  AnnouncementAudience,
} from "@/lib/services/announcements"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { useIsClient } from "@/hooks/use-is-client"

type MentorQueueStats = {
  open: number
  claimed: number
  resolved: number
}

type SocialSubmission = {
  id: string
  url: string
  platform: string | null
  og_title: string | null
  og_image_url: string | null
  status: "pending" | "approved" | "rejected"
  created_at: string
}

type EmailResult = {
  sent: number
  failed: number
}

const EMAIL_AUDIENCE_ROLES = ["participant", "judge", "mentor"] as const
type EmailAudienceRole = (typeof EMAIL_AUDIENCE_ROLES)[number]

type PendingEmailOperation = {
  version: 1
  deliveryId: string
  subject: string
  html: string
  roles: EmailAudienceRole[]
}

function pendingEmailOperationKey(hackathonId: string): string {
  return `oatmeal:email-blast:pending:${hackathonId}`
}

function getEmailOperationStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function isPendingEmailOperation(value: unknown): value is PendingEmailOperation {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<PendingEmailOperation>
  return candidate.version === 1 &&
    typeof candidate.deliveryId === "string" &&
    candidate.deliveryId.length > 0 &&
    candidate.deliveryId.length <= 200 &&
    typeof candidate.subject === "string" &&
    candidate.subject.trim().length > 0 &&
    candidate.subject.length <= 200 &&
    typeof candidate.html === "string" &&
    candidate.html.trim().length > 0 &&
    candidate.html.length <= 100_000 &&
    Array.isArray(candidate.roles) &&
    candidate.roles.every((role) => EMAIL_AUDIENCE_ROLES.includes(role))
}

function loadPendingEmailOperation(hackathonId: string): PendingEmailOperation | null {
  const storage = getEmailOperationStorage()
  if (!storage) return null
  const key = pendingEmailOperationKey(hackathonId)
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isPendingEmailOperation(parsed)) return parsed
    storage.removeItem(key)
    return null
  } catch {
    try {
      storage.removeItem(key)
    } catch {}
    return null
  }
}

function savePendingEmailOperation(
  hackathonId: string,
  operation: PendingEmailOperation,
): boolean {
  const storage = getEmailOperationStorage()
  if (!storage) return false
  try {
    storage.setItem(pendingEmailOperationKey(hackathonId), JSON.stringify(operation))
    return true
  } catch {
    return false
  }
}

function clearPendingEmailOperation(hackathonId: string): void {
  const storage = getEmailOperationStorage()
  if (!storage) return
  try {
    storage.removeItem(pendingEmailOperationKey(hackathonId))
  } catch {}
}

interface EventTabContentProps {
  hackathonId: string
  activeEtab: string
  hackathonStatus: HackathonStatus
  hackathonPhase: HackathonPhase | null
}

function formatDate(dateStr: string, timeZone?: string): string {
  const date = new Date(dateStr)
  const locale = timeZone ? "en-US" : undefined
  const dateLabel = date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  })
  const timeLabel = date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })
  return `${dateLabel}, ${timeLabel}`
}

export function AnnouncementDateLabel({
  label,
  date,
}: {
  label: "Created" | "Sent"
  date: string
}) {
  const isClient = useIsClient()
  return <>{label} {formatDate(date, isClient ? undefined : "UTC")}</>
}

function MentorsSubTab({ hackathonId }: { hackathonId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<MentorQueueStats | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetch(
          `/api/dashboard/hackathons/${hackathonId}/mentor-requests`,
        ).then(assertOkJson<{ stats: MentorQueueStats }>)
        if (cancelled) return
        setStats(data.stats)
      } catch {
        if (!cancelled) setError("Failed to load mentor requests")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [hackathonId])

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
  }

  if (error) {
    return <div className="rounded-lg border p-8 text-center text-destructive">{error}</div>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Waiting</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{stats?.open ?? 0}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Being helped</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{stats?.claimed ?? 0}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Finished</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{stats?.resolved ?? 0}</CardContent>
      </Card>
    </div>
  )
}

function SocialSubTab({ hackathonId }: { hackathonId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<SocialSubmission[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/social-submissions`)
        if (!res.ok) throw new Error("Failed to load social submissions")
        const data = await res.json()
        if (cancelled) return
        setSubmissions(data.submissions)
      } catch {
        if (!cancelled) setError("Failed to load social submissions")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [hackathonId])

  function handleReview(submissionId: string, status: "approved" | "rejected") {
    const previous = submissions.find((s) => s.id === submissionId)?.status ?? "pending"
    setSubmissions((prev) =>
      prev.map((s) => (s.id === submissionId ? { ...s, status } : s))
    )
    fetch(`/api/dashboard/hackathons/${hackathonId}/social-submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
      .then(assertOk)
      .catch(() => {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === submissionId ? { ...s, status: previous } : s))
        )
        setError("Failed to review submission")
      })
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
  }

  if (error) {
    return <div className="rounded-lg border p-8 text-center text-destructive">{error}</div>
  }

  if (submissions.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <Share2 className="size-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No social submissions yet</p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Social Submissions</CardTitle>
        <CardDescription>{submissions.length} submission{submissions.length !== 1 ? "s" : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {submissions.map((sub) => (
            <div key={sub.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 min-w-0">
                {sub.og_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sub.og_image_url}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded object-cover bg-muted"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {sub.og_title ?? sub.url}
                  </p>
                  <a
                    href={sub.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:underline truncate block"
                  >
                    {sub.url}
                  </a>
                  <div className="mt-1 flex items-center gap-2">
                    {sub.platform && <Badge variant="outline">{sub.platform}</Badge>}
                    <Badge
                      variant={
                        sub.status === "approved"
                          ? "secondary"
                          : sub.status === "rejected"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {sub.status}
                    </Badge>
                  </div>
                </div>
              </div>
              {sub.status === "pending" && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReview(sub.id, "approved")}
                  >
                    <ThumbsUp />
                    <span className="hidden sm:inline">Approve</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReview(sub.id, "rejected")}
                  >
                    <ThumbsDown />
                    <span className="hidden sm:inline">Reject</span>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function EmailSubTab({ hackathonId }: { hackathonId: string }) {
  const [subject, setSubject] = useState("")
  const [html, setHtml] = useState("")
  const [roles, setRoles] = useState<Record<EmailAudienceRole, boolean>>({
    participant: false,
    judge: false,
    mentor: false,
  })
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EmailResult | null>(null)
  const deliveryIdRef = useRef<string | null>(null)
  const sendInFlightRef = useRef(false)

  useEffect(() => {
    deliveryIdRef.current = null
    const pending = loadPendingEmailOperation(hackathonId)
    if (!pending) return
    deliveryIdRef.current = pending.deliveryId
    setSubject(pending.subject)
    setHtml(pending.html)
    setRoles({
      participant: pending.roles.includes("participant"),
      judge: pending.roles.includes("judge"),
      mentor: pending.roles.includes("mentor"),
    })
  }, [hackathonId])

  const selectedRoles = EMAIL_AUDIENCE_ROLES.filter((role) => roles[role])

  const recipientLabel = selectedRoles.length > 0
    ? selectedRoles.map((r) => `${r}s`).join(", ")
    : "all participants"

  async function handleSend() {
    if (sendInFlightRef.current || !subject.trim() || !html.trim()) return
    setConfirmOpen(false)
    const deliveryId = deliveryIdRef.current ?? crypto.randomUUID()
    const operation: PendingEmailOperation = {
      version: 1,
      deliveryId,
      subject,
      html,
      roles: [...selectedRoles],
    }
    if (!savePendingEmailOperation(hackathonId, operation)) {
      setError("Turn on browser storage so we can safely send this email.")
      return
    }
    deliveryIdRef.current = deliveryId
    sendInFlightRef.current = true
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/email-blast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": deliveryId,
        },
        body: JSON.stringify({
          subject: operation.subject,
          html: operation.html,
          recipientFilter: operation.roles.length > 0 ? operation.roles : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to send emails")
      }
      const data: EmailResult = await res.json()
      setResult(data)
      if (data.failed === 0) {
        clearPendingEmailOperation(hackathonId)
        deliveryIdRef.current = null
        setSubject("")
        setHtml("")
        setRoles({ participant: false, judge: false, mentor: false })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send emails")
    } finally {
      sendInFlightRef.current = false
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending && subject.trim() && html.trim()) {
      e.preventDefault()
      setConfirmOpen(true)
    }
  }

  function toggleRole(role: EmailAudienceRole) {
    if (sending) return
    if (deliveryIdRef.current) {
      deliveryIdRef.current = null
      clearPendingEmailOperation(hackathonId)
    }
    setRoles((prev) => ({ ...prev, [role]: !prev[role] }))
  }

  function clearDeliveryIdentity() {
    if (!deliveryIdRef.current) return
    deliveryIdRef.current = null
    clearPendingEmailOperation(hackathonId)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Blast</CardTitle>
        <CardDescription>Send an email to all or filtered participants</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!sending && !sendInFlightRef.current) setConfirmOpen(true)
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              name="email-subject"
              value={subject}
              onChange={(e) => {
                clearDeliveryIdentity()
                setSubject(e.target.value)
              }}
              placeholder="Email subject line"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              autoFocus
              disabled={sending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">HTML Body</Label>
            <Textarea
              id="email-body"
              name="email-body"
              value={html}
              onChange={(e) => {
                clearDeliveryIdentity()
                setHtml(e.target.value)
              }}
              placeholder="<h1>Hello!</h1><p>Your email content here...</p>"
              rows={10}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              disabled={sending}
            />
          </div>
          <div className="space-y-2">
            <Label>Send to</Label>
            <div className="flex flex-wrap gap-4">
              {EMAIL_AUDIENCE_ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${role}`}
                    checked={roles[role]}
                    onCheckedChange={() => toggleRole(role)}
                    disabled={sending}
                  />
                  <Label htmlFor={`role-${role}`} className="capitalize">
                    {role}s
                  </Label>
                </div>
              ))}
            </div>
            {selectedRoles.length === 0 && (
              <p className="text-xs text-muted-foreground">No filter selected — sends to everyone</p>
            )}
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
          {result && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <CheckCircle2 className="size-4 text-muted-foreground shrink-0" />
              <span className="text-xs">
                {result.sent} sent{result.failed > 0 ? `, ${result.failed} failed` : ""}
              </span>
            </div>
          )}
          <Button type="submit" disabled={sending || !subject.trim() || !html.trim()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send
          </Button>
        </form>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send email to {recipientLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                Subject: &quot;{subject}&quot;. This will send immediately and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSend} disabled={sending}>
                Send Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

type AnnouncementData = Announcement

type SuggestedAnnouncement = {
  title: string
  body: string
  priority: "normal" | "urgent"
}

function getSuggestedAnnouncements(status: HackathonStatus, phase: HackathonPhase | null): SuggestedAnnouncement[] {
  const suggestions: SuggestedAnnouncement[] = []
  if (status === "registration_open") {
    suggestions.push({ title: "Registration is open!", body: "Sign up now to secure your spot. We can't wait to see what you build!", priority: "normal" })
    suggestions.push({ title: "Last chance to register", body: "Registration closes soon. Don't miss out — sign up before it's too late!", priority: "urgent" })
  }
  if (status === "active") {
    if (phase === "build") {
      suggestions.push({ title: "Hacking has begun!", body: "The clock is ticking. Start building your project and don't forget to ask mentors for help!", priority: "normal" })
      suggestions.push({ title: "Halfway through!", body: "You're halfway there. Make sure your project is on track and start thinking about your presentation.", priority: "normal" })
    }
    if (phase === "submission_open") {
      suggestions.push({ title: "Submissions are open", body: "You can now submit your project. Make sure to include a demo link and description.", priority: "normal" })
      suggestions.push({ title: "Submission deadline approaching", body: "Time is running out! Submit your project before the deadline.", priority: "urgent" })
    }
  }
  if (status === "judging") {
    suggestions.push({ title: "Judging has started", body: "Our judges are reviewing all submissions. Results will be announced soon!", priority: "normal" })
    if (phase === "finals") {
      suggestions.push({ title: "Finals round underway", body: "The finalists have been selected and are presenting to our judges. Stay tuned for results!", priority: "normal" })
    }
  }
  if (status === "completed") {
    suggestions.push({ title: "Results are in!", body: "Thank you to everyone who participated. Check the results page to see the winners!", priority: "normal" })
    suggestions.push({ title: "Thank you!", body: "What an incredible event. Thank you to all participants, judges, mentors, and sponsors for making this possible.", priority: "normal" })
  }
  return suggestions
}

function AnnouncementsSubTab({ hackathonId, hackathonStatus, hackathonPhase }: { hackathonId: string; hackathonStatus: HackathonStatus; hackathonPhase: HackathonPhase | null }) {
  const actionItems = useActionItemsOptional()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localItems, setLocalItems] = useState<AnnouncementData[]>([])
  const items = actionItems?.manageWebMcpView.announcements ?? localItems
  const hasSharedAnnouncements = actionItems !== null
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  function replaceItems(next: AnnouncementData[]) {
    itemsRef.current = next
    if (actionItems) {
      actionItems.replaceManageAnnouncements(next)
    } else {
      setLocalItems(next)
    }
  }
  function updateItems(update: (items: AnnouncementData[]) => AnnouncementData[]) {
    replaceItems(update(itemsRef.current))
  }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AnnouncementData | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [priority, setPriority] = useState<"normal" | "urgent">("normal")
  const [audience, setAudience] = useState<AnnouncementAudience>("everyone")
  const tempIdCounter = useRef(0)

  const suggestions = getSuggestedAnnouncements(hackathonStatus, hackathonPhase)
  const published = items.filter((i) => i.published_at)
  const drafts = items.filter((i) => !i.published_at)

  useEffect(() => {
    if (hasSharedAnnouncements) {
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/announcements`)
        if (!res.ok) throw new Error("Failed to load")
        const data = await res.json()
        if (!cancelled) setLocalItems(data.announcements)
      } catch {
        if (!cancelled) setError("Failed to load announcements")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [hackathonId, hasSharedAnnouncements])

  function openCreate() {
    setEditing(null)
    setTitle("")
    setBody("")
    setPriority("normal")
    setAudience("everyone")
    setError(null)
    setDialogOpen(true)
  }

  function openFromSuggestion(suggestion: SuggestedAnnouncement) {
    setEditing(null)
    setTitle(suggestion.title)
    setBody(suggestion.body)
    setPriority(suggestion.priority)
    setAudience("everyone")
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(item: AnnouncementData) {
    setEditing(item)
    setTitle(item.title)
    setBody(item.body)
    setPriority(item.priority)
    setAudience((item.audience as AnnouncementAudience) || "everyone")
    setError(null)
    setDialogOpen(true)
  }

  function handleSave(publish: boolean) {
    if (!title.trim() || !body.trim()) return
    setError(null)
    setDialogOpen(false)

    if (editing) {
      const prev = items.find((i) => i.id === editing.id)
      updateItems((old) => old.map((i) => (i.id === editing.id ? { ...i, title, body, priority, audience } : i)))
      fetch(`/api/dashboard/hackathons/${hackathonId}/announcements/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, priority, audience }),
      })
        .then(assertOkJson<AnnouncementData>)
        .then((saved) => updateItems((old) => old.map((i) => (i.id === saved.id ? saved : i))))
        .catch((err) => {
          if (prev) updateItems((old) => old.map((i) => (i.id === editing.id ? prev : i)))
          setError(err instanceof Error ? err.message : "Failed to save announcement")
        })
    } else {
      const tempId = `temp-${++tempIdCounter.current}`
      const optimistic: AnnouncementData = {
        id: tempId,
        hackathon_id: hackathonId,
        title,
        body,
        priority,
        audience,
        published_at: publish ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      updateItems((old) => [optimistic, ...old])
      fetch(`/api/dashboard/hackathons/${hackathonId}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, priority, audience }),
      })
        .then(assertOkJson<AnnouncementData>)
        .then(async (created) => {
          if (publish) {
            try {
              const published = await fetch(`/api/dashboard/hackathons/${hackathonId}/announcements/${created.id}/publish`, { method: "POST" }).then(assertOkJson<AnnouncementData>)
              updateItems((old) => old.map((i) => (i.id === tempId ? published : i)))
            } catch {
              updateItems((old) => old.map((i) => (i.id === tempId ? created : i)))
              setError("Saved as draft — couldn't publish. Try publishing again.")
            }
          } else {
            updateItems((old) => old.map((i) => (i.id === tempId ? created : i)))
          }
        })
        .catch((err) => {
          updateItems((old) => old.filter((i) => i.id !== tempId))
          setError(err instanceof Error ? err.message : "Failed to save announcement")
        })
    }
  }

  function handleDelete(id: string) {
    const index = items.findIndex((i) => i.id === id)
    const prev = index >= 0 ? items[index] : null
    updateItems((old) => old.filter((i) => i.id !== id))
    fetch(`/api/dashboard/hackathons/${hackathonId}/announcements/${id}`, { method: "DELETE" })
      .then(assertOk)
      .catch(() => {
        if (prev) updateItems((old) => { const next = [...old]; next.splice(index, 0, prev); return next })
        setError("Failed to delete announcement")
      })
  }

  function handleTogglePublish(item: AnnouncementData) {
    const action = item.published_at ? "unpublish" : "publish"
    const prevItem = item
    updateItems((old) =>
      old.map((i) =>
        i.id === item.id
          ? { ...i, published_at: item.published_at ? null : new Date().toISOString() }
          : i
      )
    )
    fetch(`/api/dashboard/hackathons/${hackathonId}/announcements/${item.id}/${action}`, { method: "POST" })
      .then(assertOkJson<AnnouncementData>)
      .then((updated) => updateItems((old) => old.map((i) => (i.id === updated.id ? updated : i))))
      .catch(() => {
        updateItems((old) => old.map((i) => (i.id === prevItem.id ? prevItem : i)))
        setError("Failed to update publish status")
      })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSave(true)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
  }

  function renderAnnouncementCard(item: AnnouncementData) {
    const isDraft = !item.published_at
    const isSaving = item.id.startsWith("webmcp-announcement-")
    return (
      <div key={item.id} className={isDraft ? "rounded-lg border border-dashed p-4" : "rounded-lg border p-4"}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-medium truncate">{item.title}</h4>
              {item.priority === "urgent" && <Badge variant="destructive">urgent</Badge>}
              {isSaving && <Badge variant="secondary">Saving</Badge>}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isDraft ? (
                <AnnouncementDateLabel label="Created" date={item.created_at} />
              ) : (
                <AnnouncementDateLabel label="Sent" date={item.published_at!} />
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isDraft && (
              <Button
                size="sm"
                variant="default"
                onClick={() => handleTogglePublish(item)}
                disabled={isSaving}
              >
                <Send className="size-4" />
                <span className="hidden sm:inline">Publish</span>
              </Button>
            )}
            {!isDraft && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleTogglePublish(item)}
                disabled={isSaving}
              >
                <Eye className="size-4" />
                <span className="hidden sm:inline">Unpublish</span>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => openEdit(item)} disabled={isSaving}>
              <Pencil className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" disabled={isSaving}>
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDelete(item.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Announcements</h3>
          <p className="text-xs text-muted-foreground">Broadcast messages to participants</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">New Announcement</span>
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Suggested for this stage</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, idx) => (
              <Button key={idx} size="sm" variant="outline" onClick={() => openFromSuggestion(s)}>
                {s.priority === "urgent" && <span className="text-destructive">!</span>}
                {s.title}
              </Button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}

      {items.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <Megaphone className="size-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No announcements yet</p>
          <p className="text-xs mt-1">Create one or pick from a suggestion above</p>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Drafts</h4>
              <div className="space-y-3">
                {drafts.map(renderAnnouncementCard)}
              </div>
            </div>
          )}
          {published.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Published</h4>
              <div className="space-y-3">
                {published.map(renderAnnouncementCard)}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Announcement" : "New Announcement"}</DialogTitle>
            <DialogDescription>Share an update with people at this event.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(true) }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                name="ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Announcement title"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ann-body">Message</Label>
              <Textarea
                id="ann-body"
                name="ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your announcement..."
                rows={4}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-4">
                <Label>Priority</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={priority === "normal" ? "default" : "outline"} onClick={() => setPriority("normal")}>Normal</Button>
                  <Button type="button" size="sm" variant={priority === "urgent" ? "destructive" : "outline"} onClick={() => setPriority("urgent")}>Urgent</Button>
                </div>
              </div>
              <div>
                <Label>Audience</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as AnnouncementAudience)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="attendees">Attendees</SelectItem>
                    <SelectItem value="judges">Judges</SelectItem>
                    <SelectItem value="mentors">Mentors</SelectItem>
                    <SelectItem value="organizers">Organizers</SelectItem>
                    <SelectItem value="submitted">Teams who submitted</SelectItem>
                    <SelectItem value="not_submitted">Teams without submission</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editing ? (
              <Button type="submit" disabled={!title.trim() || !body.trim()} className="w-full">
                Update
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button type="submit" disabled={!title.trim() || !body.trim()} className="flex-1">
                  <Send className="size-4" />
                  Publish Now
                </Button>
                <Button type="button" variant="outline" disabled={!title.trim() || !body.trim()} onClick={() => handleSave(false)}>
                  Save Draft
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function EventTabContent({ hackathonId, activeEtab, hackathonStatus, hackathonPhase }: EventTabContentProps) {
  return (
    <TabsUrlSync paramKey="etab" value={activeEtab} className="space-y-6">
      <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
        <TabsList>
          <TabsTrigger value="announcements" aria-label="Announcements"><Megaphone className="size-4" /><span className="hidden sm:inline">Announcements</span></TabsTrigger>
          <TabsTrigger value="mentors" aria-label="Mentors"><MessageCircle className="size-4" /><span className="hidden sm:inline">Mentors</span></TabsTrigger>
          <TabsTrigger value="social" aria-label="Social"><Share2 className="size-4" /><span className="hidden sm:inline">Social</span></TabsTrigger>
          <TabsTrigger value="email" aria-label="Email"><Mail className="size-4" /><span className="hidden sm:inline">Email</span></TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="announcements" forceMount className="data-[state=inactive]:hidden">
        <AnnouncementsSubTab hackathonId={hackathonId} hackathonStatus={hackathonStatus} hackathonPhase={hackathonPhase} />
      </TabsContent>

      <TabsContent value="mentors" forceMount className="data-[state=inactive]:hidden">
        <MentorsSubTab hackathonId={hackathonId} />
      </TabsContent>

      <TabsContent value="social" forceMount className="data-[state=inactive]:hidden">
        <SocialSubTab hackathonId={hackathonId} />
      </TabsContent>

      <TabsContent value="email" forceMount className="data-[state=inactive]:hidden">
        <EmailSubTab hackathonId={hackathonId} />
      </TabsContent>
    </TabsUrlSync>
  )
}
