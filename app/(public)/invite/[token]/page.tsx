import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getInvitationByToken } from "@/lib/services/team-invitations"
import { currentTermsHash } from "@/lib/services/hackathon-terms"
import { InviteAcceptClient } from "./invite-accept-client"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const invitation = await getInvitationByToken(token)

  if (!invitation) {
    return { title: "Invitation Not Found" }
  }

  return {
    title: `Join ${invitation.team.name} | ${invitation.hackathon.name}`,
    description: `Accept your invitation to join team "${invitation.team.name}" for ${invitation.hackathon.name}`,
  }
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params
  const { userId } = await auth()

  const invitation = await getInvitationByToken(token)

  if (!invitation) {
    notFound()
  }

  const isExpired = new Date(invitation.expires_at) < new Date()
  const effectiveStatus = isExpired && invitation.status === "pending" ? "expired" : invitation.status

  const termsHash = await currentTermsHash({
    require_terms_acceptance: invitation.hackathon.require_terms_acceptance,
    terms_content: invitation.hackathon.terms_content,
  })

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
      <InviteAcceptClient
        token={token}
        invitation={{
          teamName: invitation.team.name,
          hackathonName: invitation.hackathon.name,
          hackathonSlug: invitation.hackathon.slug,
          hackathonStatus: invitation.hackathon.status,
          email: invitation.email,
          status: effectiveStatus,
          expiresAt: invitation.expires_at,
          requireTermsAcceptance: Boolean(termsHash),
          termsContent: termsHash ? invitation.hackathon.terms_content : null,
          termsHash,
        }}
        isAuthenticated={!!userId}
      />
    </div>
  )
}
