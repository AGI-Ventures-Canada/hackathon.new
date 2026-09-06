import {beforeEach, describe, expect, it, mock} from "bun:test"
import type {Principal} from "@/lib/auth/types"

const principal: Principal = {kind: "user", tenantId: "org_1", userId: "user_1", orgId: "org_1", orgRole: "org:admin", scopes: ["hackathons:read", "hackathons:write"]}
let authorized = true
class SetupError extends Error {constructor(public code: string, message: string) {super(message)}}
const inspect = mock(async (_id: string) => ({id: "event", version: "2026-09-05T12:00:00.000Z"}))
const configure = mock(async (_id: string, _body: unknown) => ({id: "event", version: "2026-09-05T13:00:00.000Z"}))
const preview = mock(async (_id: string, _body: unknown) => ({version: "distribution1", assignments: []}))
const apply = mock(async (_id: string, _body: unknown) => ({createdAssignments: 3, createdCoverage: 6}))
mock.module("@/lib/services/judging-setup", () => ({getJudgingSetup: inspect, configureJudgingSetup: configure, JudgingSetupError: SetupError}))
mock.module("@/lib/services/judging-distribution", () => ({getJudgingDistributionPreview: preview, applyJudgingDistribution: apply}))
const reconcile = mock(async () => {})
mock.module("@/lib/services/judging-notifications", () => ({reconcileJudgingNotifications: reconcile}))
mock.module("@/lib/services/public-hackathons", () => ({checkHackathonOrganizer: mock(async () => ({status: authorized ? "ok" : "forbidden"}))}))
mock.module("@/lib/services/audit", () => ({logAudit: mock(async () => {})}))
mock.module("@/lib/services/rate-limit", () => ({checkRateLimit: async () => ({allowed: true}), RateLimitError: class extends Error {}}))
mock.module("@/lib/auth/principal", () => ({resolvePrincipal: async () => principal, requirePrincipal: (value: Principal, kinds: string[], scopes: string[]) => {if (!kinds.includes(value.kind) || !Reflect.get(value, "scopes")?.includes(scopes[0])) throw new Error("denied")}}))
const {Elysia} = await import("elysia")
const {dashboardJudgingSetupRoutes} = await import("@/lib/api/routes/dashboard-judging-setup")
const app = new Elysia({prefix: "/api/dashboard"}).use(dashboardJudgingSetupRoutes)
const id = "11111111-1111-4111-8111-111111111111"
function call(path: string, method = "GET", body?: unknown) {return app.handle(new Request(`http://localhost/api/dashboard/hackathons/${id}/judging/${path}`, {method, headers: {"Content-Type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {})}))}

describe("mounted judging setup API", () => {
  beforeEach(() => {authorized = true; inspect.mockClear(); configure.mockClear(); apply.mockClear(); preview.mockClear()})
  it("inspects canonical setup only for this event's organizers", async () => {
    expect((await call("setup")).status).toBe(200)
    expect(inspect).toHaveBeenCalledWith(id)
    authorized = false
    expect((await call("setup")).status).toBe(403)
    expect(inspect).toHaveBeenCalledTimes(1)
  })
  it("rejects missing configuration versions before any write", async () => {
    expect((await call("setup", "PATCH", {applyStarter: true})).status).toBe(422)
    expect(configure).not.toHaveBeenCalled()
  })
  it("forwards the version and durable key on starter saves", async () => {
    const body = {expectedVersion: "2026-09-05T12:00:00Z", requestKey: "starter-1", applyStarter: true}
    expect((await call("setup", "PATCH", body)).status).toBe(200)
    expect(configure).toHaveBeenCalledWith(id, body)
  })
  it("returns recoverable stale configuration conflicts", async () => {
    configure.mockRejectedValueOnce(new SetupError("judging_changed", "Judging changed. Reload settings."))
    const response = await call("setup", "PATCH", {expectedVersion: "2026-09-05T12:00:00Z", requestKey: "starter-1", applyStarter: true})
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({code: "judging_changed"})
  })
  it("previews without applying and validates coverage targets", async () => {
    expect((await call("distribution/preview", "POST", {targetReviewsPerProject: 3})).status).toBe(200)
    expect(apply).not.toHaveBeenCalled()
    expect((await call("distribution/apply", "POST", {targetReviewsPerProject: 0, expectedVersion: "v1", requestKey: "apply-123"})).status).toBe(422)
    expect(apply).not.toHaveBeenCalled()
  })
  it("returns committed assignments when notification reconciliation fails", async () => {
    reconcile.mockRejectedValueOnce(new Error("notification database unavailable"))
    const response = await call("distribution/apply", "POST", {targetReviewsPerProject: 3, expectedVersion: "v1", requestKey: "apply-with-notification-outage"})
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({createdAssignments: 3})
  })
  it("retains assignment retry inputs and returns canonical counts", async () => {
    const body = {targetReviewsPerProject: 3, expectedVersion: "v1", requestKey: "apply-123"}
    const response = await call("distribution/apply", "POST", body)
    expect(response.status).toBe(200)
    expect(apply).toHaveBeenCalledWith(id, body)
    expect(await response.json()).toMatchObject({createdAssignments: 3, createdCoverage: 6})
  })
  it("returns an actionable coverage conflict without claiming assignments were saved", async () => {
    apply.mockRejectedValueOnce(new SetupError("judging_uncovered", "Some projects have no eligible judges."))
    const response = await call("distribution/apply", "POST", {targetReviewsPerProject:3,expectedVersion:"v1",requestKey:"apply-123"})
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({code:"judging_uncovered",error:"Some projects have no eligible judges."})
  })
})
