import { countActionableJudgeReviews } from "@/lib/utils/judging-review-queue"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"
import { supabase as getSupabase } from "@/lib/db/client"
import { resolveJudgingWindow, isValidJudgingTimeZone, type JudgingWindowEvent } from "@/lib/utils/judging-window"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import { consumeDeliverySlot, type DeliveryBudget } from "@/lib/services/delivery-budget"
import { logJudgingDatabaseError } from "@/lib/services/judging-diagnostics"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { getEffectiveStatusAt } from "@/lib/utils/timeline"
import { isJudgingWindowOpen } from "@/lib/services/judging-readiness"

export type JudgingNotificationKind = "preparation" | "work_ready" | "work_added" | "scores_due" | "deadline_changed" | "all_done" | "organizer_readiness" | "organizer_progress" | "daily_digest" | "manual_reminder"
export type JudgingNotificationPreferences = {
  email_enabled: boolean
  in_app_enabled: boolean
  daily_digest: boolean
  timezone: string | null
  quiet_start: number
  quiet_end: number
}
export const DEFAULT_JUDGING_NOTIFICATION_PREFERENCES: JudgingNotificationPreferences = {
  email_enabled: true, in_app_enabled: true, daily_digest: false, timezone: null, quiet_start: 20, quiet_end: 8,
}
export type JudgingNotification = {
  id: string
  hackathon_id: string
  clerk_user_id: string
  round_id: string | null
  kind: JudgingNotificationKind
  identity: string
  title: string
  body: string
  action_path: string
  metadata: { deadline?: string; opensAt?: string; assignmentIds?: string[]; urgency?: "normal" | "urgent" }
  scheduled_for: string
  next_attempt_at?: string | null
  email_required: boolean
  email_sent_at: string | null
  read_at: string | null
  resolved_at: string | null
  fail_count: number
  created_at: string
}
type Event = JudgingWindowEvent & {
  id: string; name: string; slug: string; status: HackathonStatus; phase?: string | null; tenant_id: string
  starts_at?: string | null; ends_at?: string | null
  is_test_event: boolean; judging_reminders_enabled: boolean; results_published_at: string | null
}
type Assignment = { id: string; judge_participant_id: string; is_complete: boolean; round_id: string | null; submission_id?: string; prize_id?: string | null; prize?: { judging_style: string | null } | null; submission?: { team_id: string | null; status: string } | null }
type Judge = { id: string; clerk_user_id: string; role: string; judging_scope_ready?: boolean; team_id?: string | null }
type Round = { id: string; status: string; opens_at: string | null; closes_at: string | null }
const HOUR = 3_600_000
const db = () => getSupabase() as unknown as SupabaseClient
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32)
const eventColumns = "id,name,slug,status,phase,starts_at,ends_at,tenant_id,is_test_event,results_published_at,judging_opens_at,judging_closes_at,judging_timezone,judging_reminders_enabled"

function organizerReadinessDue(window: ReturnType<typeof resolveJudgingWindow>, scheduledWindowOpen: boolean | null, now: Date): boolean {
  return (window.state === "open" && scheduledWindowOpen === false) || (window.state === "upcoming" && !!window.opensAt && Date.parse(window.opensAt) - now.getTime() <= 24 * HOUR)
}

export function notificationLocalClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) }
}

export function isJudgingQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

export async function getJudgingNotificationPreferences(hackathonId: string, userId: string): Promise<JudgingNotificationPreferences> {
  const { data, error } = await db().from("judging_notification_preferences").select("email_enabled,in_app_enabled,daily_digest,timezone,quiet_start,quiet_end").eq("hackathon_id", hackathonId).eq("clerk_user_id", userId).maybeSingle()
  if (error) throw new Error("Could not load reminder settings.")
  return { ...DEFAULT_JUDGING_NOTIFICATION_PREFERENCES, ...data }
}

export async function updateJudgingNotificationPreferences(hackathonId: string, userId: string, preferences: Partial<JudgingNotificationPreferences>) {
  if (preferences.timezone !== undefined && preferences.timezone !== null && !isValidJudgingTimeZone(preferences.timezone)) throw new Error("Choose a valid time zone.")
  for (const hour of [preferences.quiet_start, preferences.quiet_end]) if (hour !== undefined && (!Number.isInteger(hour) || hour < 0 || hour > 23)) throw new Error("Choose quiet hours between midnight and 11 PM.")
  const { error } = await db().from("judging_notification_preferences").upsert({ hackathon_id: hackathonId, clerk_user_id: userId, ...preferences, updated_at: new Date().toISOString() }, { onConflict: "hackathon_id,clerk_user_id" })
  if (error) throw new Error("Could not save reminder settings.")
  return getJudgingNotificationPreferences(hackathonId, userId)
}

export async function getJudgingInbox(hackathonId: string, userId: string) {
  const [preferences, result] = await Promise.all([
    getJudgingNotificationPreferences(hackathonId, userId),
    db().from("judging_notifications").select("id,kind,title,body,action_path,created_at,read_at,resolved_at").eq("hackathon_id", hackathonId).eq("clerk_user_id", userId).lte("scheduled_for", new Date().toISOString()).order("created_at", { ascending: false }).limit(50),
  ])
  if (result.error) throw new Error("Could not load judging updates.")
  const items = preferences.in_app_enabled ? result.data ?? [] : []
  return { items, unreadCount: items.filter((item) => !item.read_at && !item.resolved_at).length, preferences }
}

