import { beforeEach, describe, expect, it } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { countUnsentInvitationEmails } = await import(
  "@/lib/services/invitation-email-health"
)

describe("invitation email health", () => {
  beforeEach(() => resetSupabaseMocks())

  it("adds pending unsent team and judge invitation counts", async () => {
    setMockFromImplementation((table) =>
      createChainableMock({
        data: null,
        error: null,
        count: table === "team_invitations" ? 2 : 3,
      }),
    )

    await expect(countUnsentInvitationEmails("h1")).resolves.toBe(5)
  })

  it("fails open for the organizer page when a count query fails", async () => {
    setMockFromImplementation((table) =>
      createChainableMock(
        table === "team_invitations"
          ? { data: null, error: { message: "down" } }
          : { data: null, error: null, count: 1 },
      ),
    )

    await expect(countUnsentInvitationEmails("h1")).resolves.toBe(1)
  })
})
