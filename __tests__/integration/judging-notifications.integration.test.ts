import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createChainableMock } from "../lib/supabase-mock"

const id = "11111111-1111-4111-8111-111111111111", requestKey = "22222222-2222-4222-8222-222222222222"
let principal: { kind: string; tenantId: string; userId?: string; keyId?: string } = { kind: "user", tenantId: "tenant", userId: "user" }
let organizer = true, judge = false
let receipt: { payload_hash: string; response?: unknown } | null = null
let writes = 0
const runBatch = mock(async (input: { preview: boolean }) => ({ preview: input.preview, results: [{ email: "judge@example.com", outcome: "invited", delivery: "queued" }] }))
const inbox = mock(async () => ({ items: [], unreadCount: 0, preferences: {} }))
const preferences = mock(async () => ({}))
const read = mock(async () => {})
class AuthError extends Error { constructor(message: string, public status: number) { super(message) } }
mock.module("@/lib/auth/principal", () => ({ AuthError, resolvePrincipal: async () => principal, requirePrincipal: (value: { kind: string }, kinds: string[]) => { if (!kinds.includes(value.kind)) throw new AuthError("Sign in required", 401) } }))
mock.module("@/lib/services/public-hackathons", () => ({ checkHackathonOrganizer: async () => ({ status: organizer ? "ok" : "not_authorized", hackathon: { id, name: "Event", slug: "event", status: "draft", is_test_event: false } }) }))
mock.module("@/lib/services/judging-notifications", () => ({ getJudgingInbox: inbox, updateJudgingNotificationPreferences: preferences, markJudgingNotificationRead: read }))
mock.module("@/lib/services/judging-invite-batch", () => ({ processJudgeInvitationBatch: runBatch }))
mock.module("@/lib/services/delivery-lease", () => ({ withDeliveryLease: async (_key: string, work: () => Promise<unknown>) => ({ acquired: true, value: await work() }) }))
mock.module("@/lib/services/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }))
mock.module("@/lib/services/audit", () => ({ logAudit: async () => {} }))
mock.module("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser: async () => ({ firstName: "Alex" }) } }) }))
mock.module("@/lib/db/client", () => ({ supabase: () => ({ from: (table: string) => {
  const chain = createChainableMock({ data: null, error: null })
  let update: Record<string, unknown> | null = null
  chain.update.mockImplementation((...args: unknown[]) => { update = args[0] as Record<string, unknown>; return chain })
  chain.upsert.mockImplementation((...args: unknown[]) => { update = args[0] as Record<string, unknown>; return chain })
  chain.then = (resolve) => {
    if (update) {
      writes++
      if (table === "judging_invitation_batches") receipt = { ...receipt, ...update } as typeof receipt
    }
    return resolve({ error: null, data: table === "judging_invitation_batches" ? receipt : table === "hackathon_participants" && judge ? { id: "judge" } : null })
  }
  return chain
} }) }))
const { Elysia } = await import("elysia")
const { judgingNotificationRoutes, judgeInvitationPublicRoutes } = await import("@/lib/api/routes/judging-notifications")
const app = new Elysia().onError(({ error, set }) => { if (error instanceof AuthError) { set.status = error.status; return { error: error.message } } }).use(judgingNotificationRoutes).use(judgeInvitationPublicRoutes)
function call(path: string, method = "GET", body?: unknown) { return app.handle(new Request(`http://localhost/hackathons/${id}/judging/${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })) }

describe("judging inbox and invitation API", () => {
  beforeEach(() => { principal = { kind: "user", tenantId: "tenant", userId: "user" }; organizer = true; judge = false; receipt = null; writes = 0; runBatch.mockClear(); inbox.mockClear(); read.mockClear(); preferences.mockClear() })
  it("returns only the current user's inbox for an organizer or assigned judge", async () => {
    expect((await call("notifications")).status).toBe(200)
    expect(inbox).toHaveBeenCalledWith(id, "user")
    organizer = false; judge = true
    expect((await call("notifications")).status).toBe(200)
    expect(inbox).toHaveBeenCalledTimes(2)
  })
  it("rejects unrelated users and API keys for personal notification access", async () => {
    organizer = false
    expect((await call("notifications")).status).toBe(404)
    principal = { kind: "api_key", tenantId: "tenant", keyId: "key" }
    expect((await call("notifications")).status).toBe(401)
    expect(inbox).not.toHaveBeenCalled()
  })
  it("validates preferences and scopes mark-read to the current user", async () => {
    expect((await call("notification-preferences", "PATCH", { quiet_start: 24 })).status).toBe(422)
    expect(preferences).not.toHaveBeenCalled()
    expect((await call(`notifications/${requestKey}/read`, "POST")).status).toBe(200)
    expect(read).toHaveBeenCalledWith(id, "user", requestKey)
  })
  it("requires a durable key for sending and writes nothing for preview", async () => {
    expect((await call("judges/batch", "POST", { emails: ["judge@example.com"] })).status).toBe(400)
    expect(runBatch).not.toHaveBeenCalled()
    expect((await call("judges/batch", "POST", { emails: ["judge@example.com"], preview: true })).status).toBe(200)
    expect(writes).toBe(0)
    expect(runBatch).toHaveBeenCalledWith(expect.objectContaining({ preview: true }))
  })
  it("replays exact batch results and rejects changed content under the same key", async () => {
    const body = { emails: ["judge@example.com"], requestKey, message: "Please help", prizeIds: [id], retryFailed: true }
    const first = await call("judges/batch", "POST", body)
    expect(first.status).toBe(200)
    expect(await (await call("judges/batch", "POST", body)).json()).toEqual(await first.json())
    expect(runBatch).toHaveBeenCalledTimes(1)
    expect((await call("judges/batch", "POST", { ...body, message: "Different" })).status).toBe(409)
    expect(runBatch).toHaveBeenCalledTimes(1)
  })
  it("blocks organizer mutations for unrelated users", async () => {
    organizer = false; judge = true
    expect((await call("judges/remind", "POST", { emails: ["judge@example.com"], requestKey })).status).toBe(404)
    expect(runBatch).not.toHaveBeenCalled()
  })
  it("makes the one-click invitation opt-out idempotent without an account", async () => {
    const url = `http://localhost/judge-invitations/${"a".repeat(43)}/unsubscribe`
    expect((await app.handle(new Request(url, { method: "POST" }))).status).toBe(200)
    expect((await app.handle(new Request(url, { method: "POST" }))).status).toBe(200)
    expect(writes).toBe(2)
  })
})