export async function markJudgingNotificationRead(hackathonId: string, userId: string, notificationId: string) {
  const { error } = await db().from("judging_notifications").update({ read_at: new Date().toISOString() }).eq("hackathon_id", hackathonId).eq("clerk_user_id", userId).eq("id", notificationId)
  if (error) throw new Error("Could not mark this update as read.")
}

async function loadContext(hackathonId: string, now: Date = new Date()) {
  const client = db()
  const [event, judges, assignments, rounds, visibility] = await Promise.all([
    client.from("hackathons").select(eventColumns).eq("id", hackathonId).maybeSingle(),
    client.from("hackathon_participants").select("id,clerk_user_id,role,team_id,judging_scope_ready").eq("hackathon_id", hackathonId).in("role", ["judge", "organizer"]),
    client.from("judge_assignments").select("id,judge_participant_id,is_complete,round_id,submission_id,prize_id,prize:prizes!judge_assignments_prize_id_fkey(judging_style),submission:submissions!judge_assignments_submission_id_fkey!inner(team_id,status)").eq("hackathon_id", hackathonId),
    client.from("judging_rounds").select("id,status,opens_at,closes_at").eq("hackathon_id", hackathonId),
    client.rpc("get_judging_visible_assignment_ids", { p_hackathon_id: hackathonId }),
  ])
  for (const [operation, result] of [
    ["notification_event", event],
    ["notification_judges", judges],
    ["notification_assignments", assignments],
    ["notification_rounds", rounds],
    ["notification_visibility", visibility],
  ] as const) {
    if (result.error) {
      logJudgingDatabaseError(operation, result.error)
      throw new Error("Could not check judging progress.")
    }
  }
  const visibleIds = new Set(Array.isArray(visibility.data) ? visibility.data.filter((value): value is string => typeof value === "string") : [])
  const people = (judges.data ?? []) as Judge[]
  const rawWork = (assignments.data ?? []) as unknown as Array<Assignment & { prize: Assignment["prize"] | Array<NonNullable<Assignment["prize"]>>; submission: Assignment["submission"] | Array<NonNullable<Assignment["submission"]>> }>
  let work: Assignment[] = rawWork.map((assignment) => ({ ...assignment, prize: Array.isArray(assignment.prize) ? assignment.prize[0] ?? null : assignment.prize, submission: Array.isArray(assignment.submission) ? assignment.submission[0] ?? null : assignment.submission })).filter((assignment) => {
    const judge = people.find((person) => person.id === assignment.judge_participant_id && person.role === "judge" && person.judging_scope_ready !== false)
    return judge && visibleIds.has(assignment.id) && (!assignment.submission || assignment.submission.status === "submitted") && !(judge.team_id && judge.team_id === assignment.submission?.team_id)
  })
  const active = ((rounds.data ?? []) as Round[]).find((round) => round.status === "active")
  work = work.filter((assignment) => !assignment.round_id || assignment.round_id === active?.id)
  if (active) {
    const finalists = await client.from("round_submissions").select("submission_id").eq("round_id", active.id)
    if (finalists.error) throw new Error("Could not check the projects in this round.")
    if (finalists.data?.length) {
      const ids = new Set(finalists.data.map((row) => row.submission_id))
      work = work.filter((assignment) => ids.has(assignment.submission_id))
    }
  }
  const rawEvent = event.data as Event | null
  const currentEvent = rawEvent ? {
    ...rawEvent,
    status: getEffectiveStatusAt({ ...rawEvent, starts_at: rawEvent.starts_at ?? null, ends_at: rawEvent.ends_at ?? null }, now),
  } : null
  const configured = currentEvent && resolveJudgingWindow(currentEvent, active, now).state !== "unscheduled"
  const scheduledWindowOpen = configured ? await isJudgingWindowOpen(hackathonId, active?.id ?? null) : null
  return { event: currentEvent, judges: people, assignments: work, rounds: (rounds.data ?? []) as Round[], scheduledWindowOpen }
}

function reviewCount(assignments: Assignment[]): number {
  return countActionableJudgeReviews(assignments.map((assignment) => ({ id: assignment.id, isComplete: assignment.is_complete, prizeId: assignment.prize_id ?? null, judgingStyle: assignment.prize?.judging_style ?? null })))
}

async function organizerUserIds(event: Event, people: Judge[]): Promise<string[]> {
  const ids = new Set(people.filter((person) => person.role === "organizer").map((person) => person.clerk_user_id))
  const { data: tenant, error } = await db().from("tenants").select("clerk_user_id,clerk_org_id").eq("id", event.tenant_id).maybeSingle()
  if (error) throw new Error("Could not find the event organizer.")
  if (tenant?.clerk_user_id) ids.add(tenant.clerk_user_id)
  if (tenant?.clerk_org_id) {
    const { clerkClient } = await import("@clerk/nextjs/server")
    const clerk = await clerkClient()
    for (let offset = 0; offset < 500; offset += 100) {
      const page = await clerk.organizations.getOrganizationMembershipList({ organizationId: tenant.clerk_org_id, limit: 100, offset })
      for (const member of page.data) {
        if (member.role === "org:admin" && member.publicUserData?.userId) ids.add(member.publicUserData.userId)
      }
      if (offset + page.data.length >= page.totalCount) break
    }
  }
  return [...ids]
}

