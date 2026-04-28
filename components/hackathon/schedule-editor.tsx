"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import { toLocalDatetime } from "@/lib/utils/datetime"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { MapPin, Plus, Pencil, Trash2, Loader2, Calendar, Zap } from "lucide-react"
import type { ScheduleItem } from "@/lib/services/schedule-items"

const TRIGGER_TOOLTIPS: Record<string, string> = {
  submission_deadline: "This is an automated event. When this time arrives, submissions are locked and the judging phase begins. Participants can no longer submit or edit projects after this point.",
  challenge_release: "This is an automated event. When this time arrives, the challenge is released and becomes visible to all participants. You need to create a challenge first for this to take effect.",
  event_start: "This is an automated event. When this time arrives, your hackathon flips from Published to Live. Attendees see the event as active and things like the timer start counting. Change this by editing the event start date.",
  event_end: "This is an automated event. When this time arrives, your hackathon ends. If you have judging set up, it moves into the judging phase. Otherwise it's marked complete. Change this by editing the event end date.",
}

export type ScheduleItemData = {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  sort_order: number
  trigger_type: "challenge_release" | "submission_deadline" | "event_start" | "event_end" | null
}

const VIRTUAL_ID_EVENT_START = "__virtual_event_start"
const VIRTUAL_ID_EVENT_END = "__virtual_event_end"

function isVirtualItem(id: string): boolean {
  return id === VIRTUAL_ID_EVENT_START || id === VIRTUAL_ID_EVENT_END
}

function isoToSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000)
}

const DURATION_PRESETS = [
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
] as const

function roundUpTo15Min(date: Date): Date {
  const d = new Date(date)
  const remainder = d.getMinutes() % 15
  if (remainder > 0) d.setMinutes(d.getMinutes() + (15 - remainder))
  d.setSeconds(0, 0)
  return d
}

function computeDefaults(items: ScheduleItemData[]): { startsAt: string; endsAt: string } {
  let start: Date
  if (items.length > 0) {
    const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const last = sorted[sorted.length - 1]
    start = last.ends_at ? new Date(last.ends_at) : new Date(new Date(last.starts_at).getTime() + 30 * 60_000)
    if (start < new Date()) start = roundUpTo15Min(new Date())
  } else {
    start = roundUpTo15Min(new Date())
  }
  const end = new Date(start.getTime() + 30 * 60_000)
  return { startsAt: toLocalDatetime(start), endsAt: toLocalDatetime(end) }
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

function getDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getTimeKey(iso: string): string {
  return formatShortTime(iso)
}

type DateGroup = {
  dateKey: string
  dateLabel: string
  timeGroups: { timeKey: string; items: ScheduleItemData[] }[]
}

function groupByDateAndTime(items: ScheduleItemData[]): DateGroup[] {
  const dateMap = new Map<string, { dateLabel: string; timeMap: Map<string, ScheduleItemData[]> }>()
  for (const item of items) {
    const dk = getDateKey(item.starts_at)
    if (!dateMap.has(dk)) {
      dateMap.set(dk, { dateLabel: formatDateKey(item.starts_at), timeMap: new Map() })
    }
    const { timeMap } = dateMap.get(dk)!
    const tk = getTimeKey(item.starts_at)
    if (!timeMap.has(tk)) timeMap.set(tk, [])
    timeMap.get(tk)!.push(item)
  }
  return [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, { dateLabel, timeMap }]) => ({
      dateKey,
      dateLabel,
      timeGroups: [...timeMap.entries()]
        .map(([timeKey, items]) => ({ timeKey, items }))
        .sort((a, b) => a.items[0].starts_at.localeCompare(b.items[0].starts_at)),
    }))
}

function isCurrent(item: ScheduleItemData, now: string | null): boolean {
  if (!now || !item.ends_at) return false
  return item.starts_at <= now && item.ends_at > now
}

export type ScheduleEditorProps = {
  hackathonId: string
  scheduleItems: ScheduleItem[]
  challengeReleasedAt: string | null
  challengeExists: boolean
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  hackathonStatus?: string
  hideHeader?: boolean
  onEditTriggerItem?: (item: ScheduleItemData) => void
  onAddChallenge?: () => void
  onScheduleChange?: (items: ScheduleItemData[]) => void
}

