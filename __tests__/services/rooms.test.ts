import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const {
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  addTeamToRoom,
  removeTeamFromRoom,
  togglePresented,
  setRoomTimer,
  clearRoomTimer,
  addJudgeToRoom,
  removeJudgeFromRoom,
  setAutoAssignByRoom,
  getAutoAssignByRoom,
} = await import("@/lib/services/rooms")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const ROOM_ID = "22222222-2222-2222-2222-222222222222"
const TEAM_ID = "33333333-3333-3333-3333-333333333333"
const JUDGE_PARTICIPANT_ID = "44444444-4444-4444-4444-444444444444"

describe("rooms service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listRooms", () => {
    it("returns rooms with team info", async () => {
      const rooms = [
        { id: ROOM_ID, hackathon_id: HACKATHON_ID, name: "Room A", display_order: 0, timer_ends_at: null, timer_label: null, created_at: "2026-04-01" },
      ]
      const roomTeams = [
        { id: "rt1", room_id: ROOM_ID, team_id: TEAM_ID, has_presented: false, present_order: null },
      ]
      const teams = [{ id: TEAM_ID, name: "Team Alpha" }]

      setMockFromImplementation((table) => {
        if (table === "rooms") return createChainableMock(mockSuccess(rooms))
        if (table === "room_teams") return createChainableMock(mockSuccess(roomTeams))
        if (table === "teams") return createChainableMock(mockSuccess(teams))
        return createChainableMock(mockSuccess(null))
      })

      const result = await listRooms(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Room A")
      expect(result[0].teamCount).toBe(1)
      expect(result[0].presentedCount).toBe(0)
      expect(result[0].teams[0].team_name).toBe("Team Alpha")
    })

    it("returns empty array on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("DB error")))
      const result = await listRooms(HACKATHON_ID)
      expect(result).toEqual([])
    })

    it("returns rooms with zero teams", async () => {
      const rooms = [
        { id: ROOM_ID, hackathon_id: HACKATHON_ID, name: "Empty Room", display_order: 0, timer_ends_at: null, timer_label: null, created_at: "2026-04-01" },
      ]

      setMockFromImplementation((table) => {
        if (table === "rooms") return createChainableMock(mockSuccess(rooms))
        return createChainableMock(mockSuccess([]))
      })

      const result = await listRooms(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].teamCount).toBe(0)
      expect(result[0].teams).toEqual([])
    })
  })

  describe("createRoom", () => {
    it("creates a room", async () => {
      const room = { id: ROOM_ID, hackathon_id: HACKATHON_ID, name: "Room B", display_order: 1, timer_ends_at: null, timer_label: null, created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(room)))

      const result = await createRoom(HACKATHON_ID, { name: "Room B", displayOrder: 1 })
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Room B")
    })

    it("returns null on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Insert failed")))
      const result = await createRoom(HACKATHON_ID, { name: "Room" })
      expect(result).toBeNull()
    })
  })

  describe("updateRoom", () => {
    it("updates a room", async () => {
      const room = { id: ROOM_ID, hackathon_id: HACKATHON_ID, name: "Updated", display_order: 0, timer_ends_at: null, timer_label: null, created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(room)))

      const result = await updateRoom(ROOM_ID, HACKATHON_ID, { name: "Updated" })
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Updated")
    })

    it("returns null when no updates provided", async () => {
      const result = await updateRoom(ROOM_ID, HACKATHON_ID, {})
      expect(result).toBeNull()
    })
  })

  describe("deleteRoom", () => {
    it("deletes a room", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await deleteRoom(ROOM_ID, HACKATHON_ID)
      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Delete failed")))
      const result = await deleteRoom(ROOM_ID, HACKATHON_ID)
      expect(result).toBe(false)
    })
  })

  describe("addTeamToRoom", () => {
    it("adds a team", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await addTeamToRoom(ROOM_ID, TEAM_ID)
      expect(result).toBe(true)
    })

    it("returns false on conflict", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Unique constraint")))
      const result = await addTeamToRoom(ROOM_ID, TEAM_ID)
      expect(result).toBe(false)
    })
  })

  describe("removeTeamFromRoom", () => {
    it("removes a team", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await removeTeamFromRoom(ROOM_ID, TEAM_ID)
      expect(result).toBe(true)
    })
  })

  describe("togglePresented", () => {
    it("marks team as presented", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await togglePresented(ROOM_ID, TEAM_ID, true)
      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Update failed")))
      const result = await togglePresented(ROOM_ID, TEAM_ID, true)
      expect(result).toBe(false)
    })
  })

  describe("setRoomTimer", () => {
    it("sets timer", async () => {
      const room = { id: ROOM_ID, hackathon_id: HACKATHON_ID, name: "Room A", display_order: 0, timer_ends_at: "2026-04-01T18:00:00Z", timer_label: "Presentations", created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(room)))

      const result = await setRoomTimer(ROOM_ID, HACKATHON_ID, { endsAt: "2026-04-01T18:00:00Z", label: "Presentations" })
      expect(result).not.toBeNull()
      expect(result!.timer_ends_at).toBe("2026-04-01T18:00:00Z")
    })
  })

  describe("addJudgeToRoom", () => {
    it("adds a judge after verifying participant role", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock(
            mockSuccess({ id: JUDGE_PARTICIPANT_ID, hackathon_id: HACKATHON_ID, role: "judge" })
          )
        }
        return createChainableMock({ data: null, error: null })
      })
      const result = await addJudgeToRoom(ROOM_ID, HACKATHON_ID, JUDGE_PARTICIPANT_ID)
      expect(result).toBe(true)
    })

    it("returns false when participant is not a judge in this hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock(mockSuccess(null))
        }
        return createChainableMock({ data: null, error: null })
      })
      const result = await addJudgeToRoom(ROOM_ID, HACKATHON_ID, JUDGE_PARTICIPANT_ID)
      expect(result).toBe(false)
    })

    it("returns false on upsert error", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock(
            mockSuccess({ id: JUDGE_PARTICIPANT_ID, hackathon_id: HACKATHON_ID, role: "judge" })
          )
        }
        return createChainableMock(mockError("Insert failed"))
      })
      const result = await addJudgeToRoom(ROOM_ID, HACKATHON_ID, JUDGE_PARTICIPANT_ID)
      expect(result).toBe(false)
    })
  })

  describe("removeJudgeFromRoom", () => {
    it("removes a judge", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await removeJudgeFromRoom(ROOM_ID, JUDGE_PARTICIPANT_ID)
      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Delete failed")))
      const result = await removeJudgeFromRoom(ROOM_ID, JUDGE_PARTICIPANT_ID)
      expect(result).toBe(false)
    })
  })

  describe("setAutoAssignByRoom / getAutoAssignByRoom", () => {
    it("writes the toggle value", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await setAutoAssignByRoom(HACKATHON_ID, true)
      expect(result).toBe(true)
    })

    it("reads true when set", async () => {
      setMockFromImplementation(() =>
        createChainableMock(mockSuccess({ auto_assign_by_room: true }))
      )
      const result = await getAutoAssignByRoom(HACKATHON_ID)
      expect(result).toBe(true)
    })

    it("reads false when missing hackathon", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      const result = await getAutoAssignByRoom(HACKATHON_ID)
      expect(result).toBe(false)
    })

    it("returns false on db error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("DB error")))
      const result = await setAutoAssignByRoom(HACKATHON_ID, true)
      expect(result).toBe(false)
    })
  })

  describe("clearRoomTimer", () => {
    it("clears timer", async () => {
      const room = { id: ROOM_ID, hackathon_id: HACKATHON_ID, name: "Room A", display_order: 0, timer_ends_at: null, timer_label: null, created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(room)))

      const result = await clearRoomTimer(ROOM_ID, HACKATHON_ID)
      expect(result).not.toBeNull()
      expect(result!.timer_ends_at).toBeNull()
    })
  })
})