async function enqueue(input: Omit<JudgingNotification, "id" | "email_sent_at" | "read_at" | "resolved_at" | "fail_count" | "created_at">) {
  const { error } = await db().from("judging_notifications").upsert(input, { onConflict: "hackathon_id,clerk_user_id,kind,identity", ignoreDuplicates: true })
  if (error) throw new Error("Could not save judging updates.")
}

export async function reconcileJudgingNotifications(hackathonId: string, now: Date = new Date()): Promise<void> {
  const { event, judges, assignments, rounds, scheduledWindowOpen } = await loadContext(hackathonId, now)
  if (!event) return
  if (event.is_test_event || event.status === "draft") return
  const client = db()
  if (["completed", "archived"].includes(event.status) || event.results_published_at) {
    const { error } = await client.from("judging_notifications").update({ resolved_at: now.toISOString() }).eq("hackathon_id", hackathonId).is("resolved_at", null)
    if (error) throw new Error("Could not close judging updates.")
    return
  }
  const { data: existing, error } = await client.from("judging_notifications").select("*").eq("hackathon_id", hackathonId).order("created_at", { ascending: false }).limit(5000)
  if (error) throw new Error("Could not check previous judging updates.")
  const previous = (existing ?? []) as JudgingNotification[]
  const activeRound = rounds.find((round) => round.status === "active")
  for (const judge of judges.filter((person) => person.role === "judge" && person.judging_scope_ready !== false)) {
    const preferences = await getJudgingNotificationPreferences(hackathonId, judge.clerk_user_id)
    const own = assignments.filter((item) => item.judge_participant_id === judge.id && (!item.round_id || item.round_id === activeRound?.id))
    const pending = own.filter((item) => !item.is_complete)
    const window = resolveJudgingWindow(event, activeRound, now)
    const roundId = activeRound?.id ?? null
    const recipientPrevious = previous.filter((item) => item.clerk_user_id === judge.clerk_user_id && item.round_id === roundId)
    const base = { hackathon_id: hackathonId, clerk_user_id: judge.clerk_user_id, round_id: roundId, action_path: `/e/${event.slug}/judge`, email_required: event.judging_reminders_enabled, metadata: { deadline: window.closesAt ?? undefined }, scheduled_for: now.toISOString() }
    const emit = (kind: JudgingNotificationKind, identity: string, title: string, body: string, extra: { metadata?: JudgingNotification["metadata"]; scheduled_for?: string; next_attempt_at?: string; email_required?: boolean } = {}) => enqueue({ ...base, kind, identity: `${roundId ?? "event"}/${identity}`, title, body, ...extra })
    const opened = scheduledWindowOpen !== false && ["active", "judging"].includes(event.status) && (window.state === "open" || (window.state === "unscheduled" && (event.status === "judging" || !!activeRound || ["preliminaries", "finals"].includes(event.phase ?? ""))))
    if (window.opensAt && window.state === "upcoming" && Date.parse(window.opensAt) - now.getTime() <= 24 * HOUR) {
      await emit("preparation", window.opensAt, "You're judging soon", "Check your judging page before scoring opens.", { metadata: { ...base.metadata, opensAt: window.opensAt } })
    }
    if (opened && pending.length) {
      const ids = own.map((item) => item.id).sort()
      const priorReady = recipientPrevious.find((item) => item.kind === "work_ready" || item.kind === "work_added")
      const added = ids.some((id) => !priorReady?.metadata.assignmentIds?.includes(id))
      if (!priorReady || added) {
        await emit(priorReady ? "work_added" : "work_ready", fingerprint(ids.join(",")), priorReady ? "More projects to judge" : "Your projects are ready", `You have ${reviewCount(pending)} ${reviewCount(pending) === 1 ? "review" : "reviews"} left to finish.`, { metadata: { ...base.metadata, assignmentIds: ids }, ...(priorReady ? { next_attempt_at: new Date(now.getTime() + 15 * 60_000).toISOString() } : {}) })
      }
      const body = `You have ${reviewCount(pending)} ${reviewCount(pending) === 1 ? "review" : "reviews"} left to finish.`
      for (const notice of recipientPrevious.filter((item) => !item.resolved_at && ["work_ready", "work_added"].includes(item.kind))) {
        const title = notice.kind === "work_ready" ? "Your projects are ready" : "More projects to judge"
        if (notice.title !== title) {
          const restored = await client.from("judging_notifications").update({ title, body, read_at: null }).eq("id", notice.id)
          if (restored.error) throw new Error("Could not update your judging status.")
        }
      }
      const countsToRefresh = recipientPrevious.filter((item) => !item.resolved_at && ["work_ready", "work_added", "scores_due", "daily_digest", "manual_reminder"].includes(item.kind) && item.body !== body).map((item) => item.id)
      if (countsToRefresh.length) {
        const refreshed = await client.from("judging_notifications").update({ body }).in("id", countsToRefresh)
        if (refreshed.error) throw new Error("Could not update your remaining reviews.")
      }
      if (window.closesAt) {
        const remaining = Date.parse(window.closesAt) - now.getTime()
        const opening = window.opensAt ? Date.parse(window.opensAt) : -Infinity
        const milestone = remaining <= HOUR && Date.parse(window.closesAt) - HOUR >= opening ? "1h" : remaining <= 24 * HOUR && Date.parse(window.closesAt) - 24 * HOUR >= opening ? "24h" : null
        const recentWorkNotice = !priorReady || now.getTime() - Date.parse(priorReady.created_at) < HOUR
        if (milestone && !recentWorkNotice) await emit("scores_due", `${window.closesAt}/${milestone}`, "Your scores are due soon", `You have ${reviewCount(pending)} ${reviewCount(pending) === 1 ? "review" : "reviews"} left to finish.`, { metadata: { deadline: window.closesAt, urgency: milestone === "1h" ? "urgent" : "normal" } })
      }
      const timezone = preferences.timezone ?? event.judging_timezone ?? "UTC"
      const clock = notificationLocalClock(now, timezone)
      if (preferences.daily_digest && clock.hour >= 9 && window.opensAt && window.closesAt && Date.parse(window.closesAt) - Date.parse(window.opensAt) > 48 * HOUR) {
        await emit("daily_digest", clock.date, "Your judging today", `You have ${reviewCount(pending)} ${reviewCount(pending) === 1 ? "review" : "reviews"} left to finish.`)
      }
    }
    if (window.state === "open" && scheduledWindowOpen === false && pending.length) {
      const pausedIds = recipientPrevious.filter((item) => !item.resolved_at && ["work_ready", "work_added"].includes(item.kind) && item.title !== "Judging is on hold").map((item) => item.id)
      if (pausedIds.length) {
        const paused = await client.from("judging_notifications").update({ title: "Judging is on hold", body: "Your organizer is finishing setup. We'll let you know when judging opens.", read_at: null }).in("id", pausedIds)
        if (paused.error) throw new Error("Could not update your judging status.")
      }
    }
    const priorDeadline = recipientPrevious.find((item) => item.metadata.deadline)
    if (priorDeadline && window.closesAt && priorDeadline.metadata.deadline !== window.closesAt && pending.length && window.state !== "closed") {
      await emit("deadline_changed", window.closesAt, "Your judging deadline changed", "Check the new deadline on your judging page.")
    }
    if (own.length && !pending.length) {
      await emit("all_done", fingerprint(own.map((item) => item.id).sort().join(",")), "You're done", "Thanks! All your assigned reviews are saved.", { email_required: false })
    }
    const staleIds = recipientPrevious.filter((item) => !item.resolved_at && (
      (pending.length > 0 && item.kind === "all_done") ||
      (item.metadata.deadline && item.metadata.deadline !== window.closesAt) ||
      ((!pending.length || window.state === "closed") && ["work_ready", "work_added", "scores_due", "daily_digest", "manual_reminder"].includes(item.kind)) ||
      (opened && item.kind === "preparation") ||
      (item.kind === "preparation" && item.metadata.opensAt !== window.opensAt) ||
      (item.kind === "scores_due" && item.metadata.urgency !== "urgent" && window.closesAt && Date.parse(window.closesAt) - now.getTime() <= HOUR) ||
      (["work_ready", "work_added"].includes(item.kind) && item.metadata.assignmentIds && fingerprint([...item.metadata.assignmentIds].sort().join(",")) !== fingerprint(own.map((assignment) => assignment.id).sort().join(",")))
    )).map((item) => item.id)
    if (staleIds.length) {
      const result = await client.from("judging_notifications").update({ resolved_at: now.toISOString() }).in("id", staleIds)
      if (result.error) throw new Error("Could not update completed judging reminders.")
    }
  }
  const window = resolveJudgingWindow(event, activeRound, now)
  const pendingCount = judges.filter((judge) => judge.role === "judge").reduce((sum, judge) => sum + reviewCount(assignments.filter((item) => item.judge_participant_id === judge.id)), 0)
  const blockedOpening = window.state === "open" && scheduledWindowOpen === false
  const readinessDue = organizerReadinessDue(window, scheduledWindowOpen, now)
  const staleReadinessIds = previous.filter((item) => item.kind === "organizer_readiness" && !item.resolved_at && (!readinessDue || item.metadata.opensAt !== window.opensAt || item.metadata.deadline !== window.closesAt || (blockedOpening && item.identity.endsWith("/24h")))).map((item) => item.id)
  if (staleReadinessIds.length) {
    const resolved = await client.from("judging_notifications").update({ resolved_at: now.toISOString() }).in("id", staleReadinessIds)
    if (resolved.error) throw new Error("Could not update judging setup reminders.")
  }
  const progressDue = pendingCount > 0 && (event.status === "judging" || !!activeRound) && !["upcoming", "invalid"].includes(window.state)
  if (readinessDue || progressDue) {
    const { getOrganizerTaskBoard } = await import("@/lib/services/organizer-action-items")
    const tasks = await getOrganizerTaskBoard(hackathonId, { state: "pending", limit: 100 })
    const relevant = tasks.items.filter((item) => /judg|prize|scor|round|assign/i.test(item.label))
    if (blockedOpening || progressDue || relevant.length) {
      const clock = notificationLocalClock(now, event.judging_timezone ?? "UTC")
      const expired = window.state === "closed"
      for (const userId of await organizerUserIds(event, judges)) {
        const kind = readinessDue ? "organizer_readiness" as const : "organizer_progress" as const
        if (!readinessDue && !expired && clock.hour < 9) continue
        await enqueue({ hackathon_id: hackathonId, clerk_user_id: userId, round_id: activeRound?.id ?? null, kind, identity: readinessDue ? `${window.opensAt}/${window.closesAt}/${blockedOpening ? "blocked" : "24h"}` : expired ? `${window.closesAt}/closed` : `${clock.date}/daily`, title: blockedOpening ? "Finish setup to open judging" : readinessDue ? "Get judging ready" : expired ? "Judging closed with work left" : "Judging needs a look", body: readinessDue ? relevant.slice(0, 3).map((item) => item.label).join(". ") || "Check your judging setup so judges can start." : `${pendingCount} ${pendingCount === 1 ? "review still needs" : "reviews still need"} scores.`, action_path: `/e/${event.slug}/manage/judging`, metadata: { deadline: window.closesAt ?? undefined, ...(readinessDue ? { opensAt: window.opensAt ?? undefined } : {}) }, scheduled_for: now.toISOString(), email_required: event.judging_reminders_enabled })
      }
    }
  }
}

