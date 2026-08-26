import { describe, it, expect, beforeEach, mock } from "bun:test"
import type { Submission } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  mockClerkClient,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockSendSubmissionConfirmationEmail = mock(() =>
  Promise.resolve({ success: true })
)

mock.module("@/lib/email/submission-confirmation", () => ({
  sendSubmissionConfirmationEmail: mockSendSubmissionConfirmationEmail,
}))

const {
  getParticipantWithTeam,
  getSubmissionForParticipant,
  getExistingSubmission,
  createSubmission,
  updateSubmission,
  getTeamMemberCount,
  submissionBelongsToHackathon,
  notifySubmissionMembers,
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
      expect(result?.teamStatus).toBeNull()
      expect(chain.eq).toHaveBeenCalledWith("role", "participant")
    })

    it("returns participant info with team when in a team", async () => {
      const chain = createChainableMock({
        data: { id: "p1", team_id: "team1", teams: { status: "forming" } },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantWithTeam("h1", "user_123")

      expect(result).not.toBeNull()
      expect(result?.participantId).toBe("p1")
      expect(result?.teamId).toBe("team1")
      expect(result?.teamStatus).toBe("forming")
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

    it("skips room-judge routing when auto_assign_by_room is off", async () => {
      let routingFired = false
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { auto_assign_by_room: false, status: "active" },
            error: null,
          })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: { ...mockSubmission, team_id: "team1", participant_id: null },
            error: null,
          })
        }
        if (table === "room_teams" || table === "judge_room_assignments") {
          routingFired = true
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      await createSubmission("h1", "p1", "team1", {
        title: "T",
        description: "d",
        githubUrl: "https://github.com/x/y",
      })

      expect(routingFired).toBe(false)
    })

    it("skips room-judge routing when hackathon status is draft", async () => {
      let routingFired = false
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { auto_assign_by_room: true, status: "draft" },
            error: null,
          })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: { ...mockSubmission, team_id: "team1", participant_id: null },
            error: null,
          })
        }
        if (table === "room_teams" || table === "judge_room_assignments") {
          routingFired = true
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      await createSubmission("h1", "p1", "team1", {
        title: "T",
        description: "d",
        githubUrl: "https://github.com/x/y",
      })

      expect(routingFired).toBe(false)
    })

    it("invokes room-judge routing when toggle on and status active", async () => {
      let routingFired = false
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { auto_assign_by_room: true, status: "active" },
            error: null,
          })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: { ...mockSubmission, team_id: "team1", participant_id: null },
            error: null,
          })
        }
        if (table === "room_teams") {
          routingFired = true
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      await createSubmission("h1", "p1", "team1", {
        title: "T",
        description: "d",
        githubUrl: "https://github.com/x/y",
      })

      expect(routingFired).toBe(true)
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

  describe("notifySubmissionMembers", () => {
    beforeEach(() => {
      mockSendSubmissionConfirmationEmail.mockReset()
      mockSendSubmissionConfirmationEmail.mockImplementation(() =>
        Promise.resolve({ success: true })
      )
    })

    it("sends a confirmation to the solo participant", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { name: "AI Hack", slug: "ai-hack", status: "active" },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: { clerk_user_id: "user_solo" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockImplementation(() =>
        Promise.resolve({
          users: {
            getUserList: mock(() =>
              Promise.resolve({
                data: [
                  {
                    primaryEmailAddress: { emailAddress: "solo@example.com" },
                    emailAddresses: [{ emailAddress: "solo@example.com" }],
                  },
                ],
              })
            ),
          },
        } as never)
      )

      const sent = await notifySubmissionMembers({
        hackathonId: "h1",
        participantId: "p1",
        teamId: null,
        projectTitle: "Solo Project",
      })

      expect(sent).toBe(1)
      expect(mockSendSubmissionConfirmationEmail).toHaveBeenCalledTimes(1)
      expect(mockSendSubmissionConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "solo@example.com",
          hackathonName: "AI Hack",
          hackathonSlug: "ai-hack",
          projectTitle: "Solo Project",
          teamName: null,
        })
      )
    })

    it("sends a confirmation to every team member, deduped by email", async () => {
      let inFlight = 0
      let maxInFlight = 0
      mockSendSubmissionConfirmationEmail.mockImplementation(async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return { success: true }
      })

      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { name: "AI Hack", slug: "ai-hack", status: "active" },
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { name: "Neural Navigators" },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [
              { clerk_user_id: "user_a" },
              { clerk_user_id: "user_b" },
              { clerk_user_id: "user_a" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockImplementation(() =>
        Promise.resolve({
          users: {
            getUserList: mock(() =>
              Promise.resolve({
                data: [
                  {
                    primaryEmailAddress: { emailAddress: "a@example.com" },
                    emailAddresses: [{ emailAddress: "a@example.com" }],
                  },
                  {
                    primaryEmailAddress: { emailAddress: "B@example.com" },
                    emailAddresses: [{ emailAddress: "B@example.com" }],
                  },
                ],
              })
            ),
          },
        } as never)
      )

      const sent = await notifySubmissionMembers({
        hackathonId: "h1",
        participantId: "p1",
        teamId: "team1",
        projectTitle: "Team Project",
      })

      expect(sent).toBe(2)
      expect(mockSendSubmissionConfirmationEmail).toHaveBeenCalledTimes(2)
      const recipients = mockSendSubmissionConfirmationEmail.mock.calls.map(
        (call) => (call[0] as { to: string }).to
      )
      expect(recipients.sort()).toEqual(["a@example.com", "b@example.com"])
      expect(mockSendSubmissionConfirmationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ teamName: "Neural Navigators" })
      )
      expect(maxInFlight).toBe(1)
    })

    it("continues the paced recipient loop after one delivery rejects", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { name: "AI Hack", slug: "ai-hack", status: "active" },
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { name: "Neural Navigators" },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [
              { clerk_user_id: "user_a" },
              { clerk_user_id: "user_b" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockImplementation(() =>
        Promise.resolve({
          users: {
            getUserList: mock(() =>
              Promise.resolve({
                data: [
                  {
                    primaryEmailAddress: { emailAddress: "a@example.com" },
                    emailAddresses: [{ emailAddress: "a@example.com" }],
                  },
                  {
                    primaryEmailAddress: { emailAddress: "b@example.com" },
                    emailAddresses: [{ emailAddress: "b@example.com" }],
                  },
                ],
              })
            ),
          },
        } as never)
      )
      mockSendSubmissionConfirmationEmail
        .mockImplementationOnce(() => Promise.reject(new Error("Provider unavailable")))
        .mockImplementationOnce(() => Promise.resolve({ success: true }))

      const sent = await notifySubmissionMembers({
        hackathonId: "h1",
        submissionId: "submission-1",
        participantId: "p1",
        teamId: "team1",
        projectTitle: "Team Project",
      })

      expect(sent).toBe(1)
      expect(mockSendSubmissionConfirmationEmail).toHaveBeenCalledTimes(2)
    })

    it("skips sending when hackathon status is draft", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { name: "AI Hack", slug: "ai-hack", status: "draft" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const sent = await notifySubmissionMembers({
        hackathonId: "h1",
        participantId: "p1",
        teamId: null,
        projectTitle: "Solo Project",
      })

      expect(sent).toBe(0)
      expect(mockSendSubmissionConfirmationEmail).not.toHaveBeenCalled()
    })

    it("returns 0 when no recipients resolve to an email", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { name: "AI Hack", slug: "ai-hack", status: "active" },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: { clerk_user_id: "user_solo" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockImplementation(() =>
        Promise.resolve({
          users: {
            getUserList: mock(() => Promise.resolve({ data: [] })),
          },
        } as never)
      )

      const sent = await notifySubmissionMembers({
        hackathonId: "h1",
        participantId: "p1",
        teamId: null,
        projectTitle: "Solo Project",
      })

      expect(sent).toBe(0)
      expect(mockSendSubmissionConfirmationEmail).not.toHaveBeenCalled()
    })

    it("returns 0 when the hackathon row is missing", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const sent = await notifySubmissionMembers({
        hackathonId: "h1",
        participantId: "p1",
        teamId: null,
        projectTitle: "Solo Project",
      })

      expect(sent).toBe(0)
      expect(mockSendSubmissionConfirmationEmail).not.toHaveBeenCalled()
    })
  })

  describe("submissionBelongsToHackathon", () => {
    it("returns true when the submission belongs to the hackathon", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: { id: "s1" }, error: null })
      )

      const result = await submissionBelongsToHackathon("h1", "s1")

      expect(result).toBe(true)
    })

    it("returns false when the submission does not belong to the hackathon", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await submissionBelongsToHackathon("h1", "s1")

      expect(result).toBe(false)
    })
  })
})
