import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from "bun:test"
import { OatmealClient } from "../../src/client"

const mockFetch = mock<typeof globalThis.fetch>()
const originalFetch = globalThis.fetch

const mockConfirm = mock(() => Promise.resolve(false))
mock.module("@clack/prompts", () => ({
  confirm: mockConfirm,
  isCancel: () => false,
  log: { info: () => {} },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("judging commands", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    mockFetch.mockReset()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    consoleLogSpy.mockRestore()
  })

  const hackathonId = "h1"

  describe("criteria list", () => {
    it("fetches and displays criteria", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ criteria: [{ name: "Innovation", maxScore: 10, weight: 1 }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaList } = await import("../../src/commands/judging/criteria-list")
      await runCriteriaList(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Innovation")
    })
  })

  describe("criteria create", () => {
    it("creates criteria with flags", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "c1", name: "Design", category: "core" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaCreate } = await import("../../src/commands/judging/criteria-create")
      await runCriteriaCreate(client, hackathonId, ["--name", "Design", "--category", "core"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("Design")
      expect(body.category).toBe("core")
    })

    it("defaults category to core when not provided", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "c1", name: "Design", category: "core" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaCreate } = await import("../../src/commands/judging/criteria-create")
      await runCriteriaCreate(client, hackathonId, ["--name", "Design"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.category).toBe("core")
    })

    it("supports bonus category", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "c2", name: "Bonus", category: "bonus" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaCreate } = await import("../../src/commands/judging/criteria-create")
      await runCriteriaCreate(client, hackathonId, ["--name", "Bonus", "--category", "bonus"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.category).toBe("bonus")
    })
  })

  describe("judges list", () => {
    it("shows judges with progress", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          judges: [{ name: "Judge A", email: "a@test.com", completedCount: 3, totalCount: 5 }],
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesList } = await import("../../src/commands/judging/judges-list")
      await runJudgesList(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Judge A")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("3/5")
    })
  })

  describe("judges add", () => {
    it("reports a sent email invitation", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          queued: false,
          invitation: { id: "inv1", email: "judge@test.com", token: "token1" },
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesAdd } = await import("../../src/commands/judging/judges-add")
      await runJudgesAdd(client, hackathonId, ["--email", "judge@test.com"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.email).toBe("judge@test.com")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Sent judge invitation to judge@test.com")
    })

    it("reports an invitation queued until go-live", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          queued: true,
          invitation: { id: "inv1", email: "judge@test.com", token: "token1" },
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesAdd } = await import("../../src/commands/judging/judges-add")

      await runJudgesAdd(client, hackathonId, ["--email", "judge@test.com"])

      expect(consoleLogSpy.mock.calls[0][0]).toContain("Saved judge invitation for judge@test.com")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("This event is still a draft")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("when you go live")
    })

    it("reports an invitation saved after email delivery fails", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          queued: false,
          delivery: "failed",
          invitation: { id: "inv1", email: "judge@test.com", token: "token1" },
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesAdd } = await import("../../src/commands/judging/judges-add")

      await runJudgesAdd(client, hackathonId, ["--email", "judge@test.com"])

      expect(consoleLogSpy.mock.calls[0][0]).toContain("Saved judge invitation for judge@test.com")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("email delivery could not be confirmed")
    })

    it("preserves the email invitation response in JSON mode", async () => {
      const response = {
        queued: true,
        invitation: { id: "inv1", email: "judge@test.com", token: "token1" },
      }
      mockFetch.mockResolvedValueOnce(jsonResponse(response))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesAdd } = await import("../../src/commands/judging/judges-add")

      await runJudgesAdd(client, hackathonId, ["--email", "judge@test.com", "--json"])

      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(response)
    })

    it("keeps direct user-id additions as added judges", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ participant: { id: "participant1", name: "Judge One" } })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesAdd } = await import("../../src/commands/judging/judges-add")

      await runJudgesAdd(client, hackathonId, ["--user-id", "user1"])

      expect(consoleLogSpy.mock.calls[0][0]).toContain("Added judge Judge One")
    })

    it("reports a queued email for a directly added judge", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          participant: { id: "participant1", name: "Judge One" },
          queued: true,
          delivery: "queued",
          queueReason: "event_draft",
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesAdd } = await import("../../src/commands/judging/judges-add")

      await runJudgesAdd(client, hackathonId, ["--user-id", "user1"])

      expect(consoleLogSpy.mock.calls[0][0]).toContain("This event is still a draft")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("when you go live")
    })
  })

  describe("auto-assign", () => {
    it("sends request with --per-judge", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({
          prizes: [{ id: "prize1", judgingStyle: "judges_pick" }],
        }))
        .mockResolvedValueOnce(jsonResponse({ assignedCount: 15 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAutoAssign } = await import("../../src/commands/judging/auto-assign")
      await runAutoAssign(client, hackathonId, ["--per-judge", "3"])

      expect(mockFetch.mock.calls[1][0]).toContain(
        `/prizes/prize1/auto-assign`,
      )
      const init = mockFetch.mock.calls[1][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.submissionsPerJudge).toBe(3)
    })
  })

  describe("pick-results", () => {
    it("displays tally table", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          results: {
            "Project A": [
              { judgeName: "Judge 1", submissionTitle: "Project A" },
              { judgeName: "Judge 2", submissionTitle: "Project A" },
              { judgeName: "Judge 3", submissionTitle: "Project A" },
            ],
          },
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPickResults } = await import("../../src/commands/judging/pick-results")
      await runPickResults(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Project A")
    })
  })

  describe("criteria update", () => {
    it("sends PATCH with updated fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "c1", name: "Innovation v2", category: "bonus" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaUpdate } = await import("../../src/commands/judging/criteria-update")
      await runCriteriaUpdate(client, hackathonId, "c1", ["--name", "Innovation v2", "--category", "bonus"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/criteria/c1`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("Innovation v2")
      expect(body.category).toBe("bonus")
    })

    it("--json outputs updated criteria", async () => {
      const criteria = { id: "c1", name: "Innovation v2", maxScore: 10, weight: 2.0 }
      mockFetch.mockResolvedValueOnce(jsonResponse(criteria))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaUpdate } = await import("../../src/commands/judging/criteria-update")
      await runCriteriaUpdate(client, hackathonId, "c1", ["--name", "Innovation v2", "--json"])

      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(criteria)
    })

    it("exits with error when no fields provided", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaUpdate } = await import("../../src/commands/judging/criteria-update")
      await expect(runCriteriaUpdate(client, hackathonId, "c1", [])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("criteria delete", () => {
    it("sends DELETE with --yes flag", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaDelete } = await import("../../src/commands/judging/criteria-delete")
      await runCriteriaDelete(client, hackathonId, "c1", { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/criteria/c1`)
      expect(init.method).toBe("DELETE")
    })

    it("skips delete when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runCriteriaDelete } = await import("../../src/commands/judging/criteria-delete")
      await runCriteriaDelete(client, hackathonId, "c1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("judges remove", () => {
    it("sends DELETE with --yes flag", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesRemove } = await import("../../src/commands/judging/judges-remove")
      await runJudgesRemove(client, hackathonId, "p1", { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/judges/p1`)
      expect(init.method).toBe("DELETE")
    })

    it("skips remove when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runJudgesRemove } = await import("../../src/commands/judging/judges-remove")
      await runJudgesRemove(client, hackathonId, "p1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("assignments list", () => {
    it("displays assignments table", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          assignments: [{ judgeName: "Alice", submissionTitle: "Project X", isComplete: false }],
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAssignmentsList } = await import("../../src/commands/judging/assignments-list")
      await runAssignmentsList(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Alice")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Project X")
    })

    it("--json outputs raw data", async () => {
      const data = { assignments: [{ judgeName: "Alice", submissionTitle: "Project X" }] }
      mockFetch.mockResolvedValueOnce(jsonResponse(data))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAssignmentsList } = await import("../../src/commands/judging/assignments-list")
      await runAssignmentsList(client, hackathonId, { json: true })
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(data)
    })

    it("shows empty message when no assignments", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ assignments: [] }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAssignmentsList } = await import("../../src/commands/judging/assignments-list")
      await runAssignmentsList(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("No assignments found")
    })
  })

  describe("assignments create", () => {
    it("sends POST with --judge and --submission", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a1" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAssignmentsCreate } = await import("../../src/commands/judging/assignments-create")
      await runAssignmentsCreate(client, hackathonId, ["--judge", "j1", "--submission", "s1"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.judgeParticipantId).toBe("j1")
      expect(body.submissionId).toBe("s1")
    })

    it("exits when --judge or --submission missing", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAssignmentsCreate } = await import("../../src/commands/judging/assignments-create")
      await expect(runAssignmentsCreate(client, hackathonId, ["--judge", "j1"])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("assignments delete", () => {
    it("sends DELETE with --yes flag", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAssignmentsDelete } = await import("../../src/commands/judging/assignments-delete")
      await runAssignmentsDelete(client, hackathonId, "a1", { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/assignments/a1`)
      expect(init.method).toBe("DELETE")
    })

    it("skips delete when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAssignmentsDelete } = await import("../../src/commands/judging/assignments-delete")
      await runAssignmentsDelete(client, hackathonId, "a1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("invitations list", () => {
    it("displays pending invitations", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          invitations: [{ email: "pending@test.com", status: "pending", createdAt: "2026-01-01" }],
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runInvitationsList } = await import("../../src/commands/judging/invitations-list")
      await runInvitationsList(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("pending@test.com")
    })

    it("shows empty message when no invitations", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ invitations: [] }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runInvitationsList } = await import("../../src/commands/judging/invitations-list")
      await runInvitationsList(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("No pending invitations")
    })
  })

  describe("invitations cancel", () => {
    it("sends DELETE with --yes flag", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runInvitationsCancel } = await import("../../src/commands/judging/invitations-cancel")
      await runInvitationsCancel(client, hackathonId, "inv1", { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/invitations/inv1`)
      expect(init.method).toBe("DELETE")
    })

    it("skips cancel when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runInvitationsCancel } = await import("../../src/commands/judging/invitations-cancel")
      await runInvitationsCancel(client, hackathonId, "inv1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("levels list", () => {
    it("fetches and displays rubric levels", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          levels: [
            { id: "l1", criteriaId: "c1", levelNumber: 1, label: "Novice", description: "Basic attempt" },
            { id: "l2", criteriaId: "c1", levelNumber: 2, label: "Proficient", description: "Solid work" },
          ],
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsList } = await import("../../src/commands/judging/levels-list")
      await runLevelsList(client, hackathonId, "c1", { json: false })

      expect(consoleLogSpy.mock.calls[0][0]).toContain("Novice")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Proficient")
    })

    it("--json outputs raw data", async () => {
      const data = { levels: [{ id: "l1", criteriaId: "c1", levelNumber: 1, label: "Novice" }] }
      mockFetch.mockResolvedValueOnce(jsonResponse(data))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsList } = await import("../../src/commands/judging/levels-list")
      await runLevelsList(client, hackathonId, "c1", { json: true })

      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(data)
    })

    it("shows empty message when no levels", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ levels: [] }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsList } = await import("../../src/commands/judging/levels-list")
      await runLevelsList(client, hackathonId, "c1", { json: false })

      expect(consoleLogSpy.mock.calls[0][0]).toContain("No rubric levels found")
    })
  })

  describe("levels add", () => {
    it("sends POST with required flags", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "l1", criteriaId: "c1", levelNumber: 1, label: "Novice" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsAdd } = await import("../../src/commands/judging/levels-add")
      await runLevelsAdd(client, hackathonId, "c1", ["--label", "Novice"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/criteria/c1/levels`)
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.label).toBe("Novice")
    })

    it("sends POST with optional description", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "l1", criteriaId: "c1", levelNumber: 1, label: "Novice", description: "Entry level" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsAdd } = await import("../../src/commands/judging/levels-add")
      await runLevelsAdd(client, hackathonId, "c1", ["--label", "Novice", "--description", "Entry level"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.label).toBe("Novice")
      expect(body.description).toBe("Entry level")
    })

    it("exits with error when --label is missing", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsAdd } = await import("../../src/commands/judging/levels-add")
      await expect(runLevelsAdd(client, hackathonId, "c1", [])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("levels update", () => {
    it("sends PATCH with updated label", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "l1", criteriaId: "c1", levelNumber: 1, label: "Expert" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsUpdate } = await import("../../src/commands/judging/levels-update")
      await runLevelsUpdate(client, hackathonId, "c1", "l1", ["--label", "Expert"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/criteria/c1/levels/l1`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body.label).toBe("Expert")
    })

    it("exits with error when no fields provided", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsUpdate } = await import("../../src/commands/judging/levels-update")
      await expect(runLevelsUpdate(client, hackathonId, "c1", "l1", [])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("track-assign", () => {
    it("assigns judge to track", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ assignedCount: 5 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTrackAssign } = await import("../../src/commands/judging/track-assign")
      await runTrackAssign(client, hackathonId, ["--judge", "j1", "--track", "t1"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain("/judging/track-assign")
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.judgeParticipantId).toBe("j1")
      expect(body.trackId).toBe("t1")
    })

    it("exits when --judge or --track missing", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTrackAssign } = await import("../../src/commands/judging/track-assign")
      await expect(runTrackAssign(client, hackathonId, ["--judge", "j1"])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it("--json outputs raw data", async () => {
      const data = { assignedCount: 3 }
      mockFetch.mockResolvedValueOnce(jsonResponse(data))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTrackAssign } = await import("../../src/commands/judging/track-assign")
      await runTrackAssign(client, hackathonId, ["--judge", "j1", "--track", "t1", "--json"])
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(data)
    })
  })

  describe("track-unassign", () => {
    it("removes judge from track with --yes", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ removedCount: 5 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTrackUnassign } = await import("../../src/commands/judging/track-unassign")
      await runTrackUnassign(client, hackathonId, ["--judge", "j1", "--track", "t1", "--yes"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain("/judging/track-assign")
      expect(init.method).toBe("DELETE")
      const body = JSON.parse(init.body as string)
      expect(body.judgeParticipantId).toBe("j1")
    })

    it("skips when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTrackUnassign } = await import("../../src/commands/judging/track-unassign")
      await runTrackUnassign(client, hackathonId, ["--judge", "j1", "--track", "t1"])
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("levels delete", () => {
    it("sends DELETE and shows updated levels list", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          jsonResponse({ levels: [{ id: "l2", criteriaId: "c1", levelNumber: 2, label: "Proficient" }] })
        )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsDelete } = await import("../../src/commands/judging/levels-delete")
      await runLevelsDelete(client, hackathonId, "c1", "l1", { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/judging/criteria/c1/levels/l1`)
      expect(init.method).toBe("DELETE")
      expect(consoleLogSpy.mock.calls[1][0]).toContain("Proficient")
    })

    it("skips delete when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runLevelsDelete } = await import("../../src/commands/judging/levels-delete")
      await runLevelsDelete(client, hackathonId, "c1", "l1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
