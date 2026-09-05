import { notFound } from "next/navigation"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { getJudgeInvitationByToken } from "@/lib/services/judge-invitations"
import { currentTermsHash } from "@/lib/services/hackathon-terms"
import { formatJudgeEventSchedule } from "@/lib/email/judge-invitations"
import { JudgeInviteAcceptClient } from "./judge-invite-accept-client"
import type { Metadata } from "next"
import { getVerifiedUserEmails } from "@/lib/auth/verified-emails"

type PageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ accept?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const invitation = await getJudgeInvitationByToken(token)

  if (!invitation) {
    return { title: "Invitation Not Found" }
  }

  return {
    title: `Judge ${invitation.hackathon.name}`,
    description: `Accept your invitation to judge ${invitation.hackathon.name}`,
  }
}

export default async function JudgeInvitePage({ params, searchParams }: PageProps) {
  const { token } = await params
  const { accept } = await searchParams
  const { userId } = await auth()

  const invitation = await getJudgeInvitationByToken(token)

  if (!invitation) {
    notFound()
  }

  const isExpired = new Date(invitation.expires_at) < new Date()
  const effectiveStatus = isExpired && invitation.status === "pending" ? "expired" : invitation.status

  const termsHash = await currentTermsHash({
    require_terms_acceptance: invitation.hackathon.require_terms_acceptance,
    terms_content: invitation.hackathon.terms_content,
  })
  const signedInUser = userId ? await (await clerkClient()).users.getUser(userId) : null
  const verifiedEmails = signedInUser ? getVerifiedUserEmails(signedInUser) : []
  const timeZone = invitation.hackathon.judging_timezone || "UTC"

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
      <JudgeInviteAcceptClient
        token={token}
        invitation={{
          hackathonName: invitation.hackathon.name,
          hackathonSlug: invitation.hackathon.slug,
          email: invitation.email,
          status: effectiveStatus,
          expiresAt: invitation.expires_at,
          expiresLabel: formatJudgeEventSchedule(
            invitation.expires_at,
            null,
            timeZone,
          ),
          eventSchedule: formatJudgeEventSchedule(
            invitation.hackathon.judging_opens_at ?? invitation.hackathon.starts_at,
            invitation.hackathon.judging_closes_at ?? invitation.hackathon.ends_at,
            timeZone,
          ),
          requireTermsAcceptance: Boolean(termsHash),
          termsContent: termsHash ? invitation.hackathon.terms_content : null,
          termsHash,
          judgingSchedule: Boolean(invitation.hackathon.judging_opens_at),
          instructions: invitation.hackathon.judging_instructions ?? null,
        }}
        isAuthenticated={!!userId}
        autoAccept={accept === "true"}
        signedInEmail={signedInUser?.primaryEmailAddress?.emailAddress ?? null}
        emailMatches={!signedInUser || verifiedEmails.includes(invitation.email.trim().toLowerCase())}
      />
    </div>
  )
}
