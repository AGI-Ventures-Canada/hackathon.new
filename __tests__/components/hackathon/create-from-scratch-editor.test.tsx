import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import "../../lib/component-mocks"
import { createDefaultHackathonDraft } from "@/lib/hackathon-draft"

const originalFetch = globalThis.fetch
const mockFetch = mock((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response(
  JSON.stringify({ id: "h-1", slug: "agent-jam" }),
  { status: 200, headers: { "Content-Type": "application/json" } },
)))

beforeEach(() => {
  mockFetch.mockClear()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("CreateFromScratchEditor", () => {
  it("exports a valid component", async () => {
    const mod = await import("@/components/hackathon/create-from-scratch-editor")
    expect(typeof mod.CreateFromScratchEditor).toBe("function")
  })

  it("defines an empty initial DraftState", async () => {
    const { CreateFromScratchEditor } = await import("@/components/hackathon/create-from-scratch-editor")
    const element = CreateFromScratchEditor()
    expect(element.props.initialState.name).toBe("")
    const browserDraft = element.props.createInitialStateAfterMount()
    expect(browserDraft.startsAt).toBeString()
    expect(browserDraft.endsAt).toBeString()
    expect(new Date(browserDraft.endsAt).getTime()).toBeGreaterThan(
      new Date(browserDraft.startsAt).getTime(),
    )
    expect(element.props.onSubmit).toBeFunction()
  })

  it("posts the full reviewed draft once", async () => {
    const { submitHackathonDraft } = await import(
      "@/components/hackathon/create-from-scratch-editor"
    )
    const state = {
      ...createDefaultHackathonDraft(new Date("2026-08-25T12:00:00.000Z")),
      name: "Agent Jam",
      description: "Build useful agents.",
      sponsors: [{ name: "OpenAI", tier: "gold" }],
      rules: "Be kind.",
      prizes: [{ name: "Best Overall", description: null, value: "$5,000" }],
      challenges: [{ title: "Useful tools", description: null, resources: [] }],
      agendaItems: [{
        title: "Kickoff",
        description: null,
        startsAt: "2026-09-08T12:30:00.000Z",
        endsAt: "2026-09-08T13:00:00.000Z",
        location: null,
        speakers: [],
      }],
    }

    const draftId = "332e84e9-df92-45da-bec4-93fb1a322a63"
    await submitHackathonDraft(state, draftId, "org_123")

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const request = mockFetch.mock.calls[0][1] as RequestInit
    expect(request.method).toBe("POST")
    expect(JSON.parse(request.body as string)).toEqual({
      ...state,
      draftId,
      expectedOrganizationId: "org_123",
    })
  })
})
