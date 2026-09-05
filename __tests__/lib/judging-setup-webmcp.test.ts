import {describe, expect, it} from "bun:test"
import {createJudgingSetupTools} from "@/lib/webmcp/judging-setup-tools"

describe("judging task WebMCP tools", () => {
  it("uses the canonical scoped assignment endpoint and retry key", async () => {
    let sent: {url: string; body: unknown} | null = null
    const tools = createJudgingSetupTools({hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async (url, init) => {sent = {url: String(url), body: JSON.parse(String(init?.body))}; return Response.json({createdAssignments: 3, createdCoverage: 6})}})
    const tool = tools.find((tool) => tool.name === "apply_judging_work")!
    const result = await tool.execute({judgesPerProject: 3, expectedVersion: "v1", requestKey: "retry-123"})
    expect(result.ok).toBe(true)
    expect(sent).toEqual({url: "/api/dashboard/hackathons/event/judging/distribution/apply", body: {expectedVersion: "v1", requestKey: "retry-123", targetReviewsPerProject: 3}})
  })
  it("keeps preview and per-recipient queued outcomes explicit", async () => {
    let body: unknown
    const tools = createJudgingSetupTools({hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async (_url, init) => {body = JSON.parse(String(init?.body)); return Response.json({preview: true, results: [{email: "judge@example.com", outcome: "ready", delivery: "queued"}]})}})
    const result = await tools.find((tool) => tool.name === "invite_judging_panel")!.execute({emails: ["judge@example.com"]})
    expect(body).toEqual({emails: ["judge@example.com"], preview: true})
    expect(JSON.stringify(result)).toContain('"queued"')
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
  })
  it("returns recoverable conflicts without hiding lost writes", async () => {
    const tools = createJudgingSetupTools({hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async () => Response.json({error: "Judging changed.", code: "judging_changed"}, {status: 409})})
    const result = await tools.find((tool) => tool.name === "configure_judging")!.execute({expectedVersion: "2026-09-05T12:00:00Z", requestKey: "retry", settings: {timezone: "America/Toronto"}})
    expect(result).toMatchObject({ok: false, error: {code: "judging_changed", retryable: true}})
  })
  it("requires a preview version before applying assignments", async () => {
    let called = false
    const tools = createJudgingSetupTools({hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async () => {called = true; return Response.json({})}})
    expect((await tools.find((tool) => tool.name === "apply_judging_work")!.execute({judgesPerProject: 3})).ok).toBe(false)
    expect(called).toBe(false)
  })
  it("uses the same advanced scope and manual project routes", async () => {
    const sent: Array<{url:string;method:string|undefined;body:unknown}> = []
    const tools = createJudgingSetupTools({hackathonId:"event",slug:"demo",navigate:()=>{},refresh:()=>{},fetcher:async(url,init)=>{sent.push({url:String(url),method:init?.method,body:init?.body ? JSON.parse(String(init.body)) : undefined});return Response.json({success:true})}})
    const judgeId="11111111-1111-4111-8111-111111111111", prizeId="22222222-2222-4222-8222-222222222222", projectId="33333333-3333-4333-8333-333333333333"
    expect((await tools.find((tool)=>tool.name==="save_judge_scope")!.execute({judgeId,expectedVersion:"v1",prizeScope:"selected",prizeIds:[prizeId],roomIds:[]})).ok).toBe(true)
    expect(sent[0]).toEqual({url:`/api/dashboard/hackathons/event/judging/judges/${judgeId}/scope`,method:"PATCH",body:{expectedVersion:"v1",prizeScope:"selected",prizeIds:[prizeId],roomIds:[]}})
    expect((await tools.find((tool)=>tool.name==="assign_judge_project")!.execute({judgeId,prizeId,projectId,assigned:false})).ok).toBe(true)
    expect(sent[1]).toEqual({url:`/api/dashboard/hackathons/event/judging/judges/${judgeId}/submissions/${projectId}?prizeId=${prizeId}`,method:"DELETE",body:undefined})
  })
  it("pages scope options without exposing unrelated judge details", async () => {
    const tools = createJudgingSetupTools({hackathonId:"event",slug:"demo",navigate:()=>{},refresh:()=>{},fetcher:async()=>Response.json({options:{version:"v1",locked:false,prizeScope:"selected",prizeIds:["p1"],roomIds:[],prizes:Array.from({length:20},(_,i)=>({id:`p${i}`,name:`Prize ${i}`,style:"gate_check"})),rooms:[]}})})
    const result=await tools.find((tool)=>tool.name==="inspect_judge_scope")!.execute({judgeId:"11111111-1111-4111-8111-111111111111",section:"prizes",limit:2})
    expect(result).toMatchObject({ok:true,data:{version:"v1",nextOffset:2,items:[{id:"p0",selected:false},{id:"p1",selected:true}]}})
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
  })
  it("discovers the judge and room IDs needed for scope edits and invitations", async () => {
    const judgeId = "11111111-1111-4111-8111-111111111111"
    const roomId = "22222222-2222-4222-8222-222222222222"
    const sent: string[] = []
    const tools = createJudgingSetupTools({ hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async (url) => {
      sent.push(String(url))
      return String(url).endsWith("/scope")
        ? Response.json({ options: { version: "v1", prizeScope: "all", prizeIds: [], roomIds: [roomId], locked: false, rooms: [{ id: roomId, name: "Main stage" }], prizes: [] } })
        : Response.json({ setup: { version: "v1", judges: [{ participantId: judgeId, displayName: "Alex", email: "alex@example.com", assignmentCount: 2, completedCount: 0 }], rooms: [{ id: roomId, name: "Main stage" }] } })
    } })
    const inspect = tools.find((tool) => tool.name === "inspect_judging")!
    const judges = await inspect.execute({ section: "judges" })
    expect(judges).toMatchObject({ ok: true, data: { items: [{ judgeId, name: "Alex" }] } })
    expect(await inspect.execute({ section: "rooms" })).toMatchObject({ ok: true, data: { items: [{ id: roomId, name: "Main stage" }] } })
    expect((await tools.find((tool) => tool.name === "inspect_judge_scope")!.execute({ judgeId, section: "rooms" })).ok).toBe(true)
    expect(sent[2]).toBe(`/api/dashboard/hackathons/event/judging/judges/${judgeId}/scope`)
  })
  it("rejects malformed scope IDs before fetching and preserves API conflicts", async () => {
    let called = 0
    const tools = createJudgingSetupTools({ hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async () => { called++; return Response.json({ error: "Judging changed. Inspect this judge again." }, { status: 409 }) } })
    const save = tools.find((tool) => tool.name === "save_judge_scope")!
    expect((await save.execute({ judgeId: "not-a-uuid", expectedVersion: "v1", prizeScope: "all", prizeIds: [], roomIds: [] })).ok).toBe(false)
    expect(called).toBe(0)
    const result = await save.execute({ judgeId: "11111111-1111-4111-8111-111111111111", expectedVersion: "old", prizeScope: "all", prizeIds: [], roomIds: [] })
    expect(result).toMatchObject({ ok: false, error: { retryable: true } })
    expect(JSON.stringify(result)).toContain("Inspect this judge again")
  })
  it("uses canonical invitation delivery and reminder eligibility without inventing a schedule", async () => {
    const tools = createJudgingSetupTools({ hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async () => Response.json({ setup: { version: "v1", invitations: [{ email: "judge@example.com", status: "pending", delivery: "failed", emailedAt: null, remindedAt: "2026-09-05T12:00:00Z", nextAttemptAt: null, nextReminderAt: null, canRemind: false, canRetry: false }] } }) })
    const result = await tools.find((tool) => tool.name === "inspect_judging")!.execute({ section: "invitations" })
    expect(result).toMatchObject({ ok: true, data: { items: [{ delivery: "failed", nextAttemptAt: null, remindAvailableAt: null, canRemind: false, canRetry: false }] } })
    expect(JSON.stringify(result)).not.toContain("2026-09-06T12:00:00")
  })
  it("keeps long judge names and email addresses inside the response budget", async () => {
    const tools = createJudgingSetupTools({ hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async () => Response.json({ setup: { version: "2026-09-05T12:00:00.000Z", judges: Array.from({ length: 3 }, () => ({ participantId: "11111111-1111-4111-8111-111111111111", displayName: "Name ".repeat(50), email: "a".repeat(242) + "@example.com", assignmentCount: 1000, completedCount: 1000 })) } }) })
    const result = await tools.find((tool) => tool.name === "inspect_judging")!.execute({ section: "judges" })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
  })
  it("previews reminders on the canonical route and preserves per-person cooldowns", async () => {
    const requests: Array<{ url: string; body: unknown }> = []
    const tools = createJudgingSetupTools({ hackathonId: "event", slug: "demo", navigate: () => {}, refresh: () => {}, fetcher: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return Response.json({ preview: true, results: [{ email: "judge@example.com", outcome: "cooldown", message: "Wait a day before reminding this judge again." }] })
    } })
    const remind = tools.find((tool) => tool.name === "remind_judging_panel")!
    const result = await remind.execute({ emails: ["judge@example.com"] })
    expect(requests[0]).toEqual({ url: "/api/dashboard/hackathons/event/judging/judges/remind", body: { emails: ["judge@example.com"], preview: true } })
    expect(result).toMatchObject({ ok: true, data: { preview: true, results: [{ outcome: "cooldown" }] } })
    const requestKey = "11111111-1111-4111-8111-111111111111"
    await remind.execute({ emails: ["judge@example.com"], preview: false, requestKey })
    expect(requests[1].body).toEqual({ emails: ["judge@example.com"], preview: false, requestKey })
    expect((await remind.execute({ emails: Array.from({ length: 4 }, (_, i) => `judge${i}@example.com`) })).ok).toBe(false)
    expect(requests).toHaveLength(2)
  })
})
