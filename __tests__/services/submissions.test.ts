import { describe, it, expect, beforeEach } from "bun:test"
import type { Submission } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  getParticipantWithTeam,
  getSubmissionForParticipant,
  getExistingSubmission,
  createSubmission,
  updateSubmission,
  getTeamMemberCount,
} = await import("@/lib/services/submissions")

const mockSubmission: Submission = {
  id: "s1",
  hackathon_id: "h1",
  participant_id: "p1",
  team_id: null,
  title: "Test Project",
  description: "A test project description",
  github_url: "https://github.com/test/repo",
  live_app_url: "https://test.vercel.app",
  demo_video_url: "https://youtube.com/watch?v=test-demo",
  screenshot_url: null,
  status: "submitted",
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("Submissions Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getParticipantWithTeam", () => {
    it("returns participant info when registered", async () => {
      const chain = createChainableMock({
        data: { id: "p1", team_id: null },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantWithTeam("h1", "user_123")

      expect(result).not.toBeNull()
      expect(result?.participantId).toBe("p1")
      expect(result?.teamId).toBeNull()
    })

    it("returns participant info with team when in a team", async () => {
      const chain = createChainableMock({
        data: { id: "p1", team_id: "team1" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantWithTeam("h1", "user_123")

      expect(result).not.toBeNull()
      expect(result?.participantId).toBe("p1")
      expect(result?.teamId).toBe("team1")
    })

    it("returns null when not registered", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantWithTeam("h1", "user_new")

      expect(result).toBeNull()
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantWithTeam("h1", "user_err")

      expect(result).toBeNull()
    })
  })

  describe("getSubmissionForParticipant", () => {
    it("returns submission for solo participant", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "p1", team_id: null }, error: null })
        }
        return createChainableMock({ data: mockSubmission, error: null })
      })

      const result = await getSubmissionForParticipant("h1", "user_123")

      expect(result).not.toBeNull()
      expect(result?.title).toBe("Test Project")
    })

    it("returns submission for team member", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "p1", team_id: "team1" }, error: null })
        }
        return createChainableMock({
          data: { ...mockSubmission, participant_id: null, team_id: "team1" },
          error: null,
        })
      })

      const result = await getSubmissionForParticipant("h1", "user_123")

      expect(result).not.toBeNull()
      expect(result?.team_id).toBe("team1")
    })

    it("returns null when not registered", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getSubmissionForParticipant("h1", "user_new")

      expect(result).toBeNull()
    })

    it("returns null when no submission exists", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "p1", team_id: null }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getSubmissionForParticipant("h1", "user_no_sub")

      expect(result).toBeNull()
    })
  })

  describe("getExistingSubmission", () => {
    it("returns submission for solo participant", async () => {
      const chain = createChainableMock({
        data: mockSubmission,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getExistingSubmission("h1", "p1", null)

      expect(result).not.toBeNull()
      expect(result?.title).toBe("Test Project")
    })

    it("returns submission for team", async () => {
      const chain = createChainableMock({
        data: { ...mockSubmission, participant_id: null, team_id: "team1" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getExistingSubmission("h1", "p1", "team1")

      expect(result).not.toBeNull()
      expect(result?.team_id).toBe("team1")
    })

    it("returns null when no submission exists", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getExistingSubmission("h1", "p1", null)

      expect(result).toBeNull()
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await getExistingSubmission("h1", "p1", null)

      expect(result).toBeNull()
    })
  })

  describe("createSubmission", () => {
    it("creates submission for solo participant", async () => {
      const chain = createChainableMock({
        data: mockSubmission,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createSubmission("h1", "p1", null, {
        title: "Test Project",
        description: "A test project description",
        githubUrl: "https://github.com/test/repo",
        liveAppUrl: "https://test.vercel.app",
        demoVideoUrl: "youtube.com/watch?v=test-demo",
      })

      expect(result).not.toBeNull()
      expect(result?.title).toBe("Test Project")
      expect(result?.participant_id).toBe("p1")
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          demo_video_url: "youtube.com/watch?v=test-demo",
        })
      )
    })

    it("creates submission for team", async () => {
      const chain = createChainableMock({
        data: { ...mockSubmission, participant_id: null, team_id: "team1" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createSubmission("h1", "p1", "team1", {
        title: "Team Project",
        description: "A team project",
        githubUrl: "https://github.com/team/repo",
      })

      expect(result).not.toBeNull()
      expect(result?.team_id).toBe("team1")
      expect(result?.participant_id).toBeNull()
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await createSubmission("h1", "p1", null, {
        title: "Test",
        description: "Test",
        githubUrl: "https://github.com/test/repo",
      })

      expect(result).toBeNull()
    })
  })

  describe("updateSubmission", () => {
    it("updates submission for solo participant", async () => {
      const chain = createChainableMock({
        data: { ...mockSubmission, title: "Updated Title" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateSubmission("s1", "p1", null, {
        title: "Updated Title",
        demoVideoUrl: "https://youtu.be/test-demo",
      })

      expect(result).not.toBeNull()
      expect(result?.title).toBe("Updated Title")
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Updated Title",
          demo_video_url: "https://youtu.be/test-demo",
        })
      )
    })

    it("updates submission for team", async () => {
      const chain = createChainableMock({
        data: { ...mockSubmission, participant_id: null, team_id: "team1", description: "Updated" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateSubmission("s1", "p1", "team1", {
        description: "Updated",
      })

      expect(result).not.toBeNull()
      expect(result?.description).toBe("Updated")
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updateSubmission("s1", "p1", null, {
        title: "Test",
      })

      expect(result).toBeNull()
    })
  })

  describe("getTeamMemberCount", () => {
    it("returns the count of participants in a team", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
        count: 3,
      })
      setMockFromImplementation(() => chain)

      const result = await getTeamMemberCount("team-1")
      expect(result).toBe(3)
    })

    it("returns 0 when team has no members", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
        count: 0,
      })
      setMockFromImplementation(() => chain)

      const result = await getTeamMemberCount("team-1")
      expect(result).toBe(0)
    })

    it("returns 0 when database query fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
        count: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getTeamMemberCount("team-1")
      expect(result).toBe(0)
    })

    it("returns 0 when count is null", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
        count: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getTeamMemberCount("team-1")
      expect(result).toBe(0)
    })
  })
})
