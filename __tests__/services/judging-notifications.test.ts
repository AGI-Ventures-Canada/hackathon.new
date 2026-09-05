import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createChainableMock, resetSupabaseMocks, setMockFromImplementation, setMockRpcImplementation, mockClerkClient } from "../lib/supabase-mock"
import { getJudgingInbox, isJudgingQuietHour, notificationLocalClock, updateJudgingNotificationPreferences, reconcileJudgingNotifications, processJudgingNotifications, queueJudgeWorkReminder } from "@/lib/services/judging-notifications"

describe("judging reminders and inbox", () => {
  beforeEach(resetSupabaseMocks)
  it("uses local wall time across daylight saving changes", () => {
    expect(notificationLocalClock(new Date("2026-11-01T13:00:00Z"), "America/Toronto")).toEqual({ date: "2026-11-01", hour: 8 })
    expect(notificationLocalClock(new Date("2026-10-31T12:00:00Z"), "America/Toronto").hour).toBe(8)
  })
  it("honors overnight quiet hours and supports disabling them", () => {
    expect(isJudgingQuietHour(20, 20, 8)).toBe(true)
    expect(isJudgingQuietHour(7, 20, 8)).toBe(true)
    expect(isJudgingQuietHour(8, 20, 8)).toBe(false)
    expect(isJudgingQuietHour(9, 0, 0)).toBe(false)
  })
  it("counts only unresolved unread updates and omits inbox items when disabled", async () => {
    let enabled = true
    setMockFromImplementation((table) => createChainableMock({ data: table === "judging_notification_preferences" ? { in_app_enabled: enabled } : [{ id: "a", read_at: null, resolved_at: null }, { id: "b", read_at: null, resolved_at: "2026-09-05T00:00:00Z" }], error: null }))
    expect((await getJudgingInbox("event", "judge")).unreadCount).toBe(1)
    enabled = false
    expect((await getJudgingInbox("event", "judge")).items).toHaveLength(0)
  })
  it("rejects invalid preference time zones before writing", async () => {
    await expect(updateJudgingNotificationPreferences("event", "judge", { timezone: "Bogus/Zone" })).rejects.toThrow("valid time zone")
  })
  it("identifies a failed visibility lookup without logging database details or recipient data", async () => {
    setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
    setMockRpcImplementation(() => Promise.resolve({ data: null, error: { code: "PGRST202", message: "private recipient@example.com" } }))
    const originalError = console.error
    const logged = mock(() => {})
    console.error = logged
    try {
      await expect(reconcileJudgingNotifications("event")).rejects.toThrow("Could not check judging progress.")
      expect(logged).toHaveBeenCalledWith("Judging database operation failed.", { operation: "notification_visibility", code: "PGRST202" })
      expect(JSON.stringify(logged.mock.calls)).not.toContain("recipient@example.com")
    } finally {
      console.error = originalError
    }
  })
})

type UpdateInput = { beforeAttempt?: () => Promise<void> }
const sendUpdate = mock(async (_input: UpdateInput) => true)
mock.module("@/lib/email/judging-updates", () => ({ sendJudgingUpdateEmail: sendUpdate }))
mock.module("@/lib/services/organizer-action-items", () => ({ getOrganizerTaskBoard: async () => ({ items: [] }) }))