export function ScheduleEditor({ hackathonId, scheduleItems: serverItems, challengeReleasedAt, challengeExists, hackathonStartsAt, hackathonEndsAt, hackathonStatus, hideHeader, onEditTriggerItem, onAddChallenge, onScheduleChange }: ScheduleEditorProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [now, setNow] = useState<string | null>(null)
  useEffect(() => {
    setNow(new Date().toISOString())
    const id = setInterval(() => setNow(new Date().toISOString()), 30_000)
    return () => clearInterval(id)
  }, [])

  const [allItems, setAllItems] = useState<ScheduleItemData[]>(serverItems as ScheduleItemData[])
  useEffect(() => { setAllItems(serverItems as ScheduleItemData[]) }, [serverItems])
  const items = useMemo(() => {
    const base = challengeExists || challengeReleasedAt
      ? allItems
      : allItems.filter((i) => i.trigger_type !== "challenge_release")
    const virtual: ScheduleItemData[] = []
    const terminalStatuses = new Set(["active", "judging", "completed", "archived"])
    if (hackathonStartsAt && !terminalStatuses.has(hackathonStatus ?? "")) {
      virtual.push({
        id: VIRTUAL_ID_EVENT_START,
        title: "Event goes live",
        description: "Hackathon flips from Published to Live",
        starts_at: hackathonStartsAt,
        ends_at: null,
        location: null,
        sort_order: 0,
        trigger_type: "event_start",
      })
    }
    const endsAtSec = hackathonEndsAt ? isoToSeconds(hackathonEndsAt) : null
    const submissionDeadlineAtEnd =
      endsAtSec !== null &&
      base.some(
        (i) => i.trigger_type === "submission_deadline" && isoToSeconds(i.starts_at) === endsAtSec,
      )
    if (
      hackathonEndsAt &&
      hackathonStatus !== "completed" &&
      hackathonStatus !== "archived" &&
      !submissionDeadlineAtEnd
    ) {
      virtual.push({
        id: VIRTUAL_ID_EVENT_END,
        title: "Event ends",
        description: "Hackathon moves to Judging or Completed",
        starts_at: hackathonEndsAt,
        ends_at: null,
        location: null,
        sort_order: 0,
        trigger_type: "event_end",
      })
    }
    return [...base, ...virtual]
  }, [allItems, challengeExists, challengeReleasedAt, hackathonStartsAt, hackathonEndsAt, hackathonStatus])
  const groupingItems = useMemo(
    () =>
      items.map((i) =>
        i.trigger_type === "challenge_release" && challengeReleasedAt
          ? { ...i, starts_at: challengeReleasedAt }
          : i,
      ),
    [items, challengeReleasedAt],
  )
  const dateGroups = useMemo(() => groupByDateAndTime(groupingItems), [groupingItems])
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduleItemData | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startsAt, setStartsAt] = useState<Date | null>(null)
  const [endsAt, setEndsAt] = useState<Date | null>(null)
  const [location, setLocation] = useState("")
  const [saving, setSaving] = useState(false)
  const [activeDuration, setActiveDuration] = useState<number | null>(30)

  function applyDuration(minutes: number) {
    if (!startsAt) return
    setEndsAt(new Date(startsAt.getTime() + minutes * 60_000))
    setActiveDuration(minutes)
  }

  function openCreate() {
    setEditing(null)
    setTitle("")
    setDescription("")
    const defaults = computeDefaults(items)
    setStartsAt(defaults.startsAt ? new Date(defaults.startsAt) : null)
    setEndsAt(defaults.endsAt ? new Date(defaults.endsAt) : null)
    setLocation("")
    setActiveDuration(30)
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(item: ScheduleItemData) {
    setEditing(item)
    setTitle(item.title)
    setDescription(item.description ?? "")
    setStartsAt(new Date(item.starts_at))
    setEndsAt(item.ends_at ? new Date(item.ends_at) : null)
    setLocation(item.location ?? "")
    if (item.starts_at && item.ends_at) {
      const diffMin = Math.round((new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60_000)
      const match = DURATION_PRESETS.find((p) => p.minutes === diffMin)
      setActiveDuration(match ? match.minutes : null)
    } else {
      setActiveDuration(null)
    }
    setError(null)
    setDialogOpen(true)
  }

  function handleItemClick(item: ScheduleItemData) {
    if (isVirtualItem(item.id)) return
    if (item.trigger_type && onEditTriggerItem) {
      onEditTriggerItem(item)
    } else {
      openEdit(item)
    }
  }

  async function handleSave() {
    if (!title.trim() || !startsAt) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        title,
        startsAt: startsAt!.toISOString(),
      }
      if (description.trim()) payload.description = description
      if (endsAt) payload.endsAt = endsAt.toISOString()
      if (location.trim()) payload.location = location

      const url = editing
        ? `/api/dashboard/hackathons/${hackathonId}/schedule/${editing.id}`
        : `/api/dashboard/hackathons/${hackathonId}/schedule`
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const saved = await assertOkJson<ScheduleItemData>(res)
      const sort = (a: ScheduleItemData, b: ScheduleItemData) => a.starts_at.localeCompare(b.starts_at) || (a.sort_order ?? 0) - (b.sort_order ?? 0)
      setAllItems((prev) => {
        const next = editing
          ? prev.map((i) => (i.id === saved.id ? saved : i)).sort(sort)
          : [...prev, saved].sort(sort)
        onScheduleChange?.(next)
        return next
      })
      setDialogOpen(false)
      router.refresh()
    } catch {
      setError("Failed to save agenda item")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const prev = allItems
    setAllItems((current) => current.filter((i) => i.id !== id))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/schedule/${id}`, { method: "DELETE" }).then(assertOk)
      router.refresh()
    } catch {
      setAllItems(prev)
      setError("Failed to delete agenda item")
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleSave()
    }
  }


  return (
    <>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Agenda</h3>
          {onAddChallenge && !challengeExists ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Add</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openCreate}>
                  <Calendar className="size-4" />
                  Agenda item
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAddChallenge}>
                  <Zap className="size-4" />
                  Challenge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Add</span>
            </Button>
          )}
        </div>
      )}
      {hideHeader && (
        <div className="flex justify-end mb-3">
          {onAddChallenge && !challengeExists ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="size-4" />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openCreate}>
                  <Calendar className="size-4" />
                  Agenda item
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAddChallenge}>
                  <Zap className="size-4" />
                  Challenge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="size-4" />
              Add
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-destructive text-xs mb-3">{error}</p>}

      {items.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">Set event dates to generate your agenda</p>
        </div>
      ) : (
        <div className="space-y-0">
          {dateGroups.map((dateGroup, dateIdx) => (
            <div key={dateGroup.dateKey}>
              {(dateGroups.length > 1 || dateIdx > 0) && (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground shrink-0">{dateGroup.dateLabel}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              {dateGroup.timeGroups.map((timeGroup, timeIdx) => {
                const isLastTimeInDate = timeIdx === dateGroup.timeGroups.length - 1
                const showLine = !isLastTimeInDate
                const timeGroupIsCurrent = timeGroup.items.some((item) => isCurrent(item, now))
                return (
                  <div key={timeGroup.timeKey} className="grid grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] gap-x-3">
                    <div>
                      <div className="flex h-10 items-center justify-end">
                        <span className="text-xs font-medium leading-none tabular-nums text-muted-foreground">
                          {timeGroup.timeKey}
                        </span>
                      </div>
                    </div>
                    <div className="relative flex items-start justify-center">
                      <div className="flex h-10 items-center">
                        <div className={`relative z-10 size-3 rounded-full border-2 border-background ${timeGroupIsCurrent ? "bg-primary" : "bg-muted-foreground/40"}`} />
                      </div>
                      {showLine && <div className="absolute left-1/2 top-[2.375rem] -bottom-0.5 -translate-x-1/2 w-px bg-border" />}
                    </div>
                    <div className={`min-w-0 ${showLine ? "pb-4" : ""}`}>
                      <div className="space-y-2">
                        {timeGroup.items.map((item) => {
                          const current = isCurrent(item, now)
                          const isTrigger = !!item.trigger_type
                          const isVirtual = isVirtualItem(item.id)
                          const isReleased = item.trigger_type === "challenge_release" && !!challengeReleasedAt
                          const isInteractive = !isReleased && !isVirtual
                          return (
                            <div
                              key={item.id}
                              className={`group relative ${current ? "rounded-md bg-primary/5 -mx-2 px-2" : ""} ${isReleased ? "opacity-50" : ""}`}
                            >
                              <div
                                className={`flex items-start gap-2 ${isInteractive ? "cursor-pointer" : ""}`}
                                role={isInteractive ? "button" : undefined}
                                tabIndex={isInteractive ? 0 : undefined}
                                onClick={isInteractive ? () => handleItemClick(item) : undefined}
                                onKeyDown={isInteractive ? (e) => { if (e.key === "Enter") handleItemClick(item) } : undefined}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex min-h-10 items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium truncate">{item.title}</p>
                                    {current && <Badge variant="secondary">Now</Badge>}
                                    {isReleased ? (
                                      <Badge variant="secondary" className="text-xs">Released</Badge>
                                    ) : isTrigger && item.trigger_type ? (
                                      isMobile ? (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Badge variant="outline" className="text-xs cursor-help">Automated</Badge>
                                          </PopoverTrigger>
                                          <PopoverContent side="top" align="start" className="w-72 text-sm">
                                            {TRIGGER_TOOLTIPS[item.trigger_type]}
                                          </PopoverContent>
                                        </Popover>
                                      ) : (
                                        <HoverCard openDelay={200} closeDelay={100}>
                                          <HoverCardTrigger asChild>
                                            <Badge variant="outline" className="text-xs cursor-help">Automated</Badge>
                                          </HoverCardTrigger>
                                          <HoverCardContent side="top" align="start" className="w-72 text-sm">
                                            {TRIGGER_TOOLTIPS[item.trigger_type]}
                                          </HoverCardContent>
                                        </HoverCard>
                                      )
                                    ) : null}
                                  </div>
                                  {item.location && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground -mt-0.5">
                                      <MapPin className="size-3" />
                                      {item.location}
                                    </span>
                                  )}
                                  {item.description && (
                                    <p className="text-xs text-muted-foreground -mt-0.5 line-clamp-1">{item.description}</p>
                                  )}
                                </div>
                                {isInteractive && (
                                  <div className={`flex min-h-10 items-center gap-0.5 shrink-0 transition-opacity ${isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-7"
                                      onClick={(e) => { e.stopPropagation(); handleItemClick(item) }}
                                    >
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    {!isTrigger && (
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="size-7"
                                            >
                                              <Trash2 className="size-3.5" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Delete agenda item?</AlertDialogTitle>
                                              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction onClick={() => handleDelete(item.id)}>Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit agenda item" : "Add agenda item"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave() }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="sched-title">Title</Label>
              <Input
                id="sched-title"
                name="sched-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Opening Ceremony"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-desc">Description (optional)</Label>
              <Textarea
                id="sched-desc"
                name="sched-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description..."
                rows={2}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div className="space-y-2">
              <Label>Starts at</Label>
              <DateTimePicker
                value={startsAt}
                onChange={(d) => {
                  setStartsAt(d)
                  if (activeDuration && d) {
                    setEndsAt(new Date(d.getTime() + activeDuration * 60_000))
                  }
                }}
                placeholder="Select start date and time"
              />
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex gap-1">
                {DURATION_PRESETS.map((p) => (
                  <Button
                    key={p.minutes}
                    type="button"
                    variant={activeDuration === p.minutes ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => applyDuration(p.minutes)}
                    disabled={!startsAt}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={activeDuration === null ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveDuration(null)}
                >
                  Custom
                </Button>
              </div>
              {activeDuration === null && (
                <DateTimePicker
                  value={endsAt}
                  onChange={setEndsAt}
                  placeholder="Select end date and time"
                />
              )}
              {activeDuration !== null && endsAt && (
                <p className="text-xs text-muted-foreground">
                  Ends at {endsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-location">Location (optional)</Label>
              <Input
                id="sched-location"
                name="sched-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Main Hall, Zoom link"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <Button type="submit" disabled={saving || !title.trim() || !startsAt} className="w-full">
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "Update" : "Add"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
