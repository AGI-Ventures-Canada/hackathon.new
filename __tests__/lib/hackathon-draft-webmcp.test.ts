import { describe, expect, it, mock } from "bun:test"
import { createDefaultHackathonDraft, createDraftEnvelope } from "@/lib/hackathon-draft"
import { createHackathonDraftTools } from "@/lib/webmcp/hackathon-draft-tools"
import { MAX_WEBMCP_OUTPUT_CHARACTERS } from "@/lib/webmcp/tool"

const signal = new AbortController().signal

describe("hackathon draft WebMCP tools", () => {
  it("reads, updates, and opens review without creating an event", async () => {
    let envelope = createDraftEnvelope(
      createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z")),
      { draftId: "draft-1", now: new Date("2026-08-25T12:00:00.000Z") },
    )
    const updateDraft = mock((expectedRevision: number, patch: { name?: string }) => {
      expect(expectedRevision).toBe(envelope.revision)
      envelope = {
        ...envelope,
        revision: envelope.revision + 1,
        state: { ...envelope.state, ...patch },
      }
      return envelope
    })
    const openReview = mock(() => {})
    const tools = createHackathonDraftTools({
      getEnvelope: () => envelope,
      updateDraft,
      openReview,
    })

    expect(tools.map((tool) => tool.name)).toEqual([
      "get_hackathon_draft",
      "update_hackathon_draft",
      "open_hackathon_review",
    ])
    const read = await tools[0].execute({}, { signal }) as {
      ok: boolean
      data: { revision: number; draftId?: string }
    }
    expect(read.data.revision).toBe(0)
    expect(read.data.draftId).toBeUndefined()

    const updated = await tools[1].execute({
      expectedRevision: 0,
      patch: { name: "Agent Jam" },
    }, { signal }) as { ok: boolean; data: { revision: number } }
    expect(updated.data.revision).toBe(1)
    expect(updateDraft).toHaveBeenCalledTimes(1)

    const opened = await tools[2].execute({}, { signal }) as {
      ok: boolean
      requiresHumanAction: boolean
    }
    expect(opened.requiresHumanAction).toBe(false)
    expect(openReview).toHaveBeenCalledTimes(1)
  })

  it("rejects malformed updates before invoking the handler", async () => {
    const envelope = createDraftEnvelope(
      createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z")),
      { draftId: "draft-1" },
    )
    const updateDraft = mock(() => envelope)
    const tools = createHackathonDraftTools({
      getEnvelope: () => envelope,
      updateDraft,
      openReview: () => {},
    })
    const result = await tools[1].execute({
      expectedRevision: 0,
      patch: { startsAt: "tomorrow" },
    }, { signal }) as { ok: boolean; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe("invalid_input")
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it("rejects agenda timestamps without an offset", async () => {
    const envelope = createDraftEnvelope(
      createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z")),
      { draftId: "draft-1" },
    )
    const updateDraft = mock(() => envelope)
    const tools = createHackathonDraftTools({
      getEnvelope: () => envelope,
      updateDraft,
      openReview: () => {},
    })

    const result = await tools[1].execute({
      expectedRevision: 0,
      patch: {
        agendaItems: [{
          title: "Opening",
          description: null,
          startsAt: "2026-09-08T09:00:00",
          endsAt: "2026-09-08T09:30:00",
          location: null,
          speakers: [],
        }],
      },
    }, { signal }) as { ok: boolean; error: { code: string } }

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe("invalid_input")
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it("opens a visible sign-in choice only when that capability is available", async () => {
    const envelope = createDraftEnvelope(
      createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z")),
      { draftId: "draft-1" },
    )
    const openSignIn = mock(() => {})
    const signedOutTools = createHackathonDraftTools({
      getEnvelope: () => envelope,
      updateDraft: () => envelope,
      openReview: () => {},
      openSignIn,
    })
    const signedInTools = createHackathonDraftTools({
      getEnvelope: () => envelope,
      updateDraft: () => envelope,
      openReview: () => {},
    })

    expect(signedInTools.some((tool) => tool.name === "open_sign_in")).toBe(false)
    const tool = signedOutTools.find((candidate) => candidate.name === "open_sign_in")!
    const result = await tool.execute({}, { signal }) as {
      ok: boolean
      requiresHumanAction: boolean
    }
    expect(result.ok).toBe(true)
    expect(result.requiresHumanAction).toBe(false)
    expect(openSignIn).toHaveBeenCalledTimes(1)
  })

  it("opens the visible rich test-event review at the requested stage", async () => {
    const envelope = createDraftEnvelope(
      createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z")),
      { draftId: "draft-1" },
    )
    const openTestEvent = mock((_stage: string) => {})
    const tools = createHackathonDraftTools({
      getEnvelope: () => envelope,
      updateDraft: () => envelope,
      openReview: () => {},
      openTestEvent,
    })

    const tool = tools.find((candidate) => candidate.name === "open_test_event_creator")!
    const result = await tool.execute({ stage: "judging" }, { signal }) as {
      ok: boolean
      data: { opened: boolean; stage: string }
      requiresHumanAction: boolean
    }

    expect(result).toMatchObject({
      ok: true,
      data: { opened: true, stage: "judging" },
      requiresHumanAction: false,
    })
    expect(openTestEvent).toHaveBeenCalledWith("judging")
  })

  it("keeps every paged read section within the output budget", async () => {
    const long = "x".repeat(2_000)
    const state = {
      ...createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z")),
      name: "n".repeat(120),
      description: long,
      locationName: "l".repeat(240),
      locationUrl: long,
      imageUrl: long,
      rules: "r".repeat(10_000),
      sponsors: Array.from({ length: 50 }, (_, index) => ({
        name: `Sponsor ${index} ${"s".repeat(100)}`.slice(0, 120),
        tier: "custom-tier",
      })),
      prizes: Array.from({ length: 50 }, (_, index) => ({
        name: `Prize ${index} ${"p".repeat(100)}`.slice(0, 120),
        description: "d".repeat(1_000),
        value: "v".repeat(120),
      })),
      challenges: Array.from({ length: 50 }, (_, index) => ({
        title: `Challenge ${index} ${"c".repeat(180)}`.slice(0, 200),
        description: "d".repeat(2_000),
        resources: Array.from({ length: 20 }, (_, resourceIndex) => ({
          label: `Resource ${resourceIndex} ${"r".repeat(100)}`.slice(0, 120),
          url: `https://example.com/${"u".repeat(1_900)}`,
        })),
      })),
      agendaItems: Array.from({ length: 50 }, (_, index) => ({
        title: `Session ${index} ${"s".repeat(180)}`.slice(0, 200),
        description: "d".repeat(1_000),
        startsAt: "2026-09-08T12:30:00.000Z",
        endsAt: "2026-09-08T13:00:00.000Z",
        location: "l".repeat(200),
        speakers: ["a".repeat(120), "b".repeat(120), "c".repeat(120)],
      })),
    }
    const envelope = createDraftEnvelope(state, { draftId: "draft-max" })
    const tools = createHackathonDraftTools({
      getEnvelope: () => envelope,
      updateDraft: () => envelope,
      openReview: () => {},
    })

    for (const section of [
      "overview",
      "content",
      "sponsors",
      "prizes",
      "challenges",
      "schedule",
    ]) {
      const result = await tools[0].execute({ section }, { signal }) as { ok: boolean }
      expect(result.ok).toBe(true)
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(MAX_WEBMCP_OUTPUT_CHARACTERS)
    }
  })
})
