import { beforeEach, describe, expect, it } from "bun:test"
import { createChainableMock, mockClerkClient, resetSupabaseMocks, setMockFromImplementation } from "../lib/supabase-mock"
import { listMyJudgeInvitations } from "@/lib/services/judging-home"

describe("the judge dashboard invitation list", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockClerkClient.mockResolvedValue({ users: { getUser: async () => ({ emailAddresses: [
      { emailAddress: "Judge@Example.com", verification: { status: "verified" } },
      { emailAddress: "unverified@example.com", verification: { status: "unverified" } },
    ] }) } } as unknown)
  })

  it("shows only pending, unexpired invitations to verified addresses whose event can send invitations", async () => {
    const now = Date.now()
    const event = { name: "Build", status: "active", is_test_event: false, results_published_at: null, judging_opens_at: new Date(now - 3_600_000).toISOString(), judging_closes_at: new Date(now + 3_600_000).toISOString() }
    const base = { email: "judge@example.com", status: "pending", expires_at: new Date(now + 86_400_000).toISOString(), hackathon: event }
    const rows = [
      { ...base, id: "open", token: "open" },
      { ...base, id: "upcoming", hackathon: { ...event, judging_opens_at: new Date(now + 600_000).toISOString() } },
      { ...base, id: "legacy-post-event", hackathon: { ...event, status: "registration_open", judging_opens_at: null, judging_closes_at: null } },
      { ...base, id: "draft", hackathon: { ...event, status: "draft" } },
      { ...base, id: "test", hackathon: { ...event, is_test_event: true } },
      { ...base, id: "closed", hackathon: { ...event, judging_closes_at: new Date(now - 1).toISOString() } },
      { ...base, id: "published", hackathon: { ...event, results_published_at: new Date(now).toISOString() } },
      { ...base, id: "completed", hackathon: { ...event, status: "completed" } },
      { ...base, id: "archived", hackathon: { ...event, status: "archived" } },
      { ...base, id: "invalid", hackathon: { ...event, judging_closes_at: null } },
      { ...base, id: "cancelled", status: "cancelled" },
      { ...base, id: "accepted", status: "accepted" },
      { ...base, id: "expired", expires_at: new Date(now - 1).toISOString() },
      { ...base, id: "unverified", email: "unverified@example.com" },
      { ...base, id: "other-person", email: "other@example.com" },
    ]
    setMockFromImplementation(() => {
      const chain = createChainableMock({ data: rows, error: null })
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      chain.eq.mockImplementation((...args: unknown[]) => { filters.push((row) => row[String(args[0])] === args[1]); return chain })
      chain.in.mockImplementation((...args: unknown[]) => { filters.push((row) => (args[1] as unknown[]).includes(row[String(args[0])])); return chain })
      chain.gt.mockImplementation((...args: unknown[]) => { filters.push((row) => String(row[String(args[0])]) > String(args[1])); return chain })
      chain.then = (resolve) => resolve({ data: rows.filter((row) => filters.every((filter) => filter(row))), error: null })
      return chain
    })
    expect((await listMyJudgeInvitations("user")).map((invitation) => invitation.id)).toEqual(["open", "upcoming", "legacy-post-event"])
  })

  it("does not query invitations when the account has no verified email", async () => {
    mockClerkClient.mockResolvedValue({ users: { getUser: async () => ({ emailAddresses: [] }) } } as unknown)
    setMockFromImplementation(() => { throw new Error("Invitation lookup must not run") })
    expect(await listMyJudgeInvitations("user")).toEqual([])
  })

  it("surfaces an invitation lookup outage", async () => {
    setMockFromImplementation(() => createChainableMock({ data: null, error: { message: "offline" } }))
    await expect(listMyJudgeInvitations("user")).rejects.toThrow("We couldn't load your judging invitations.")
  })
})
