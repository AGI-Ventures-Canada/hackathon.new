import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  mockClerkClient,
  resetClerkMocks,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

type FakeUser = {
  id: string
  firstName: string | null
  lastName: string | null
  username: string | null
  emailAddresses: { emailAddress: string }[]
}

let nextUsers: FakeUser[] = []
const getUserList = mock(({ userId }: { userId: string[] }) =>
  Promise.resolve({ data: nextUsers.filter((u) => userId.includes(u.id)) })
)

const { listHackathonPeople, peopleToCsvRows } = await import(
  "@/lib/services/hackathon-people"
)

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"

type Tables = {
  hackathon_participants?: unknown[]
  teams?: unknown[]
  team_invitations?: unknown[]
  judge_invitations?: unknown[]
}

function mockTables(tables: Tables) {
  setMockFromImplementation((table) => {
    const data = (tables as Record<string, unknown[] | undefined>)[table] ?? []
    return createChainableMock({ data, error: null })
  })
}

describe("listHackathonPeople", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    resetClerkMocks()
    nextUsers = []
    getUserList.mockClear()
    mockClerkClient.mockImplementation(() =>
      Promise.resolve({ users: { getUserList } } as never)
    )
  })

  it("returns an empty array when there are no participants or invites", async () => {
    mockTables({})
    const result = await listHackathonPeople(HACKATHON_ID)
    expect(result).toEqual([])
  })

  it("returns an empty array when hackathonId is not a valid UUID", async () => {
    const result = await listHackathonPeople("draft")
    expect(result).toEqual([])
  })

  it("returns accepted rows for all four roles", async () => {
    mockTables({
      hackathon_participants: [
        { id: "p1", clerk_user_id: "user_a", role: "participant", team_id: null, registered_at: "2026-05-01T00:00:00Z" },
        { id: "p2", clerk_user_id: "user_b", role: "judge", team_id: null, registered_at: "2026-05-02T00:00:00Z" },
        { id: "p3", clerk_user_id: "user_c", role: "mentor", team_id: null, registered_at: "2026-05-03T00:00:00Z" },
        { id: "p4", clerk_user_id: "user_d", role: "organizer", team_id: null, registered_at: "2026-05-04T00:00:00Z" },
      ],
    })
    nextUsers = [
      { id: "user_a", firstName: "Ada", lastName: "Lovelace", username: null, emailAddresses: [{ emailAddress: "ada@example.com" }] },
      { id: "user_b", firstName: "Bob", lastName: null, username: null, emailAddresses: [{ emailAddress: "bob@example.com" }] },
      { id: "user_c", firstName: null, lastName: null, username: "carol", emailAddresses: [{ emailAddress: "carol@example.com" }] },
      { id: "user_d", firstName: "Dee", lastName: null, username: null, emailAddresses: [{ emailAddress: "dee@example.com" }] },
    ]

    const result = await listHackathonPeople(HACKATHON_ID)

    expect(result.map((p) => p.role).sort()).toEqual(["judge", "mentor", "organizer", "participant"])
    const ada = result.find((p) => p.id === "p1")!
    expect(ada.name).toBe("Ada Lovelace")
    expect(ada.email).toBe("ada@example.com")
    expect(ada.status).toBe("accepted")
    const carol = result.find((p) => p.id === "p3")!
    expect(carol.name).toBe("carol")
  })

  it("includes pending team and judge invitations", async () => {
    mockTables({
      team_invitations: [
        { id: "ti1", team_id: "team_x", email: "newbie@example.com", created_at: "2026-05-05T00:00:00Z" },
      ],
      judge_invitations: [
        { id: "ji1", email: "expert@example.com", created_at: "2026-05-06T00:00:00Z" },
      ],
      teams: [{ id: "team_x", name: "Rocket", captain_clerk_user_id: null }],
    })

    const result = await listHackathonPeople(HACKATHON_ID)

    expect(result).toHaveLength(2)
    const teamInv = result.find((p) => p.email === "newbie@example.com")!
    expect(teamInv.status).toBe("pending")
    expect(teamInv.role).toBe("participant")
    expect(teamInv.teamName).toBe("Rocket")
    expect(teamInv.name).toBeNull()

    const judgeInv = result.find((p) => p.email === "expert@example.com")!
    expect(judgeInv.status).toBe("pending")
    expect(judgeInv.role).toBe("judge")
    expect(judgeInv.teamName).toBeNull()
  })

  it("plumbs reminded_at through onto pending team and judge invitations", async () => {
    mockTables({
      team_invitations: [
        { id: "ti1", team_id: "team_x", email: "team-invitee@example.com", created_at: "2026-05-05T00:00:00Z", reminded_at: "2026-05-06T12:00:00Z" },
        { id: "ti2", team_id: "team_x", email: "team-fresh@example.com", created_at: "2026-05-05T00:00:00Z", reminded_at: null },
      ],
      judge_invitations: [
        { id: "ji1", email: "judge-invitee@example.com", created_at: "2026-05-06T00:00:00Z", reminded_at: "2026-05-07T09:30:00Z" },
        { id: "ji2", email: "judge-fresh@example.com", created_at: "2026-05-06T00:00:00Z", reminded_at: null },
      ],
      teams: [{ id: "team_x", name: "Rocket", captain_clerk_user_id: null }],
    })

    const result = await listHackathonPeople(HACKATHON_ID)

    const reminded = result.find((p) => p.email === "team-invitee@example.com")!
    expect(reminded.remindedAt).toBe("2026-05-06T12:00:00Z")
    const fresh = result.find((p) => p.email === "team-fresh@example.com")!
    expect(fresh.remindedAt).toBeNull()

    const judgeReminded = result.find((p) => p.email === "judge-invitee@example.com")!
    expect(judgeReminded.remindedAt).toBe("2026-05-07T09:30:00Z")
    const judgeFresh = result.find((p) => p.email === "judge-fresh@example.com")!
    expect(judgeFresh.remindedAt).toBeNull()
  })

  it("sets remindedAt to null on accepted participants", async () => {
    mockTables({
      hackathon_participants: [
        { id: "p1", clerk_user_id: "user_a", role: "participant", team_id: null, registered_at: "2026-05-01T00:00:00Z" },
      ],
    })
    nextUsers = [
      { id: "user_a", firstName: "Ada", lastName: null, username: null, emailAddresses: [{ emailAddress: "ada@example.com" }] },
    ]

    const result = await listHackathonPeople(HACKATHON_ID)
    expect(result[0].remindedAt).toBeNull()
  })

  it("dedupes a pending invite when the email is already an accepted participant", async () => {
    mockTables({
      hackathon_participants: [
        { id: "p1", clerk_user_id: "user_a", role: "participant", team_id: null, registered_at: "2026-05-01T00:00:00Z" },
      ],
      team_invitations: [
        { id: "ti1", team_id: "team_x", email: "Ada@Example.com", created_at: "2026-05-02T00:00:00Z" },
      ],
      judge_invitations: [
        { id: "ji1", email: "ada@example.com", created_at: "2026-05-02T00:00:00Z" },
      ],
      teams: [{ id: "team_x", name: "Rocket", captain_clerk_user_id: null }],
    })
    nextUsers = [
      { id: "user_a", firstName: "Ada", lastName: null, username: null, emailAddresses: [{ emailAddress: "ada@example.com" }] },
    ]

    const result = await listHackathonPeople(HACKATHON_ID)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("accepted")
    expect(result[0].email).toBe("ada@example.com")
  })

  it("flags the team captain with isCaptain", async () => {
    mockTables({
      hackathon_participants: [
        { id: "p1", clerk_user_id: "user_cap", role: "participant", team_id: "team_x", registered_at: "2026-05-01T00:00:00Z" },
        { id: "p2", clerk_user_id: "user_mem", role: "participant", team_id: "team_x", registered_at: "2026-05-02T00:00:00Z" },
      ],
      teams: [{ id: "team_x", name: "Rocket", captain_clerk_user_id: "user_cap" }],
    })
    nextUsers = [
      { id: "user_cap", firstName: "Cap", lastName: null, username: null, emailAddresses: [{ emailAddress: "cap@example.com" }] },
      { id: "user_mem", firstName: "Mem", lastName: null, username: null, emailAddresses: [{ emailAddress: "mem@example.com" }] },
    ]

    const result = await listHackathonPeople(HACKATHON_ID)
    const cap = result.find((p) => p.id === "p1")!
    const mem = result.find((p) => p.id === "p2")!
    expect(cap.isCaptain).toBe(true)
    expect(cap.teamName).toBe("Rocket")
    expect(mem.isCaptain).toBe(false)
    expect(mem.teamName).toBe("Rocket")
  })

  it("renders seed users without calling Clerk", async () => {
    mockTables({
      hackathon_participants: [
        { id: "p1", clerk_user_id: "seed_user_alice_1", role: "participant", team_id: null, registered_at: "2026-05-01T00:00:00Z" },
      ],
    })

    const result = await listHackathonPeople(HACKATHON_ID)
    expect(getUserList).not.toHaveBeenCalled()
    expect(result[0].name).toBe("Alice")
    expect(result[0].email).toBe("alice@seed.local")
  })

  it("sorts accepted before pending, each group by joinedOrInvitedAt desc", async () => {
    mockTables({
      hackathon_participants: [
        { id: "p_old", clerk_user_id: "user_old", role: "participant", team_id: null, registered_at: "2026-05-01T00:00:00Z" },
        { id: "p_new", clerk_user_id: "user_new", role: "participant", team_id: null, registered_at: "2026-05-04T00:00:00Z" },
      ],
      team_invitations: [
        { id: "ti_old", team_id: "team_x", email: "older@example.com", created_at: "2026-05-02T00:00:00Z" },
        { id: "ti_new", team_id: "team_x", email: "newer@example.com", created_at: "2026-05-05T00:00:00Z" },
      ],
      teams: [{ id: "team_x", name: "Rocket", captain_clerk_user_id: null }],
    })
    nextUsers = [
      { id: "user_old", firstName: "Old", lastName: null, username: null, emailAddresses: [{ emailAddress: "old@example.com" }] },
      { id: "user_new", firstName: "New", lastName: null, username: null, emailAddresses: [{ emailAddress: "new@example.com" }] },
    ]

    const result = await listHackathonPeople(HACKATHON_ID)
    expect(result.map((p) => p.id)).toEqual(["p_new", "p_old", "team_invitation:ti_new", "team_invitation:ti_old"])
  })
})