export async function queueJudgeWorkReminder(hackathonId: string, userId: string, preview = false): Promise<{ outcome: "ready" | "reminded" | "cooldown" | "blocked"; delivery?: "queued"; message: string }> {
  const { event, judges, assignments, rounds, scheduledWindowOpen } = await loadContext(hackathonId)
  const judge = judges.find((person) => person.clerk_user_id === userId && person.role === "judge")
  const round = rounds.find((item) => item.status === "active")
  const pending = assignments.filter((item) => item.judge_participant_id === judge?.id && !item.is_complete && (!item.round_id || item.round_id === round?.id))
  if (!event || !judge || event.is_test_event || ["draft", "completed", "archived"].includes(event.status) || event.results_published_at) return { outcome: "blocked", message: "This judge can't be reminded right now." }
  const window = resolveJudgingWindow(event, round)
  const open = scheduledWindowOpen !== false && ["active", "judging"].includes(event.status) && (window.state === "open" || (window.state === "unscheduled" && (event.status === "judging" || !!round || ["preliminaries", "finals"].includes(event.phase ?? ""))))
  if (!pending.length || !open) return { outcome: "blocked", message: pending.length ? "Judging isn't open right now." : "This judge has no reviews left." }
  const preferences = await getJudgingNotificationPreferences(hackathonId, userId)
  if (!event.judging_reminders_enabled || (!preferences.email_enabled && !preferences.in_app_enabled)) return { outcome: "blocked", message: "This judge has turned off judging reminders." }
  const now = new Date()
  const previous = await db().from("judging_notifications").select("id").eq("hackathon_id", hackathonId).eq("clerk_user_id", userId).eq("kind", "manual_reminder").gte("created_at", new Date(now.getTime() - 24 * HOUR).toISOString()).limit(1)
  if (previous.error) throw new Error("Could not check the last reminder.")
  if (previous.data?.length) return { outcome: "cooldown", message: "Wait a day before reminding this judge again." }
  if (preview) return { outcome: "ready", message: `Remind this judge about ${reviewCount(pending)} unfinished ${reviewCount(pending) === 1 ? "review" : "reviews"}.` }
  await enqueue({ hackathon_id: hackathonId, clerk_user_id: userId, round_id: round?.id ?? null, kind: "manual_reminder", identity: now.toISOString(), title: "Your organizer asked you to finish judging", body: `You have ${reviewCount(pending)} ${reviewCount(pending) === 1 ? "review" : "reviews"} left to finish.`, action_path: `/e/${event.slug}/judge`, metadata: { deadline: window.closesAt ?? undefined }, scheduled_for: now.toISOString(), email_required: preferences.email_enabled })
  return { outcome: "reminded", delivery: "queued", message: "Reminder queued. We'll respect this judge's reminder settings." }
}