type Row = Record<string, unknown>
function memoryStore(now: Date) {
  const rows: Record<string, Row[]> = {
    hackathons: [{ id: "event", name: "Build", slug: "build", status: "judging", phase: null, tenant_id: "tenant", is_test_event: false, judging_reminders_enabled: true, results_published_at: null, judging_timezone: "UTC", judging_opens_at: new Date(now.getTime() - 3_600_000).toISOString(), judging_closes_at: new Date(now.getTime() + 48 * 3_600_000).toISOString() }],
    hackathon_participants: [{ id: "judge", clerk_user_id: "user", role: "judge", hackathon_id: "event", team_id: "own-team" }],
    judge_assignments: [{ id: "a", hackathon_id: "event", judge_participant_id: "judge", is_complete: false, round_id: null, submission: { status: "submitted", team_id: "other-team" } }],
    judging_rounds: [], judging_notifications: [], judge_invitations: [], rate_limits: [], tenants: [],
    judging_notification_preferences: [{ hackathon_id: "event", clerk_user_id: "user", email_enabled: true, in_app_enabled: true, daily_digest: false, quiet_start: 0, quiet_end: 0, timezone: "UTC" }],
  }
  let skipReconcile = false
  let hiddenIds: string[] = []
  setMockRpcImplementation((name) => name === "get_judging_visible_assignment_ids" ? Promise.resolve({ data: rows.judge_assignments.filter((row) => !hiddenIds.includes(String(row.id))).map((row) => row.id), error: null }) : Promise.resolve({ data: null, error: null }))
  setMockFromImplementation((table) => {
    const chain = createChainableMock({ data: null, error: null })
    const filters: Array<(row: Row) => boolean> = []
    let single = false
    let update: Row | null = null
    let insert: Row | null = null
    let remove = false
    let selected = "*"
    chain.select.mockImplementation((...args: unknown[]) => { selected = String(args[0] ?? "*"); return chain })
    chain.eq.mockImplementation((...args: unknown[]) => { filters.push((row) => row[String(args[0])] === args[1]); return chain })
    chain.is.mockImplementation((...args: unknown[]) => { filters.push((row) => (row[String(args[0])] ?? null) === args[1]); return chain })
    chain.in.mockImplementation((...args: unknown[]) => { filters.push((row) => (args[1] as unknown[]).includes(row[String(args[0])]) || String(args[0]).includes(".")); return chain })
    for (const method of ["lt", "lte", "gt", "gte"] as const) chain[method].mockImplementation((...args: unknown[]) => { filters.push((row) => {
      const a = row[String(args[0])] as string | number | null, b = args[1] as string | number
      if (a == null) return false
      return method === "lt" ? a < b : method === "lte" ? a <= b : method === "gt" ? a > b : a >= b
    }); return chain })
    chain.update.mockImplementation((...args: unknown[]) => { update = args[0] as Row; return chain })
    chain.upsert.mockImplementation((...args: unknown[]) => { insert = args[0] as Row; return chain })
    chain.insert.mockImplementation((...args: unknown[]) => { insert = args[0] as Row; return chain })
    chain.delete.mockImplementation(() => { remove = true; return chain })
    chain.maybeSingle.mockImplementation(() => { single = true; return chain })
    chain.single.mockImplementation(() => { single = true; return chain })
    chain.then = (resolve) => {
      if (table === "judge_assignments" && selected.includes("prize:prizes(")) {
        return resolve({ data: null, error: { code: "PGRST201", message: "Choose the direct prize relation or coverage relation." } })
      }
      rows[table] ??= []
      const matches = rows[table].filter((row) => filters.every((filter) => filter(row)))
      if (insert) {
        const value = insert as Row
        if (!rows[table].some((row) => table === "judging_notifications" && row.kind === value.kind && row.identity === value.identity && row.clerk_user_id === value.clerk_user_id)) rows[table].unshift({ id: `row-${rows[table].length}`, created_at: now.toISOString(), email_sent_at: null, read_at: null, resolved_at: null, fail_count: 0, ...value })
      }
      if (update) matches.forEach((row) => Object.assign(row, update))
      if (remove) rows[table] = rows[table].filter((row) => !matches.includes(row))
      const data = table === "hackathons" && selected === "id" && skipReconcile ? [] : matches
      return resolve({ data: single ? data[0] ?? null : data, error: null, count: data.length })
    }
    return chain
  })
  return { rows, skipReconcile: () => { skipReconcile = true }, hideAssignments: (ids: string[]) => { hiddenIds = ids } }
}

function queuedNotification(now: Date, changes: Row = {}): Row {
  return { id: "notice", hackathon_id: "event", clerk_user_id: "user", round_id: null, kind: "work_ready", identity: "ready", title: "Your projects are ready", body: "Old count", action_path: "/e/build/judge", metadata: {}, scheduled_for: new Date(now.getTime() - 60_000).toISOString(), email_required: true, email_sent_at: null, resolved_at: null, fail_count: 0, created_at: new Date(now.getTime() - 2 * 3_600_000).toISOString(), ...changes }
}

