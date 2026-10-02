"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import type { JudgingNotificationPreferences } from "@/lib/services/judging-notifications"

type InboxItem = { id: string; title: string; body: string; action_path: string; read_at: string | null; resolved_at: string | null }
type Inbox = { items: InboxItem[]; unreadCount: number; preferences: JudgingNotificationPreferences }

export function JudgingInbox({ hackathonId }: { hackathonId: string }) {
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const base = `/api/dashboard/hackathons/${hackathonId}/judging`
  const reload = useCallback(async () => {
    try {
      setInbox(await fetch(`${base}/notifications`).then(assertOkJson<Inbox>))
      setLoadError(null)
    } catch {
      setLoadError("We couldn't load your judging updates.")
    }
  }, [base])
  useEffect(() => {
    const frame = requestAnimationFrame(() => { void reload() })
    const interval = setInterval(() => { if (document.visibilityState === "visible") void reload() }, 60_000)
    const refresh = () => { void reload() }
    window.addEventListener("judging-progress-changed", refresh)
    return () => { cancelAnimationFrame(frame); clearInterval(interval); window.removeEventListener("judging-progress-changed", refresh) }
  }, [reload])
  const settings = useOptimisticMutation<{ next: Partial<JudgingNotificationPreferences>; previous: JudgingNotificationPreferences }, JudgingNotificationPreferences>({
    fn: ({ next }) => fetch(`${base}/notification-preferences`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).then(assertOkJson<JudgingNotificationPreferences>),
    onOptimistic: ({ next }) => setInbox((current) => current ? { ...current, preferences: { ...current.preferences, ...next } } : current),
    onRevert: ({ previous }) => setInbox((current) => current ? { ...current, preferences: previous } : current),
    onSuccess: () => { void reload() },
  })
  const read = useOptimisticMutation<{ id: string; previous: Inbox }>({
    fn: ({ id }) => fetch(`${base}/notifications/${id}/read`, { method: "POST" }).then(assertOk),
    onOptimistic: ({ id }) => setInbox((current) => current ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item) } : current),
    onRevert: ({ previous }) => setInbox(previous),
  })
  const error = loadError ?? settings.error ?? read.error
  const visibleItems = inbox?.preferences.in_app_enabled ? inbox.items : []
  return <Card id="judging-updates">
    <CardHeader><CardTitle>Updates and reminders</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!inbox ? <Skeleton className="h-28 w-full" /> : <>
        <div className="space-y-3">
          {([
            ["email_enabled", "Email me when I need to act"],
            ["in_app_enabled", "Show updates here"],
            ["daily_digest", "Send daily reminders about my unfinished reviews"],
          ] as const).map(([key, label]) => <div className="flex items-center justify-between gap-4" key={key}>
            <Label htmlFor={`judging-${key}`}>{label}</Label>
            <Switch id={`judging-${key}`} checked={inbox.preferences[key]} disabled={settings.isPending} onCheckedChange={(checked) => { void settings.execute({ next: { [key]: checked }, previous: inbox.preferences }).catch(() => {}) }} />
          </div>)}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="judging-update-timezone">My time zone</Label>
              <Select value={inbox.preferences.timezone ?? "event"} disabled={settings.isPending} onValueChange={(value) => { void settings.execute({ next: { timezone: value === "event" ? null : value }, previous: inbox.preferences }).catch(() => {}) }}>
                <SelectTrigger id="judging-update-timezone"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="event">Use the event time zone</SelectItem><SelectItem value="UTC">UTC</SelectItem>{Intl.supportedValuesOf("timeZone").map((zone) => <SelectItem value={zone} key={zone}>{zone.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {([ ["quiet_start", "Quiet hours start"], ["quiet_end", "Quiet hours end"] ] as const).map(([key, label]) => <div className="space-y-2" key={key}><Label htmlFor={`judging-${key}`}>{label}</Label>
              <Select value={String(inbox.preferences[key])} disabled={settings.isPending} onValueChange={(value) => { void settings.execute({ next: { [key]: Number(value) }, previous: inbox.preferences }).catch(() => {}) }}>
                <SelectTrigger id={`judging-${key}`}><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 24 }, (_, hour) => <SelectItem value={String(hour)} key={hour}>{hour % 12 || 12}:00 {hour < 12 ? "AM" : "PM"}</SelectItem>)}</SelectContent>
              </Select>
            </div>)}
          </div>
          <p className="text-sm text-muted-foreground">We&apos;ll remind you before scores are due. Daily review reminders are off unless you choose them. Final-hour reminders can arrive during quiet hours.</p>
        </div>
        {!inbox.preferences.in_app_enabled ? <p className="text-sm text-muted-foreground">You&apos;ve turned off updates here.</p> : visibleItems.length === 0 ? <p className="text-sm text-muted-foreground">You&apos;re caught up. New judging updates will appear here.</p> : <ul className="space-y-3">
          {visibleItems.map((item) => <li key={item.id} className="space-y-1 border-t pt-3">
            <p className={item.read_at || item.resolved_at ? "text-sm" : "text-sm font-medium"}>{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.body}</p>
            <div className="flex flex-wrap items-center gap-2">
              {!item.resolved_at && <Button asChild variant="link"><Link href={item.action_path}>Open judging</Link></Button>}
              {!item.read_at && <Button variant="ghost" size="sm" disabled={read.isPending} onClick={() => { void read.execute({ id: item.id, previous: inbox }).catch(() => {}) }}>Mark read</Button>}
            </div>
          </li>)}
        </ul>}
      </>}
    </CardContent>
  </Card>
}