type DeliveryGate = { outcome: "send" | "suppress" | "defer"; resolve?: boolean }

async function recheckJudgingDelivery(notification: JudgingNotification): Promise<DeliveryGate> {
  const client = db()
  const [context, preferences, receipt] = await Promise.all([
    loadContext(notification.hackathon_id),
    getJudgingNotificationPreferences(notification.hackathon_id, notification.clerk_user_id),
    client.from("judging_notifications").select("email_sent_at,email_required,resolved_at").eq("id", notification.id).eq("hackathon_id", notification.hackathon_id).eq("clerk_user_id", notification.clerk_user_id).maybeSingle(),
  ])
  if (receipt.error) throw new Error("Could not check this reminder.")
  if (!receipt.data || receipt.data.email_sent_at || receipt.data.resolved_at || !receipt.data.email_required) return { outcome: "suppress" }
  const { event, judges, assignments, rounds } = context
  if (!event || ["completed", "archived"].includes(event.status) || event.results_published_at) return { outcome: "suppress", resolve: true }
  if (event.status === "draft" || event.is_test_event) return { outcome: "defer" }
  const organizer = notification.kind.startsWith("organizer_")
  const recipient = judges.find((judge) => judge.clerk_user_id === notification.clerk_user_id && judge.role === "judge" && judge.judging_scope_ready !== false)
  if (organizer ? !(await organizerUserIds(event, judges)).includes(notification.clerk_user_id) : !recipient) return { outcome: "suppress", resolve: true }
  if (!preferences.email_enabled || !event.judging_reminders_enabled) return { outcome: "suppress" }
  const round = rounds.find((item) => item.id === notification.round_id)
  if (notification.round_id && round?.status !== "active") return { outcome: "suppress", resolve: true }
  const now = new Date()
  const window = resolveJudgingWindow(event, round, now)
  if (notification.metadata.deadline && notification.metadata.deadline !== window.closesAt) return { outcome: "suppress", resolve: true }
  const pending = assignments.filter((assignment) => !assignment.is_complete && assignment.judge_participant_id === recipient?.id && (!assignment.round_id || assignment.round_id === notification.round_id))
  const open = context.scheduledWindowOpen !== false && ["active", "judging"].includes(event.status) && (window.state === "open" || (window.state === "unscheduled" && (event.status === "judging" || round?.status === "active" || ["preliminaries", "finals"].includes(event.phase ?? ""))))
  if (context.scheduledWindowOpen === false && window.state === "open" && pending.length && ["work_ready", "work_added", "scores_due", "daily_digest", "manual_reminder"].includes(notification.kind)) return { outcome: "defer" }
  if (["work_ready", "work_added", "scores_due", "daily_digest", "manual_reminder"].includes(notification.kind) && (!pending.length || !open)) return { outcome: "suppress", resolve: true }
  if (notification.kind === "daily_digest" && !preferences.daily_digest) return { outcome: "suppress", resolve: true }
  if (notification.kind === "deadline_changed" && (!pending.length || ["closed", "invalid"].includes(window.state))) return { outcome: "suppress", resolve: true }
  if (notification.kind === "scores_due" && notification.metadata.urgency !== "urgent" && window.closesAt && Date.parse(window.closesAt) - now.getTime() <= HOUR) return { outcome: "suppress", resolve: true }
  if (notification.kind === "preparation" && (window.state !== "upcoming" || !window.opensAt || notification.metadata.opensAt !== window.opensAt || Date.parse(window.opensAt) - now.getTime() > 24 * HOUR)) return { outcome: "suppress", resolve: true }
  if (notification.kind === "organizer_progress" && (["upcoming", "invalid"].includes(window.state) || !assignments.some((assignment) => !assignment.is_complete))) return { outcome: "suppress", resolve: true }
  if (notification.kind === "organizer_readiness") {
    if (!organizerReadinessDue(window, context.scheduledWindowOpen, now) || notification.metadata.opensAt !== window.opensAt) return { outcome: "suppress", resolve: true }
    const { getOrganizerTaskBoard } = await import("@/lib/services/organizer-action-items")
    const tasks = await getOrganizerTaskBoard(event.id, { state: "pending", limit: 100 })
    if (window.state !== "open" && !tasks.items.some((item) => /judg|prize|scor|round|assign/i.test(item.label))) return { outcome: "suppress", resolve: true }
  }
  const urgent = notification.metadata.urgency === "urgent" || (["work_ready", "work_added"].includes(notification.kind) && !!window.closesAt && Date.parse(window.closesAt) - now.getTime() <= HOUR)
  const clock = notificationLocalClock(now, preferences.timezone ?? event.judging_timezone ?? "UTC")
  if (!urgent && isJudgingQuietHour(clock.hour, preferences.quiet_start, preferences.quiet_end)) return { outcome: "defer" }
  const recent = await client.from("judging_notifications").select("id").eq("hackathon_id", event.id).eq("clerk_user_id", notification.clerk_user_id).gte("email_sent_at", new Date(now.getTime() - HOUR).toISOString()).limit(1)
  if (recent.error) throw new Error("Could not check reminder cooldown.")
  if (!urgent && recent.data?.length) return { outcome: "defer" }
  if (!organizer && window.closesAt && Date.parse(window.closesAt) <= Date.now()) return { outcome: "suppress", resolve: true }
  return { outcome: "send" }
}

