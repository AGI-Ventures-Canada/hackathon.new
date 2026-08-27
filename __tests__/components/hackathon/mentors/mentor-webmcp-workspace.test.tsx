import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from "bun:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../../lib/component-mocks"
import { AttendeeMentorWebMcp } from "@/components/hackathon/mentors/attendee-mentor-webmcp"
import { MentorWorkspace } from "@/components/hackathon/mentors/mentor-workspace"
import type { MentorQueueWebMcpItem } from "@/lib/webmcp/mentor-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"

const originalFetch = globalThis.fetch
const activeSignal = new AbortController().signal
const requestAId = "44444444-4444-4444-4444-444444444444"
const requestBId = "55555555-5555-5555-5555-555555555555"

let registeredTools: Map<string, WebMcpTool>
let fetchSpy: ReturnType<typeof mock>

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function deferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function getTool(name: string): Promise<WebMcpTool> {
  await waitFor(() => expect(registeredTools.has(name)).toBe(true))
  const tool = registeredTools.get(name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return tool
}

async function executeTool(tool: WebMcpTool, input: Record<string, unknown> = {}) {
  let result: unknown
  await act(async () => {
    result = await tool.execute(input, { signal: activeSignal })
  })
  return result
}

function requestCard(teamName: string): HTMLElement {
  const card = screen.getByText(teamName).closest<HTMLElement>("[data-slot='card']")
  if (!card) throw new Error(`Missing card for ${teamName}`)
  return card
}

beforeEach(() => {
  resetComponentMocks()
  setRouter({ refresh: mock(() => {}) })
  registeredTools = new Map()
  document.modelContext = {
    registerTool: mock(async (tool, options) => {
      registeredTools.set(tool.name, tool)
      options?.signal?.addEventListener("abort", () => {
        if (registeredTools.get(tool.name) === tool) registeredTools.delete(tool.name)
      }, { once: true })
    }),
  }
  fetchSpy = mock(() => jsonResponse({ success: true }))
  globalThis.fetch = fetchSpy as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  setSystemTime()
  delete document.modelContext
  globalThis.fetch = originalFetch
})

describe("mounted mentor WebMCP flows", () => {
  it("prepares locally and sends one request after the attendee clicks", async () => {
    fetchSpy.mockImplementation((_input, init) =>
      init?.method === "POST"
        ? jsonResponse({
            request: {
              category: "API",
              description: "Help me read this error",
              status: "open",
              createdAt: "2026-08-25T15:00:00.000Z",
            },
          })
        : jsonResponse({ request: null }),
    )

    render(
      <AttendeeMentorWebMcp
        slug="test-hack"
        status="active"
        startsAt={null}
        endsAt={null}
        isParticipant
        teamStatus="forming"
      />,
    )

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    const prepareTool = await getTool("prepare_mentor_request")
    fetchSpy.mockClear()

    const result = await executeTool(prepareTool, {
      category: "API",
      description: "Help me read this error",
    })

    expect(result).toMatchObject({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect((screen.getByLabelText("What do you need help with?") as HTMLInputElement).value).toBe("API")
    expect((screen.getByLabelText("Add a note") as HTMLTextAreaElement).value).toBe("Help me read this error")

    fireEvent.click(screen.getByRole("button", { name: "Ask mentor" }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/public/hackathons/test-hack/mentor-request")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body as string)).toEqual({
      category: "API",
      description: "Help me read this error",
    })
  })

  it("adds and removes attendee preparation at event start and end", async () => {
    setSystemTime(new Date("2026-09-08T12:29:59.000Z"))
    fetchSpy.mockImplementation(() => jsonResponse({ request: null }))

    render(
      <AttendeeMentorWebMcp
        slug="test-hack"
        status="published"
        startsAt="2026-09-08T12:30:00.000Z"
        endsAt="2026-09-08T13:00:00.000Z"
        isParticipant
        teamStatus="forming"
      />,
    )

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await getTool("get_my_mentor_request")
    expect(registeredTools.has("prepare_mentor_request")).toBe(false)
    fetchSpy.mockClear()

    setSystemTime(new Date("2026-09-08T12:30:00.000Z"))
    act(() => window.dispatchEvent(new Event("focus")))
    const prepare = await getTool("prepare_mentor_request")
    expect(await executeTool(prepare, {
      category: "API",
      description: "Help with the launch.",
    })).toMatchObject({
      ok: true,
      data: { prepared: true },
      requiresHumanAction: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()

    setSystemTime(new Date("2026-09-08T13:00:00.000Z"))
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => {
      expect(registeredTools.has("prepare_mentor_request")).toBe(false)
      expect(registeredTools.has("get_my_mentor_request")).toBe(true)
    })
  })

  it("restores the attendee review when the final request fails", async () => {
    fetchSpy.mockImplementation((_input, init) =>
      init?.method === "POST"
        ? jsonResponse({ error: "We couldn't add your request." }, 500)
        : jsonResponse({ request: null }),
    )

    render(
      <AttendeeMentorWebMcp
        slug="test-hack"
        status="active"
        startsAt={null}
        endsAt={null}
        isParticipant
        teamStatus="forming"
      />,
    )

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    const prepareTool = await getTool("prepare_mentor_request")
    fetchSpy.mockClear()
    await executeTool(prepareTool, { category: "Pitch", description: "Please help" })

    fireEvent.click(screen.getByRole("button", { name: "Ask mentor" }))

    await screen.findByText("We couldn't add your request.")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText("What do you need help with?") as HTMLInputElement).value).toBe("Pitch")
    expect((screen.getByLabelText("Add a note") as HTMLTextAreaElement).value).toBe("Please help")
    const status = await executeTool(await getTool("get_my_mentor_request"))
    expect(status).toMatchObject({ ok: true, data: { request: null } })
  })

  it("keeps other successful queue updates when one request rolls back", async () => {
    const requestA = deferredResponse()
    const requestB = deferredResponse()
    fetchSpy.mockImplementation((input) => {
      const url = String(input)
      if (url.includes(requestAId)) return requestA.promise
      if (url.includes(requestBId)) return requestB.promise
      return jsonResponse({ success: true })
    })
    const requests: MentorQueueWebMcpItem[] = [
      {
        id: requestAId,
        teamName: "Team Alpha",
        category: "API",
        description: "Help with a request",
        status: "open",
        createdAt: "2026-08-25T15:00:00.000Z",
        claimedByMe: false,
      },
      {
        id: requestBId,
        teamName: "Team Beta",
        category: "Pitch",
        description: "Help with a pitch",
        status: "open",
        createdAt: "2026-08-25T15:01:00.000Z",
        claimedByMe: false,
      },
    ]

    render(
      <MentorWorkspace
        slug="test-hack"
        status="active"
        stats={{ open: 73, claimed: 0, resolved: 0 }}
        isMentor
        initialRequests={requests}
        initialTotal={73}
        initialTruncated
      />,
    )

    expect(screen.getByText("73 in queue")).toBeDefined()
    expect(screen.getByText("Showing the first 2 requests.")).toBeDefined()
    const queueTool = await getTool("get_mentor_queue")
    const queueResult = await executeTool(queueTool)
    expect(queueResult).toMatchObject({
      ok: true,
      data: { total: 73, truncated: true },
    })

    const openClaim = await getTool("open_mentor_claim")
    const firstReview = await executeTool(openClaim, { requestRef: "request-1" })
    expect(firstReview).toMatchObject({ requiresHumanAction: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Claim request" }))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const alphaPending = within(requestCard("Team Alpha")).getByRole("button", {
      name: "Updating...",
    }) as HTMLButtonElement
    expect(alphaPending.disabled).toBe(true)

    const duplicate = await executeTool(await getTool("open_mentor_resolve"), {
      requestRef: "request-1",
    })
    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: "request_busy", retryable: true },
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await executeTool(openClaim, { requestRef: "request-2" })
    fireEvent.click(screen.getByRole("button", { name: "Claim request" }))
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    await act(async () => {
      requestB.resolve(await jsonResponse({ success: true }))
    })
    await waitFor(() => {
      expect(within(requestCard("Team Beta")).getByText("Being helped")).toBeDefined()
      expect(within(requestCard("Team Beta")).getByRole("button", { name: "Review finish" })).toBeDefined()
    })

    await act(async () => {
      requestA.resolve(await jsonResponse({ error: "Another mentor already claimed this request." }, 409))
    })
    await screen.findByText("Another mentor already claimed this request.")

    expect(within(requestCard("Team Alpha")).getByText("Waiting")).toBeDefined()
    expect(within(requestCard("Team Alpha")).getByRole("button", { name: "Review claim" })).toBeDefined()
    expect(within(requestCard("Team Beta")).getByText("Being helped")).toBeDefined()
    expect(within(requestCard("Team Beta")).getByRole("button", { name: "Review finish" })).toBeDefined()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("keeps public viewers on aggregate counts without exposing request text", async () => {
    render(
      <MentorWorkspace
        slug="test-hack"
        status="active"
        stats={{ open: 3, claimed: 2, resolved: 8 }}
        isMentor={false}
        initialRequests={[{
          id: requestAId,
          teamName: "Private Team",
          category: "Private category",
          description: "Private request text",
          status: "open",
          createdAt: "2026-08-25T15:00:00.000Z",
          claimedByMe: false,
        }]}
        initialTotal={1}
        initialTruncated={false}
      />,
    )

    expect(screen.getByText("Waiting").closest("[data-slot='card']")?.textContent).toContain("3")
    expect(screen.getByText("Being helped").closest("[data-slot='card']")?.textContent).toContain("2")
    expect(screen.getByText("Finished").closest("[data-slot='card']")?.textContent).toContain("8")
    expect(screen.queryByText("Private Team")).toBeNull()
    expect(screen.queryByText("Private request text")).toBeNull()
    const publicTool = await getTool("get_mentor_queue_status")
    expect(await executeTool(publicTool)).toEqual({
      ok: true,
      data: { waiting: 3, beingHelped: 2, finished: 8 },
    })
    expect(registeredTools.has("get_mentor_queue")).toBe(false)
  })

  it("keeps inactive mentor tools read-only and hides claim controls", async () => {
    render(
      <MentorWorkspace
        slug="test-hack"
        status="judging"
        stats={{ open: 1, claimed: 0, resolved: 0 }}
        isMentor
        initialRequests={[{
          id: requestAId,
          teamName: "Team Alpha",
          category: "API",
          description: "Need help",
          status: "open",
          createdAt: "2026-08-25T15:00:00.000Z",
          claimedByMe: false,
        }]}
        initialTotal={1}
        initialTruncated={false}
      />,
    )

    expect(screen.getByText("Mentor help isn't open now.")).toBeDefined()
    expect(screen.queryByRole("button", { name: "Review claim" })).toBeNull()
    await getTool("get_mentor_queue")
    await getTool("get_mentor_request")
    expect(registeredTools.has("open_mentor_claim")).toBe(false)
    expect(registeredTools.has("open_mentor_resolve")).toBe(false)
  })

  it("restores a removed request at its position when finishing fails", async () => {
    const pending = deferredResponse()
    fetchSpy.mockImplementation(() => pending.promise)
    render(
      <MentorWorkspace
        slug="test-hack"
        status="active"
        stats={{ open: 0, claimed: 1, resolved: 0 }}
        isMentor
        initialRequests={[{
          id: requestAId,
          teamName: "Team Alpha",
          category: "API",
          description: "Need help",
          status: "claimed",
          createdAt: "2026-08-25T15:00:00.000Z",
          claimedByMe: true,
        }]}
        initialTotal={1}
        initialTruncated={false}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Review finish" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish request" }))
    expect(screen.getByText("No open requests")).toBeDefined()
    expect(screen.getByText("0 in queue")).toBeDefined()

    await act(async () => {
      pending.resolve(await jsonResponse({ error: "The request changed." }, 409))
    })
    await screen.findByText("The request changed.")
    expect(screen.getByText("Team Alpha")).toBeDefined()
    expect(screen.getByText("1 in queue")).toBeDefined()
    expect(screen.getByRole("button", { name: "Review finish" })).toBeDefined()
  })

  it("validates an empty attendee review and sends once with Ctrl+Enter", async () => {
    fetchSpy.mockImplementation((_input, init) =>
      init?.method === "POST"
        ? jsonResponse({
            request: {
              category: "Pitch",
              description: null,
              status: "open",
              createdAt: "2026-08-25T15:00:00.000Z",
            },
          })
        : jsonResponse({ request: null }),
    )
    render(
      <AttendeeMentorWebMcp
        slug="test-hack"
        status="active"
        startsAt={null}
        endsAt={null}
        isParticipant
        teamStatus="forming"
      />,
    )
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    const prepare = await getTool("prepare_mentor_request")
    fetchSpy.mockClear()
    await executeTool(prepare, { category: "Pitch" })
    fireEvent.change(screen.getByLabelText("What do you need help with?"), {
      target: { value: "" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Ask mentor" }))
    expect(screen.getByText("Add a short topic or note.")).toBeDefined()
    expect(fetchSpy).not.toHaveBeenCalled()

    const categoryInput = screen.getByLabelText("What do you need help with?")
    fireEvent.change(categoryInput, {
      target: { value: "Pitch" },
    })
    fireEvent.keyDown(categoryInput, {
      key: "Enter",
      ctrlKey: true,
    })
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      category: "Pitch",
    })
  })

  it("aborts the attendee queue read when its surface unmounts", async () => {
    let aborted = false
    fetchSpy.mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true
          reject(new DOMException("stopped", "AbortError"))
        })
      }),
    )
    const mounted = render(
      <AttendeeMentorWebMcp
        slug="test-hack"
        status="active"
        startsAt={null}
        endsAt={null}
        isParticipant
        teamStatus="forming"
      />,
    )
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    mounted.unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(aborted).toBe(true)
    expect(registeredTools.size).toBe(0)
  })
})