describe("judging cadence and send-time checks", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    sendUpdate.mockClear()
    sendUpdate.mockImplementation(async (input) => {
      try { await input.beforeAttempt?.(); return true } catch { return false }
    })
    mockClerkClient.mockResolvedValue({ users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "judge@example.com" } }) } } as unknown)
  })
  it("prepares judges once within 24 hours of the real opening", async () => {
    const now = new Date("2026-09-05T14:00:00Z"), store = memoryStore(now)
    Object.assign(store.rows.hackathons[0], { status: "active", judging_opens_at: "2026-09-06T13:00:00Z" })
    await reconcileJudgingNotifications("event", now)
    await reconcileJudgingNotifications("event", now)
    expect(store.rows.judging_notifications.filter((row) => row.kind === "preparation")).toHaveLength(1)
    expect(store.rows.judging_notifications.some((row) => row.kind === "work_ready")).toBe(false)
  })
  it("does not emit a 24-hour reminder in the default two-hour window", async () => {
    const now = new Date("2026-09-05T14:00:00Z"), store = memoryStore(now)
    Object.assign(store.rows.hackathons[0], { judging_opens_at: now.toISOString(), judging_closes_at: "2026-09-05T16:00:00Z" })
    await reconcileJudgingNotifications("event", now)
    await reconcileJudgingNotifications("event", new Date("2026-09-05T14:05:00Z"))
    expect(store.rows.judging_notifications.filter((row) => row.kind === "scores_due")).toHaveLength(0)
    await reconcileJudgingNotifications("event", new Date("2026-09-05T15:00:00Z"))
    const due = store.rows.judging_notifications.filter((row) => row.kind === "scores_due")
    expect(due).toHaveLength(1)
    expect(due[0].metadata).toMatchObject({ urgency: "urgent" })
  })
  it("groups a pick ballot as one review and removes self-judging projects", async () => {
    const now = new Date("2026-09-05T14:00:00Z"), store = memoryStore(now)
    const base = store.rows.judge_assignments[0]
    store.rows.judge_assignments = [ { ...base, prize_id: "prize", prize: { judging_style: "judges_pick" } }, { ...base, id: "b", prize_id: "prize", prize: { judging_style: "judges_pick" } }, { ...base, id: "self", submission: { status: "submitted", team_id: "own-team" } } ]
    await reconcileJudgingNotifications("event", now)
    expect(store.rows.judging_notifications.find((row) => row.kind === "work_ready")?.body).toBe("You have 1 review left to finish.")
  })
  it("debounces new assignments and resolves the old count", async () => {
    const now = new Date("2026-09-05T14:00:00Z"), store = memoryStore(now)
    await reconcileJudgingNotifications("event", now)
    store.rows.judge_assignments.push({ ...store.rows.judge_assignments[0], id: "b" })
    await reconcileJudgingNotifications("event", now)
    const added = store.rows.judging_notifications.find((row) => row.kind === "work_added")
    expect(added?.scheduled_for).toBe("2026-09-05T14:15:00.000Z")
    expect(store.rows.judging_notifications.find((row) => row.kind === "work_ready")?.resolved_at).not.toBeNull()
  })
  it("replaces old deadline reminders and completes the inbox without another email", async () => {
    const now = new Date("2026-09-05T14:00:00Z"), store = memoryStore(now)
    await reconcileJudgingNotifications("event", now)
    store.rows.hackathons[0].judging_closes_at = "2026-09-08T14:00:00Z"
    await reconcileJudgingNotifications("event", now)
    expect(store.rows.judging_notifications.some((row) => row.kind === "deadline_changed")).toBe(true)
    store.rows.judge_assignments[0].is_complete = true
    await reconcileJudgingNotifications("event", now)
    expect(store.rows.judging_notifications.find((row) => row.kind === "all_done")?.email_required).toBe(false)
  })
  it("keeps daily digests opt-in and only for long judging windows", async () => {
    const now = new Date("2026-09-05T14:00:00Z"), store = memoryStore(now)
    await reconcileJudgingNotifications("event", now)
    expect(store.rows.judging_notifications.some((row) => row.kind === "daily_digest")).toBe(false)
    store.rows.judging_notification_preferences[0].daily_digest = true
    await reconcileJudgingNotifications("event", now)
    await reconcileJudgingNotifications("event", now)
    expect(store.rows.judging_notifications.filter((row) => row.kind === "daily_digest")).toHaveLength(1)
  })
  it("does not ask organizers for scores before judging opens", async () => {
    const now = new Date("2026-09-05T14:00:00Z"), store = memoryStore(now)
    store.rows.tenants.push({ id: "tenant", clerk_user_id: "organizer" })
    store.rows.hackathons[0].judging_opens_at = "2026-09-06T20:00:00Z"
    await reconcileJudgingNotifications("event", now)
    expect(store.rows.judging_notifications.some((row) => row.kind === "organizer_progress")).toBe(false)
  })
  it("rechecks role, assignments, deadlines, preferences, and publication before delivery", async () => {
    for (const change of ["role", "complete", "deleted", "deadline", "preference", "published", "closed_round", "scope", "not_active", "scope_pending"]) {
      const now = new Date(), store = memoryStore(now)
      store.skipReconcile()
      store.rows.judging_notifications.push(queuedNotification(now))
      if (change === "role") store.rows.hackathon_participants[0].role = "participant"
      if (change === "complete") store.rows.judge_assignments[0].is_complete = true
      if (change === "deleted") store.rows.judge_assignments = []
      if (change === "deadline") store.rows.judging_notifications[0].metadata = { deadline: "2000-01-01T00:00:00Z" }
      if (change === "preference") store.rows.judging_notification_preferences[0].email_enabled = false
      if (change === "published") store.rows.hackathons[0].results_published_at = now.toISOString()
      if (change === "closed_round") store.rows.judging_notifications[0].round_id = "closed"
      if (change === "scope") store.hideAssignments(["a"])
      if (change === "not_active") store.rows.hackathons[0].status = "published"
      if (change === "scope_pending") store.rows.hackathon_participants[0].judging_scope_ready = false
      const result = await processJudgingNotifications()
      expect(result.sent).toBe(0)
      expect(result.skipped).toBe(1)
    }
    expect(sendUpdate).not.toHaveBeenCalled()
  })
  it("keeps draft/test deliveries queued and honors quiet hours", async () => {
    for (const kind of ["draft", "test", "quiet"]) {
      const now = new Date(), store = memoryStore(now)
      store.skipReconcile()
      store.rows.judging_notifications.push(queuedNotification(now))
      if (kind === "draft") store.rows.hackathons[0].status = "draft"
      if (kind === "test") store.rows.hackathons[0].is_test_event = true
      if (kind === "quiet") Object.assign(store.rows.judging_notification_preferences[0], { quiet_start: now.getUTCHours(), quiet_end: (now.getUTCHours() + 1) % 24 })
      await processJudgingNotifications()
      expect(store.rows.judging_notifications[0].email_required).toBe(true)
      expect(store.rows.judging_notifications[0].next_attempt_at).toBeDefined()
    }
    expect(sendUpdate).not.toHaveBeenCalled()
  })
  it("drops preparation emails when the opening changes without changing the deadline", async () => {
    const now = new Date(), store = memoryStore(now)
    store.skipReconcile()
    const oldOpening = new Date(now.getTime() + 3_600_000).toISOString()
    store.rows.hackathons[0].judging_opens_at = new Date(now.getTime() + 30 * 3_600_000).toISOString()
    store.rows.judging_notifications.push(queuedNotification(now, { kind: "preparation", metadata: { opensAt: oldOpening, deadline: store.rows.hackathons[0].judging_closes_at } }))
    expect(await processJudgingNotifications()).toMatchObject({ sent: 0, skipped: 1 })
    expect(store.rows.judging_notifications[0].resolved_at).not.toBeNull()
    expect(sendUpdate).not.toHaveBeenCalled()
  })
  it("replaces a backlogged 24-hour email with the final hour reminder", async () => {
    const now = new Date(), store = memoryStore(now)
    store.skipReconcile()
    Object.assign(store.rows.hackathons[0], { judging_opens_at: new Date(now.getTime() - 48 * 3_600_000).toISOString(), judging_closes_at: new Date(now.getTime() + 30 * 60_000).toISOString() })
    const deadline = store.rows.hackathons[0].judging_closes_at
    store.rows.judging_notifications.push(queuedNotification(now, { id: "old-24h", kind: "scores_due", metadata: { deadline, urgency: "normal" } }), queuedNotification(now, { id: "final-hour", kind: "scores_due", metadata: { deadline, urgency: "urgent" } }))
    Object.assign(store.rows.judging_notification_preferences[0], { quiet_start: now.getUTCHours(), quiet_end: (now.getUTCHours() + 1) % 24 })
    expect(await processJudgingNotifications()).toMatchObject({ sent: 1, skipped: 1 })
    expect(sendUpdate).toHaveBeenCalledWith(expect.objectContaining({ notification: expect.objectContaining({ id: "final-hour" }) }))
    expect(store.rows.judging_notifications[0].resolved_at).not.toBeNull()
  })
  it("checks organizer ownership and recounts progress just before delivery", async () => {
    const now = new Date(), store = memoryStore(now)
    store.skipReconcile()
    store.rows.tenants.push({ id: "tenant", clerk_user_id: "organizer" })
    store.rows.judge_assignments.push({ ...store.rows.judge_assignments[0], id: "done", is_complete: true })
    store.rows.judging_notifications.push(queuedNotification(now, { kind: "organizer_progress", clerk_user_id: "organizer", body: "2 reviews still need scores." }))
    store.rows.judging_notification_preferences.push({ ...store.rows.judging_notification_preferences[0], clerk_user_id: "organizer" })
    expect(await processJudgingNotifications()).toMatchObject({ sent: 1 })
    expect(sendUpdate).toHaveBeenCalledWith(expect.objectContaining({ notification: expect.objectContaining({ body: "1 review still needs scores." }) }))
    store.rows.judging_notifications.push(queuedNotification(now, { id: "next", kind: "organizer_progress", clerk_user_id: "former-owner" }))
    expect(await processJudgingNotifications()).toMatchObject({ sent: 0, skipped: 1 })
  })
  it("lets a late judge's first work notice through quiet hours in the final hour", async () => {
    const now = new Date(), store = memoryStore(now)
    store.skipReconcile()
    store.rows.hackathons[0].judging_closes_at = new Date(now.getTime() + 30 * 60_000).toISOString()
    store.rows.judging_notifications.push(queuedNotification(now, { created_at: now.toISOString() }))
    Object.assign(store.rows.judging_notification_preferences[0], { quiet_start: now.getUTCHours(), quiet_end: (now.getUTCHours() + 1) % 24 })
    expect(await processJudgingNotifications()).toMatchObject({ sent: 1 })
    expect(sendUpdate).toHaveBeenCalledTimes(1)
  })
  it("uses the latest count and a stable delivery identity, then checkpoints acceptance", async () => {
    const now = new Date(), store = memoryStore(now)
    store.skipReconcile()
    store.rows.judging_notifications.push(queuedNotification(now))
    expect(await processJudgingNotifications()).toMatchObject({ sent: 1, failed: 0 })
    expect(sendUpdate).toHaveBeenCalledWith(expect.objectContaining({ notification: expect.objectContaining({ id: "notice", body: "You have 1 review left to finish." }) }))
    expect(store.rows.judging_notifications[0].email_sent_at).not.toBeNull()
    await processJudgingNotifications()
    expect(sendUpdate).toHaveBeenCalledTimes(1)
  })
  it("suppresses work that closes or completes during a delayed Clerk lookup", async () => {
    for (const change of ["deadline", "complete", "preference", "scope"]) {
      const now = new Date(), store = memoryStore(now)
      store.skipReconcile()
      store.rows.judging_notifications.push(queuedNotification(now))
      mockClerkClient.mockResolvedValue({ users: { getUser: async () => {
        await Promise.resolve()
        if (change === "deadline") store.rows.hackathons[0].judging_closes_at = new Date(Date.now() - 1).toISOString()
        if (change === "complete") store.rows.judge_assignments[0].is_complete = true
        if (change === "preference") store.rows.judging_notification_preferences[0].email_enabled = false
        if (change === "scope") store.hideAssignments(["a"])
        return { primaryEmailAddress: { emailAddress: "judge@example.com" } }
      } } } as unknown)
      expect(await processJudgingNotifications()).toMatchObject({ sent: 0, skipped: 1, failed: 0 })
      expect(store.rows.judging_notifications[0].email_sent_at).toBeNull()
      expect(store.rows.judging_notifications[0].fail_count).toBe(0)
      expect(store.rows.judging_notifications[0].email_required).toBe(false)
    }
  })
  it("cancels provider retries after the schedule or judge role changes", async () => {
    for (const change of ["schedule", "role"]) {
      const now = new Date(), store = memoryStore(now)
      store.skipReconcile()
      store.rows.judging_notifications.push(queuedNotification(now, { metadata: { deadline: store.rows.hackathons[0].judging_closes_at } }))
      let providerAttempts = 0
      sendUpdate.mockImplementation(async (input) => {
        await input.beforeAttempt?.()
        providerAttempts++
        if (change === "schedule") store.rows.hackathons[0].judging_closes_at = new Date(now.getTime() + 24 * 3_600_000).toISOString()
        if (change === "role") store.rows.hackathon_participants[0].role = "participant"
        try { await input.beforeAttempt?.(); providerAttempts++; return true } catch { return false }
      })
      expect(await processJudgingNotifications()).toMatchObject({ sent: 0, skipped: 1, failed: 0 })
      expect(providerAttempts).toBe(1)
      expect(store.rows.judging_notifications[0].resolved_at).not.toBeNull()
      expect(store.rows.judging_notifications[0].fail_count).toBe(0)
    }
  })
  it("backs off failed sends and limits retry attempts", async () => {
    const now = new Date(), store = memoryStore(now)
    store.skipReconcile()
    store.rows.judging_notifications.push(queuedNotification(now, { fail_count: 4 }))
    sendUpdate.mockResolvedValue(false)
    expect(await processJudgingNotifications()).toMatchObject({ failed: 1, sent: 0 })
    expect(store.rows.judging_notifications[0].fail_count).toBe(5)
    expect(store.rows.judging_notifications[0].email_sent_at).toBeNull()
    await processJudgingNotifications()
    expect(sendUpdate).toHaveBeenCalledTimes(1)
  })
  it("previews manual work reminders without writing, then enforces a daily cooldown", async () => {
    const now = new Date(), store = memoryStore(now)
    expect(await queueJudgeWorkReminder("event", "user", true)).toMatchObject({ outcome: "ready" })
    expect(store.rows.judging_notifications).toHaveLength(0)
    expect(await queueJudgeWorkReminder("event", "user")).toMatchObject({ outcome: "reminded", delivery: "queued" })
    expect(await queueJudgeWorkReminder("event", "user")).toMatchObject({ outcome: "cooldown" })
    store.rows.judge_assignments[0].is_complete = true
    expect(await queueJudgeWorkReminder("event", "user")).toMatchObject({ outcome: "blocked" })
  })
  it("uses one review per ballot in the organizer's reminder preview", async () => {
    const now = new Date(), store = memoryStore(now)
    const ballot = { ...store.rows.judge_assignments[0], prize_id: "pick-prize", prize: { judging_style: "judges_pick" } }
    store.rows.judge_assignments = [ballot, { ...ballot, id: "b" }]
    expect(await queueJudgeWorkReminder("event", "user", true)).toMatchObject({ outcome: "ready", message: "Remind this judge about 1 unfinished review." })
    expect(store.rows.judging_notifications).toHaveLength(0)
  })
})
