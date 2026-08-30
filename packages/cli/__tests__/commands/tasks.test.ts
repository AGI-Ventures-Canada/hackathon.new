import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { OatmealClient } from "../../src/client"

const mockFetch = mock<typeof globalThis.fetch>()
const originalFetch = globalThis.fetch
const eventId = "12345678-1234-1234-1234-123456789012"
const updatedAt = "2026-08-30T18:00:00.000Z"
const task = {
  taskRef: "custom-run-of-show",
  label: "Review the run of show",
  hint: "Check every time and room.",
  tooltip: null,
  severity: "warning",
  state: "pending",
  completionPolicy: "manual",
  custom: true,
  destination: "schedule",
  inspectUrl: "/e/build-day/manage?tab=overview",
  ctaLabel: "Open schedule",
  blocksProgress: false,
  updatedAt,
}

function jsonResponse(body: unknown) {
  return Response.json(body)
}

describe("events tasks commands", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>
  let consoleErrorSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    mockFetch.mockReset()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it("lists the requested page with stable refs and exact links", async () => {
    const page = {
      event: { name: "Build Day", slug: "build-day" },
      totalCount: 8,
      pendingCount: 5,
      completedCount: 2,
      dismissedCount: 1,
      offset: 4,
      limit: 2,
      hasMore: true,
      nextOffset: 6,
      items: [task],
    }
    mockFetch.mockResolvedValueOnce(jsonResponse(page))
    const client = new OatmealClient({
      baseUrl: "http://localhost",
      apiKey: "sk_test",
    })
    const { runHackathonTasks } = await import(
      "../../src/commands/hackathons/tasks"
    )

    await runHackathonTasks(client, "list", eventId, [
      "--state",
      "completed",
      "--offset",
      "4",
      "--limit",
      "2",
      "--json",
    ])

    expect(mockFetch.mock.calls[0][0]).toBe(
      `http://localhost/api/dashboard/hackathons/${eventId}/action-items?offset=4&limit=2&state=completed`,
    )
    expect(JSON.parse(String(consoleLogSpy.mock.calls[0][0]))).toEqual(page)
  })

  it("prints the full task ref, destination, and link", async () => {
    const longLink = `/e/build-day/manage?tab=judging&jtab=assignments&view=${"all".repeat(20)}`
    mockFetch.mockResolvedValueOnce(jsonResponse({
      event: { name: "Build Day", slug: "build-day" },
      totalCount: 1,
      pendingCount: 1,
      completedCount: 0,
      dismissedCount: 0,
      offset: 0,
      limit: 20,
      hasMore: false,
      nextOffset: null,
      items: [{ ...task, destination: "assignments", inspectUrl: longLink }],
    }))
    const client = new OatmealClient({
      baseUrl: "http://localhost",
      apiKey: "sk_test",
    })
    const { runHackathonTasks } = await import(
      "../../src/commands/hackathons/tasks"
    )

    await runHackathonTasks(client, "list", eventId, [])

    const output = consoleLogSpy.mock.calls.flat().join("\n")
    expect(output).toContain(task.taskRef)
    expect(output).toContain("assignments")
    expect(output).toContain(longLink)
  })

  it("reuses a safe custom ref when an add is retried", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ task }))
      .mockResolvedValueOnce(jsonResponse({ task }))
    const client = new OatmealClient({
      baseUrl: "http://localhost",
      apiKey: "sk_test",
    })
    const { runHackathonTasks } = await import(
      "../../src/commands/hackathons/tasks"
    )
    const args = [
      "--label",
      task.label,
      "--task-ref",
      task.taskRef,
      "--severity",
      task.severity,
      "--json",
    ]

    await runHackathonTasks(client, "add", eventId, args)
    await runHackathonTasks(client, "add", eventId, args)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    for (const [, init] of mockFetch.mock.calls) {
      expect(init?.method).toBe("POST")
      expect(JSON.parse(String(init?.body))).toEqual({
        label: task.label,
        severity: task.severity,
        taskRef: task.taskRef,
      })
    }
  })

  it("finishes, reopens, dismisses, and removes a task", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ task: { ...task, state: "completed" } }))
      .mockResolvedValueOnce(jsonResponse({ task }))
      .mockResolvedValueOnce(jsonResponse({ task: { ...task, state: "dismissed" } }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    const client = new OatmealClient({
      baseUrl: "http://localhost",
      apiKey: "sk_test",
    })
    const { runHackathonTasks } = await import(
      "../../src/commands/hackathons/tasks"
    )

    for (const action of ["complete", "reopen"] as const) {
      await runHackathonTasks(client, action, eventId, [
        task.taskRef,
        "--expected-updated-at",
        updatedAt,
        "--json",
      ])
    }
    await runHackathonTasks(client, "dismiss", eventId, [
      "verify-automated-times",
      "--expected-updated-at",
      updatedAt,
      "--json",
    ])
    await runHackathonTasks(client, "remove", eventId, [
      task.taskRef,
      "--expected-updated-at",
      updatedAt,
      "--json",
    ])

    expect(mockFetch.mock.calls.map(([, init]) => init?.method)).toEqual([
      "PATCH",
      "PATCH",
      "PATCH",
      "DELETE",
    ])
    expect(
      mockFetch.mock.calls.slice(0, 3).map(([, init]) =>
        JSON.parse(String(init?.body)).state
      ),
    ).toEqual(["completed", "pending", "dismissed"])
    expect(String(mockFetch.mock.calls[2][0])).toContain(
      "/verify-automated-times",
    )
    expect(String(mockFetch.mock.calls[3][0])).toContain(
      "custom-run-of-show?expectedUpdatedAt=2026-08-30T18%3A00%3A00.000Z",
    )
    expect(JSON.parse(String(consoleLogSpy.mock.calls[3][0]))).toEqual({
      success: true,
      taskRef: task.taskRef,
    })
  })

  it("rejects unsafe custom refs before a request", async () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit")
    })
    const client = new OatmealClient({
      baseUrl: "http://localhost",
      apiKey: "sk_test",
    })
    const { runHackathonTasks } = await import(
      "../../src/commands/hackathons/tasks"
    )

    try {
      await expect(runHackathonTasks(client, "add", eventId, [
        "--label",
        "Order lunch",
        "--task-ref",
        "lunch",
      ])).rejects.toThrow("exit")
      expect(mockFetch).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })
})
