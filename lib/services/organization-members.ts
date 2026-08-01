import { clerkClient } from "@clerk/nextjs/server"

type TimestampValue = Date | number | string

type ClerkOrganizationMembershipResource = {
  id: string
  role: string
  createdAt: TimestampValue
  updatedAt: TimestampValue
  publicUserData?: {
    firstName: string | null
    lastName: string | null
    identifier: string
    imageUrl: string
    userId: string
  } | null
}

type ClerkOrganizationInvitationResource = {
  id: string
  emailAddress: string
  organizationId: string
  role: string
  status: string
  createdAt: TimestampValue
  updatedAt: TimestampValue
  expiresAt?: TimestampValue | null
  url?: string | null
}

export type OrganizationMember = {
  id: string
  userId: string
  name: string
  email: string
  imageUrl: string | null
  role: string
  createdAt: string
  updatedAt: string
}

export type OrganizationInvitation = {
  id: string
  email: string
  role: string
  status: string
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  url: string | null
}

export type OrganizationPeople = {
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
  memberCount: number
  invitationCount: number
}

export type OrganizationMemberRole = "org:member" | "org:admin"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toIsoTimestamp(value: TimestampValue | null | undefined): string {
  if (value === null || value === undefined) {
    return new Date(0).toISOString()
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString()
  }
  return date.toISOString()
}

function toOptionalIsoTimestamp(value: TimestampValue | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

export function normalizeOrganizationInviteEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalized)) {
    return null
  }
  return normalized
}

export function isOrganizationMemberRole(role: string): role is OrganizationMemberRole {
  return role === "org:member" || role === "org:admin"
}

export function getClerkErrorMessage(error: unknown, fallback: string): string {
  const clerkError = error as {
    errors?: Array<{ longMessage?: string; message?: string }>
    message?: string
  }
  return clerkError.errors?.[0]?.longMessage ?? clerkError.errors?.[0]?.message ?? clerkError.message ?? fallback
}

function formatMember(member: ClerkOrganizationMembershipResource): OrganizationMember {
  const user = member.publicUserData
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ")
  const email = user?.identifier ?? "Unknown email"

  return {
    id: member.id,
    userId: user?.userId ?? member.id,
    name: name || email,
    email,
    imageUrl: user?.imageUrl ?? null,
    role: member.role,
    createdAt: toIsoTimestamp(member.createdAt),
    updatedAt: toIsoTimestamp(member.updatedAt),
  }
}

function formatInvitation(invitation: ClerkOrganizationInvitationResource): OrganizationInvitation {
  return {
    id: invitation.id,
    email: invitation.emailAddress,
    role: invitation.role,
    status: invitation.status,
    createdAt: toIsoTimestamp(invitation.createdAt),
    updatedAt: toIsoTimestamp(invitation.updatedAt),
    expiresAt: toOptionalIsoTimestamp(invitation.expiresAt),
    url: invitation.url ?? null,
  }
}

function getOrganizationInviteRedirectUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hackathon.new"
  return new URL("/home", appUrl).toString()
}

export async function listOrganizationPeople(organizationId: string): Promise<OrganizationPeople> {
  const client = await clerkClient()
  const [membersResponse, invitationsResponse] = await Promise.all([
    client.organizations.getOrganizationMembershipList({
      organizationId,
      limit: 100,
      orderBy: "+email_address",
    }),
    client.organizations.getOrganizationInvitationList({
      organizationId,
      limit: 100,
      status: ["pending"],
    }),
  ])

  const members = (membersResponse.data as ClerkOrganizationMembershipResource[]).map(formatMember)
  const invitations = (invitationsResponse.data as ClerkOrganizationInvitationResource[]).map(formatInvitation)
  const memberCount = membersResponse.totalCount ?? members.length
  const invitationCount = invitationsResponse.totalCount ?? invitations.length

  if (memberCount > members.length || invitationCount > invitations.length) {
    console.warn("Organization people list was truncated.", {
      organizationId,
      memberCount,
      invitationCount,
      visibleMemberCount: members.length,
      visibleInvitationCount: invitations.length,
    })
  }

  return {
    members,
    invitations,
    memberCount,
    invitationCount,
  }
}

export async function inviteOrganizationMember(input: {
  organizationId: string
  inviterUserId: string
  email: string
  role: OrganizationMemberRole
}): Promise<OrganizationInvitation> {
  const client = await clerkClient()
  const invitation = await client.organizations.createOrganizationInvitation({
    organizationId: input.organizationId,
    inviterUserId: input.inviterUserId,
    emailAddress: input.email,
    role: input.role,
    redirectUrl: getOrganizationInviteRedirectUrl(),
  })

  return formatInvitation(invitation as ClerkOrganizationInvitationResource)
}

export async function revokeOrganizationMemberInvitation(input: {
  organizationId: string
  invitationId: string
  requestingUserId: string
}): Promise<OrganizationInvitation> {
  const client = await clerkClient()
  const invitation = await client.organizations.revokeOrganizationInvitation({
    organizationId: input.organizationId,
    invitationId: input.invitationId,
    requestingUserId: input.requestingUserId,
  })

  return formatInvitation(invitation as ClerkOrganizationInvitationResource)
}

export async function removeOrganizationMember(input: {
  organizationId: string
  userId: string
}): Promise<void> {
  const client = await clerkClient()
  await client.organizations.deleteOrganizationMembership({
    organizationId: input.organizationId,
    userId: input.userId,
  })
}
