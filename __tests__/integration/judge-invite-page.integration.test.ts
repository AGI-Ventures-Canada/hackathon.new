import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const auth = mock(() => Promise.resolve<{ userId: string | null }>({ userId: null }))
const getUser = mock(() => Promise.resolve({
  primaryEmailAddress: { emailAddress: "judge@example.com" },
  emailAddresses: [{ emailAddress: "judge@example.com", verification: { status: "verified" } }],
}))
const invitation = {
  status: "pending",
  email: "judge@example.com",
  expires_at: "2099-09-06T12:00:00.000Z",
  organizerName: "Community Builders" as string | null,
  personal_message: "  Your design experience would help our teams.  " as string | null,
  hackathon: {
    name: "Our event", slug: "our-event", starts_at: null, ends_at: null,
    judging_timezone: "UTC", judging_opens_at: "2099-09-05T12:00:00Z",
    judging_closes_at: "2099-09-06T12:00:00Z",
    judging_instructions: "Watch each demo before scoring.",
    require_terms_acceptance: false, terms_content: null,
  },
}
const getJudgeInvitationByToken = mock(() => Promise.resolve<typeof invitation | null>(invitation))
const currentTermsHash = mock(() => Promise.resolve<string | null>(null))
let clientProps: Record<string, unknown> = {}

mock.module("next/navigation", () => ({ notFound: (): never => { throw new Error("NOT_FOUND") } }))
mock.module("@clerk/nextjs/server", () => ({ auth, clerkClient: async () => ({ users: { getUser } }) }))
mock.module("@/lib/services/judge-invitations", () => ({ getJudgeInvitationByToken }))
mock.module("@/lib/services/hackathon-terms", () => ({ currentTermsHash }))
mock.module("@/lib/email/judge-invitations", () => ({ formatJudgeEventSchedule: (start: string | null) => start }))
mock.module("@/app/(public)/judge-invite/[token]/judge-invite-accept-client", () => ({
  JudgeInviteAcceptClient: (props: Record<string, unknown>) => {
    clientProps = props
    return createElement("main", null, "Invitation")
  },
}))

const { default: JudgeInvitePage } = await import("@/app/(public)/judge-invite/[token]/page")
const callPage = (accept?: string) => JudgeInvitePage({
  params: Promise.resolve({ token: "invite-token" }),
  searchParams: Promise.resolve({ accept }),
})

beforeEach(() => {
  clientProps = {}
  auth.mockReset(); auth.mockResolvedValue({ userId: null })
  getUser.mockClear()
  getJudgeInvitationByToken.mockReset(); getJudgeInvitationByToken.mockResolvedValue(invitation)
  currentTermsHash.mockReset(); currentTermsHash.mockResolvedValue(null)
})

describe("judge invitation server page", () => {
  it("passes organizer, personal message, and briefing separately before sign-in", async () => {
    expect(renderToStaticMarkup(await callPage())).toContain("Invitation")
    expect(clientProps).toMatchObject({
      token: "invite-token", isAuthenticated: false, autoAccept: false,
      invitation: {
        hackathonName: "Our event", organizerName: "Community Builders",
        personalMessage: "Your design experience would help our teams.",
        instructions: "Watch each demo before scoring.",
        eventSchedule: invitation.hackathon.judging_opens_at, judgingSchedule: true,
      },
    })
    expect(getUser).not.toHaveBeenCalled()
  })

  it("preserves the explicit return intent and checks the signed-in email", async () => {
    auth.mockResolvedValue({ userId: "judge-user" })
    renderToStaticMarkup(await callPage("true"))
    expect(getUser).toHaveBeenCalledWith("judge-user")
    expect(clientProps).toMatchObject({ isAuthenticated: true, autoAccept: true, emailMatches: true })
  })

  it("does not invent an organizer or a personal note for an older invitation", async () => {
    getJudgeInvitationByToken.mockResolvedValue({ ...invitation, organizerName: null, personal_message: null })
    renderToStaticMarkup(await callPage())
    expect(clientProps.invitation).toMatchObject({ organizerName: null, personalMessage: null })
  })

  it("returns not found before looking up an account for an unknown token", async () => {
    auth.mockResolvedValue({ userId: "judge-user" })
    getJudgeInvitationByToken.mockResolvedValue(null)
    await expect(callPage()).rejects.toThrow("NOT_FOUND")
    expect(getUser).not.toHaveBeenCalled()
    expect(currentTermsHash).not.toHaveBeenCalled()
  })
})
