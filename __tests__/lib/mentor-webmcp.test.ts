import { describe, expect, it, mock } from "bun:test"
import {
  canPrepareMentorRequest,
  createAttendeeMentorWebMcpTools,
  createMentorQueueWebMcpTools,
  createPublicMentorWebMcpTools,
} from "@/lib/webmcp/mentor-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"

function findTool(tools: WebMcpTool[], name: string): WebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return tool
}

function execute(tool: WebMcpTool, input: Record<string, unknown> = {}) {
  return tool.execute(input, { signal: new AbortController().signal })
}

describe("mentor WebMCP tools", () => {
  it("exposes attendee preparation only after request state loads and no request is open", () => {
    const base = {
      requestLoaded: true,
      request: null,
      isParticipant: true,
      status: "active",
      teamStatus: "forming",
    }

    expect(canPrepareMentorRequest(base)).toBe(true)
    expect(canPrepareMentorRequest({ ...base, requestLoaded: false })).toBe(false)
    expect(
      canPrepareMentorRequest({ ...base, teamStatus: "pending_approval" }),
    ).toBe(false)
    expect(canPrepareMentorRequest({ ...base, teamStatus: "disbanded" })).toBe(false)
    expect(
      canPrepareMentorRequest({
        ...base,
        request: {
          category: "API",
          description: "Need help with auth.",
          status: "open",
          createdAt: "2026-08-25T12:00:00.000Z",
        },
      }),
    ).toBe(false)
  })

  it("exposes aggregate queue status without request text to public viewers", async () => {
    const tools = createPublicMentorWebMcpTools(() => ({ open: 2, claimed: 1, resolved: 4 }))

    const result = await execute(findTool(tools, "get_mentor_queue_status"))

    expect(result).toEqual({
      ok: true,
      data: { waiting: 2, beingHelped: 1, finished: 4 },
    })
  })

  it("returns mentor-only request text with opaque references", async () => {
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: [{
          id: "44444444-4444-4444-4444-444444444444",
          teamName: "Team Alpha",
          category: "API",
          description: "Need help with a failing request",
          status: "open",
          createdAt: "2026-08-25T15:00:00Z",
          claimedByMe: false,
        }],
        total: 1,
        truncated: false,
      }),
      onReview: () => {},
    })

    const result = await execute(findTool(tools, "get_mentor_queue"))
    const serialized = JSON.stringify(result)

    expect(serialized).toContain("request-1")
    expect(serialized).toContain("Need help")
    expect(serialized).not.toContain("44444444-4444-4444-4444-444444444444")
  })

  it("reads one mentor-only request through its opaque reference", async () => {
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: [{
          id: "44444444-4444-4444-4444-444444444444",
          teamName: "Team Alpha",
          category: "API",
          description: "Need help with a failing request",
          status: "open",
          createdAt: "2026-08-25T15:00:00Z",
          claimedByMe: false,
        }],
        total: 1,
        truncated: false,
      }),
      onReview: () => {},
    })

    const result = await execute(findTool(tools, "get_mentor_request"), {
      requestRef: "request-1",
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      ok: true,
      data: { requestRef: "request-1", description: "Need help with a failing request" },
    })
    expect(serialized).not.toContain("44444444-4444-4444-4444-444444444444")
  })

  it("keeps large mentor queues inside the WebMCP output budget", async () => {
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: Array.from({ length: 20 }, (_, index) => ({
          id: `${String(index + 1).padStart(8, "0")}-4444-4444-4444-444444444444`,
          teamName: "T".repeat(300),
          category: "C".repeat(300),
          description: "D".repeat(2_000),
          status: "open" as const,
          createdAt: "2026-08-25T15:00:00.000Z",
          claimedByMe: false,
        })),
        total: 73,
        truncated: true,
      }),
      onReview: () => {},
    })

    const result = await execute(findTool(tools, "get_mentor_queue"))

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500)
    expect(result).toMatchObject({ ok: true, data: { total: 73, truncated: true } })
  })

  it("does not reuse an opaque reference after a queue item leaves", async () => {
    let requests = [{
      id: "44444444-4444-4444-4444-444444444444",
      teamName: "Team Alpha",
      category: "API",
      description: "First request",
      status: "open" as const,
      createdAt: "2026-08-25T15:00:00Z",
      claimedByMe: false,
    }]
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({ requests, total: requests.length, truncated: false }),
      onReview: () => {},
    })

    await execute(findTool(tools, "get_mentor_queue"))
    requests = [{
      ...requests[0],
      id: "55555555-5555-5555-5555-555555555555",
      description: "Second request",
    }]

    const nextList = JSON.stringify(await execute(findTool(tools, "get_mentor_queue")))
    const stale = await execute(findTool(tools, "get_mentor_request"), {
      requestRef: "request-1",
    })

    expect(nextList).toContain("request-2")
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "request_not_found" },
    })
  })

  it("opens a human claim review without making the claim", async () => {
    const onReview = mock(() => {})
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: [{
          id: "44444444-4444-4444-4444-444444444444",
          teamName: null,
          category: "Pitch",
          description: null,
          status: "open",
          createdAt: "2026-08-25T15:00:00Z",
          claimedByMe: false,
        }],
        total: 1,
        truncated: false,
      }),
      onReview,
    })

    const result = await execute(findTool(tools, "open_mentor_claim"), {
      requestRef: "request-1",
    })

    expect(onReview).toHaveBeenCalledWith(
      "44444444-4444-4444-4444-444444444444",
      "claim",
    )
    expect(result).toEqual({
      ok: true,
      data: { requestRef: "request-1", opened: true },
      requiresHumanAction: true,
    })
  })

  it("blocks a second review while the same request is being updated", async () => {
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: [{
          id: "44444444-4444-4444-4444-444444444444",
          teamName: null,
          category: "Pitch",
          description: null,
          status: "open",
          createdAt: "2026-08-25T15:00:00Z",
          claimedByMe: false,
        }],
        total: 1,
        truncated: false,
      }),
      onReview: () => false,
    })

    const result = await execute(findTool(tools, "open_mentor_claim"), {
      requestRef: "request-1",
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: "request_busy", retryable: true },
    })
  })

  it("prefills an attendee request and leaves sending to the attendee", async () => {
    const onPrepare = mock(() => {})
    const tools = createAttendeeMentorWebMcpTools({
      getRequest: () => null,
      canPrepare: true,
      onPrepare,
    })

    const result = await execute(findTool(tools, "prepare_mentor_request"), {
      category: "API",
      description: "Help me read this error",
    })

    expect(onPrepare).toHaveBeenCalledWith({
      category: "API",
      description: "Help me read this error",
    })
    expect(result).toEqual({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
  })

  it("bounds a maximum-length attendee request", async () => {
    const tools = createAttendeeMentorWebMcpTools({
      getRequest: () => ({
        category: "C".repeat(80),
        description: "D".repeat(2_000),
        status: "open",
        createdAt: "2026-08-25T15:00:00.000Z",
      }),
      canPrepare: false,
      onPrepare: () => {},
    })

    const result = await execute(findTool(tools, "get_my_mentor_request"))

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500)
    expect(result).toMatchObject({
      ok: true,
      data: {
        request: {
          description: `${"D".repeat(699)}…`,
        },
      },
    })
  })

  it("does not expose prepare when the event state blocks mentor help", () => {
    const tools = createAttendeeMentorWebMcpTools({
      getRequest: () => null,
      canPrepare: false,
      onPrepare: () => {},
    })

    expect(tools.map((tool) => tool.name)).toEqual(["get_my_mentor_request"])
  })

  it("requires an active participant and an eligible team before preparation", () => {
    const base = {
      requestLoaded: true,
      request: null,
      isParticipant: true,
      status: "active",
      teamStatus: null,
    }
    expect(canPrepareMentorRequest({ ...base, isParticipant: false })).toBe(false)
    expect(canPrepareMentorRequest({ ...base, status: "judging" })).toBe(false)
    expect(canPrepareMentorRequest({ ...base, status: "completed" })).toBe(false)
    expect(canPrepareMentorRequest({ ...base, eventOpen: false })).toBe(false)
    expect(canPrepareMentorRequest({ ...base, teamStatus: "approved" })).toBe(true)
  })

  it("rejects claim review after another mentor claims the request", async () => {
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: [{
          id: "44444444-4444-4444-4444-444444444444",
          teamName: "Team Alpha",
          category: "API",
          description: "Need help",
          status: "claimed",
          createdAt: "2026-08-25T15:00:00Z",
          claimedByMe: false,
        }],
        total: 1,
        truncated: false,
      }),
      onReview: () => {},
    })
    expect(await execute(findTool(tools, "open_mentor_claim"), {
      requestRef: "request-1",
    })).toMatchObject({
      ok: false,
      error: { code: "already_claimed", retryable: true },
    })
  })

  it("allows only the owning mentor to review resolution", async () => {
    let claimedByMe = false
    const onReview = mock(() => {})
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: [{
          id: "44444444-4444-4444-4444-444444444444",
          teamName: null,
          category: null,
          description: null,
          status: "claimed",
          createdAt: "2026-08-25T15:00:00Z",
          claimedByMe,
        }],
        total: 1,
        truncated: false,
      }),
      onReview,
    })

    expect(await execute(findTool(tools, "open_mentor_resolve"), {
      requestRef: "request-1",
    })).toMatchObject({
      ok: false,
      error: { code: "not_claimed_by_you", retryable: false },
    })
    expect(onReview).not.toHaveBeenCalled()

    claimedByMe = true
    expect(await execute(findTool(tools, "open_mentor_resolve"), {
      requestRef: "request-1",
    })).toEqual({
      ok: true,
      data: { requestRef: "request-1", opened: true },
      requiresHumanAction: true,
    })
    expect(onReview).toHaveBeenCalledWith(
      "44444444-4444-4444-4444-444444444444",
      "resolve",
    )
  })

  it("reports a busy resolution without finalizing anything", async () => {
    const tools = createMentorQueueWebMcpTools({
      getQueue: () => ({
        requests: [{
          id: "44444444-4444-4444-4444-444444444444",
          teamName: null,
          category: null,
          description: null,
          status: "claimed",
          createdAt: "2026-08-25T15:00:00Z",
          claimedByMe: true,
        }],
        total: 1,
        truncated: false,
      }),
      onReview: () => false,
    })
    expect(await execute(findTool(tools, "open_mentor_resolve"), {
      requestRef: "request-1",
    })).toMatchObject({
      ok: false,
      error: { code: "request_busy", retryable: true },
    })
  })

  it("blocks a prepared attendee request if the queue changed first", async () => {
    const onPrepare = mock(() => {})
    const tools = createAttendeeMentorWebMcpTools({
      getRequest: () => ({
        category: null,
        description: "Someone already asked for help.",
        status: "open",
        createdAt: "2026-08-25T15:00:00Z",
      }),
      canPrepare: true,
      onPrepare,
    })
    expect(await execute(findTool(tools, "prepare_mentor_request"), {
      category: "API",
    })).toMatchObject({
      ok: false,
      error: { code: "already_open", retryable: false },
    })
    expect(onPrepare).not.toHaveBeenCalled()
  })
})