async function boundedDeliveryRecheck(notification: JudgingNotification, budget?: DeliveryBudget): Promise<DeliveryGate> {
  const remaining = Math.min(5_000, (budget?.deadlineAt ?? Infinity) - Date.now())
  if (remaining <= 0) return { outcome: "defer" }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      recheckJudgingDelivery(notification),
      new Promise<DeliveryGate>((_, reject) => { timer = setTimeout(() => reject(new Error("Could not confirm this reminder before the delivery deadline.")), remaining) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function processJudgingNotifications(budget?: DeliveryBudget): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = await withDeliveryLease("judging-notifications", async () => {
    const client = db()
    const now = new Date()
    const { reconcileAcceptedJudgeInvitationScopes } = await import("@/lib/services/judge-invitation-scope")
    const scopeRecovery = await reconcileAcceptedJudgeInvitationScopes()
    const firstPage = await client.from("hackathons").select("id", { count: "exact" }).in("status", ["published", "registration_open", "active", "judging"]).eq("is_test_event", false).order("id").range(0, 9)
    if (firstPage.error) throw new Error("Could not load judging events.")
    const page = Math.floor(now.getTime() / 60_000) % Math.max(1, Math.ceil((firstPage.count ?? 0) / 10))
    const eventPage = page === 0 ? firstPage : await client.from("hackathons").select("id").in("status", ["published", "registration_open", "active", "judging"]).eq("is_test_event", false).order("id").range(page * 10, page * 10 + 9)
    if (eventPage.error) throw new Error("Could not load judging events.")
    let reconciliationFailed = scopeRecovery.failed
    const reconciliationDeadline = Math.min(budget?.deadlineAt ?? Infinity, Date.now() + 10_000)
    const events = eventPage.data ?? []
    const rotation = Math.floor(Math.floor(now.getTime() / 60_000) / Math.max(1, Math.ceil((firstPage.count ?? 0) / 10))) % Math.max(1, events.length)
    for (const event of [...events.slice(rotation), ...events.slice(0, rotation)]) {
      if (Date.now() >= reconciliationDeadline) break
      await reconcileJudgingNotifications(event.id, now).catch(() => { reconciliationFailed++ })
    }
    const { data, error } = await client.from("judging_notifications").select("*").eq("email_required", true).is("email_sent_at", null).is("resolved_at", null).lt("fail_count", 5).lte("scheduled_for", now.toISOString()).or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`).order("scheduled_for").limit(32)
    if (error) throw new Error("Could not load judging reminders.")
    const counts = { sent: 0, failed: reconciliationFailed, skipped: 0 }
    for (const notification of (data ?? []) as JudgingNotification[]) {
      if (!consumeDeliverySlot(budget)) break
      try {
        const { event, judges, assignments, rounds, scheduledWindowOpen } = await loadContext(notification.hackathon_id)
        const preferences = await getJudgingNotificationPreferences(notification.hackathon_id, notification.clerk_user_id)
        const organizer = notification.kind.startsWith("organizer_")
        const recipient = judges.find((judge) => judge.clerk_user_id === notification.clerk_user_id && judge.role === "judge" && judge.judging_scope_ready !== false)
        const authorized = event && (organizer ? (await organizerUserIds(event, judges)).includes(notification.clerk_user_id) : !!recipient)
        const round = rounds.find((item) => item.id === notification.round_id)
        const window = event ? resolveJudgingWindow(event, round, now) : null
        const pending = assignments.filter((assignment) => !assignment.is_complete && assignment.judge_participant_id === recipient?.id && (!assignment.round_id || assignment.round_id === notification.round_id))
        const judgingOpen = !!event && scheduledWindowOpen !== false && ["active", "judging"].includes(event.status) && (window?.state === "open" || (window?.state === "unscheduled" && (event.status === "judging" || round?.status === "active" || ["preliminaries", "finals"].includes(event.phase ?? ""))))
        let actionable = organizer || !["work_ready", "work_added", "scores_due", "daily_digest", "manual_reminder"].includes(notification.kind) || (pending.length > 0 && judgingOpen)
        if (notification.kind === "preparation") actionable = window?.state === "upcoming" && !!window.opensAt && notification.metadata.opensAt === window.opensAt && Date.parse(window.opensAt) - now.getTime() <= 24 * HOUR
        if (notification.kind === "scores_due" && notification.metadata.urgency !== "urgent" && window?.closesAt && Date.parse(window.closesAt) - now.getTime() <= HOUR) actionable = false
        if (notification.kind === "organizer_progress") actionable = !!window && !["upcoming", "invalid"].includes(window.state) && assignments.some((assignment) => !assignment.is_complete && judges.some((judge) => judge.role === "judge" && judge.id === assignment.judge_participant_id))
        if (notification.kind === "organizer_readiness" && event) {
          const { getOrganizerTaskBoard } = await import("@/lib/services/organizer-action-items")
          const tasks = await getOrganizerTaskBoard(event.id, { state: "pending", limit: 100 })
          actionable = !!window && organizerReadinessDue(window, scheduledWindowOpen, now) && notification.metadata.opensAt === window.opensAt && (window.state === "open" || tasks.items.some((item) => /judg|prize|scor|round|assign/i.test(item.label)))
        }
        const validDeadline = !notification.metadata.deadline || notification.metadata.deadline === window?.closesAt
        if (notification.kind === "deadline_changed") actionable = pending.length > 0 && window?.state !== "closed"
        const validRound = !notification.round_id || round?.status === "active"
        if (!validRound) actionable = false
        if (notification.kind === "daily_digest" && !preferences.daily_digest) actionable = false
        if (event && (event.is_test_event || event.status === "draft")) {
          const deferred = await client.from("judging_notifications").update({ next_attempt_at: new Date(now.getTime() + HOUR).toISOString() }).eq("id", notification.id)
          if (deferred.error) throw new Error("Could not keep this reminder queued.")
          counts.skipped++
          continue
        }
        const lifecycleClosed = event && (["completed", "archived"].includes(event.status) || !!event.results_published_at)
        if (event && authorized && !lifecycleClosed && validRound && validDeadline && preferences.email_enabled && event.judging_reminders_enabled && scheduledWindowOpen === false && window?.state === "open" && pending.length && ["work_ready", "work_added", "scores_due", "daily_digest", "manual_reminder"].includes(notification.kind)) {
          const deferred = await client.from("judging_notifications").update({ next_attempt_at: new Date(now.getTime() + 60_000).toISOString() }).eq("id", notification.id)
          if (deferred.error) throw new Error("Could not wait for judging setup.")
          counts.skipped++
          continue
        }
        if (!event || !authorized || lifecycleClosed || !actionable || !validDeadline || !preferences.email_enabled || !event.judging_reminders_enabled) {
          const { error: skippedError } = await client.from("judging_notifications").update({ email_required: false, ...(!event || lifecycleClosed || !authorized || !actionable || !validDeadline ? { resolved_at: now.toISOString() } : {}) }).eq("id", notification.id)
          if (skippedError) throw new Error("Could not record skipped reminder.")
          counts.skipped++
          continue
        }
        const clock = notificationLocalClock(now, preferences.timezone ?? event.judging_timezone ?? "UTC")
        const urgent = notification.metadata.urgency === "urgent" || (["work_ready", "work_added"].includes(notification.kind) && !!window?.closesAt && Date.parse(window.closesAt) - now.getTime() <= HOUR)
        if (!urgent && isJudgingQuietHour(clock.hour, preferences.quiet_start, preferences.quiet_end)) {
          const deferred = await client.from("judging_notifications").update({ next_attempt_at: new Date(now.getTime() + HOUR).toISOString() }).eq("id", notification.id)
          if (deferred.error) throw new Error("Could not defer the reminder.")
          continue
        }
        const { data: recentlySent, error: recentError } = await client.from("judging_notifications").select("id").eq("hackathon_id", event.id).eq("clerk_user_id", notification.clerk_user_id).gte("email_sent_at", new Date(now.getTime() - HOUR).toISOString()).limit(1)
        if (recentError) throw new Error("Could not check reminder cooldown.")
        if (recentlySent?.length && !urgent) {
          const deferred = await client.from("judging_notifications").update({ next_attempt_at: new Date(now.getTime() + HOUR).toISOString() }).eq("id", notification.id)
          if (deferred.error) throw new Error("Could not defer the reminder.")
          continue
        }
        const { clerkClient } = await import("@clerk/nextjs/server")
        const user = await (await clerkClient()).users.getUser(notification.clerk_user_id)
        const to = user.primaryEmailAddress?.emailAddress
        if (!to) throw new Error("The judge has no delivery email.")
        const { sendJudgingUpdateEmail } = await import("@/lib/email/judging-updates")
        const organizerPending = organizer ? judges.filter((judge) => judge.role === "judge").reduce((sum, judge) => sum + reviewCount(assignments.filter((assignment) => assignment.judge_participant_id === judge.id)), 0) : 0
        const currentNotification = notification.kind === "organizer_progress"
          ? { ...notification, body: `${organizerPending} ${organizerPending === 1 ? "review still needs" : "reviews still need"} scores.` }
          : ["work_ready", "work_added", "scores_due", "daily_digest", "manual_reminder"].includes(notification.kind) ? { ...notification, title: notification.kind === "work_ready" ? "Your projects are ready" : notification.kind === "work_added" ? "More projects to judge" : notification.title, body: `You have ${reviewCount(pending)} ${reviewCount(pending) === 1 ? "review" : "reviews"} left to finish.` } : notification
        let interrupted: DeliveryGate | null = null
        const accepted = await sendJudgingUpdateEmail({ to, notification: currentNotification, eventName: event.name, timezone: preferences.timezone ?? event.judging_timezone ?? "UTC", beforeAttempt: async () => {
          const gate = await boundedDeliveryRecheck(notification, budget)
          if (gate.outcome !== "send") {
            interrupted = gate
            throw Object.assign(new Error("This judging reminder is no longer ready to send."), { name: "judging_notice_suppressed" })
          }
        } })
        const stopped = interrupted as DeliveryGate | null
        if (stopped) {
          const updated = await client.from("judging_notifications").update(stopped.outcome === "defer" ? { next_attempt_at: new Date(Date.now() + 60_000).toISOString() } : { email_required: false, ...(stopped.resolve ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", notification.id)
          if (updated.error) throw new Error("Could not save the reminder's current state.")
          counts.skipped++
          continue
        }
        if (!accepted) throw new Error("The email provider did not accept this reminder.")
        const { error: sentError } = await client.from("judging_notifications").update({ email_sent_at: new Date().toISOString(), last_error: null }).eq("id", notification.id).is("email_sent_at", null)
        if (sentError) throw new Error("Could not save email delivery.")
        counts.sent++
      } catch {
        const attempt = notification.fail_count + 1
        const { error: retryError } = await client.from("judging_notifications").update({ fail_count: attempt, last_error: "The reminder could not be delivered. Try again.", next_attempt_at: new Date(Date.now() + Math.min(60, 5 * 2 ** (attempt - 1)) * 60_000).toISOString() }).eq("id", notification.id)
        if (retryError) throw new Error("Could not record reminder retry.")
        counts.failed++
      }
    }
    return counts
  })
  return result.acquired ? result.value : { sent: 0, failed: 0, skipped: 0 }
}