describe("peopleToCsvRows", () => {
  it("maps Person rows to CSV-friendly columns with human labels", () => {
    const rows = peopleToCsvRows([
      {
        id: "p1",
        name: "Ada",
        email: "ada@example.com",
        role: "participant",
        status: "accepted",
        teamId: "team_x",
        teamName: "Rocket",
        isCaptain: true,
        joinedOrInvitedAt: "2026-05-01T00:00:00Z",
        remindedAt: null,
      },
      {
        id: "team_invitation:ti1",
        name: null,
        email: "newbie@example.com",
        role: "judge",
        status: "pending",
        teamId: null,
        teamName: null,
        isCaptain: false,
        joinedOrInvitedAt: "2026-05-02T00:00:00Z",
        remindedAt: null,
      },
    ])

    expect(rows[0]).toEqual({
      Name: "Ada",
      Email: "ada@example.com",
      Role: "Attendee",
      Status: "Accepted",
      Team: "Rocket",
      Captain: "Yes",
      "Joined or invited at": "2026-05-01T00:00:00Z",
    })
    expect(rows[1]).toEqual({
      Name: "",
      Email: "newbie@example.com",
      Role: "Judge",
      Status: "Invited",
      Team: "",
      Captain: "No",
      "Joined or invited at": "2026-05-02T00:00:00Z",
    })
  })
})
