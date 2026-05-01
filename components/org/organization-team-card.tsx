"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import { CreditCard, ExternalLink, Mail, Trash2, UserMinus, UserPlus, Users } from "lucide-react"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import type {
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMemberRole,
} from "@/lib/services/organization-members"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

type OrganizationTeamCardProps = {
  initialMembers: OrganizationMember[]
  initialInvitations: OrganizationInvitation[]
  currentUserId: string | null
  canManage: boolean
  hasOrganization: boolean
}

type InviteResponse = {
  invitation: OrganizationInvitation
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "Unknown"
  }
  return dateFormatter.format(date)
}

function getRoleLabel(role: string): string {
  if (role === "org:admin") {
    return "Admin"
  }
  if (role === "org:member") {
    return "Member"
  }
  return role.replace(/^org:/, "")
}

function getInitials(name: string, email: string): string {
  const source = name && name !== email ? name : email
  const parts = source.split(/[ @._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? "U").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase()
}

function sortInvitations(invitations: OrganizationInvitation[]): OrganizationInvitation[] {
  return [...invitations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function sortMembers(members: OrganizationMember[]): OrganizationMember[] {
  return [...members].sort((a, b) => a.email.localeCompare(b.email))
}

export function OrganizationTeamCard({
  initialMembers,
  initialInvitations,
  currentUserId,
  canManage,
  hasOrganization,
}: OrganizationTeamCardProps) {
  const router = useRouter()
  const { openOrganizationProfile } = useClerk()
  const [members, setMembers] = useState(() => sortMembers(initialMembers))
  const [invitations, setInvitations] = useState(() => sortInvitations(initialInvitations))
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<OrganizationMemberRole>("org:member")
  const [error, setError] = useState<string | null>(null)

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const inviteEmail = email.trim().toLowerCase()
    if (!inviteEmail) {
      return
    }

    const tempInvitation: OrganizationInvitation = {
      id: `temp-${crypto.randomUUID()}`,
      email: inviteEmail,
      role,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null,
      url: null,
    }

    setError(null)
    setEmail("")
    setInvitations((current) => sortInvitations([tempInvitation, ...current]))

    try {
      const data = await fetch("/api/dashboard/organization-members/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role }),
      }).then(assertOkJson<InviteResponse>)

      setInvitations((current) =>
        sortInvitations(current.map((invite) => (invite.id === tempInvitation.id ? data.invitation : invite)))
      )
      router.refresh()
    } catch (err) {
      setInvitations((current) => current.filter((invite) => invite.id !== tempInvitation.id))
      setEmail(inviteEmail)
      setError(err instanceof Error ? err.message : "Could not send invite.")
    }
  }

  function handleInviteKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      event.currentTarget.requestSubmit()
    }
  }

  async function handleCancelInvitation(invitation: OrganizationInvitation) {
    setError(null)
    setInvitations((current) => current.filter((item) => item.id !== invitation.id))

    try {
      await fetch(`/api/dashboard/organization-members/invitations/${encodeURIComponent(invitation.id)}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setInvitations((current) => sortInvitations([invitation, ...current]))
      setError(err instanceof Error ? err.message : "Could not cancel invite.")
    }
  }

  async function handleRemoveMember(member: OrganizationMember) {
    setError(null)
    setMembers((current) => current.filter((item) => item.userId !== member.userId))

    try {
      await fetch(`/api/dashboard/organization-members/${encodeURIComponent(member.userId)}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setMembers((current) => sortMembers([member, ...current]))
      setError(err instanceof Error ? err.message : "Could not remove this person.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Team</CardTitle>
            <CardDescription>
              Invite people and see who can help run this org.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openOrganizationProfile()}
          >
            <CreditCard className="size-4" />
            <span>Billing</span>
            <ExternalLink className="size-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasOrganization && canManage && (
          <form
            autoComplete="off"
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={handleInviteSubmit}
            onKeyDown={handleInviteKeyDown}
          >
            <div className="w-full sm:max-w-sm">
              <Input
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <Select value={role} onValueChange={(value) => setRole(value as OrganizationMemberRole)}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org:member">Member</SelectItem>
                <SelectItem value="org:admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit">
              <UserPlus className="size-4" />
              <span>Send invite</span>
            </Button>
          </form>
        )}

        {hasOrganization && !canManage && (
          <p className="text-sm text-muted-foreground">
            Ask an admin to invite people or remove them.
          </p>
        )}

        {!hasOrganization && (
          <p className="text-sm text-muted-foreground">
            Switch to an organization to invite people.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">People</h3>
            <Badge variant="count">{members.length}</Badge>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is in this org yet.</p>
          ) : (
            <div className="divide-y border">
              {members.map((member) => {
                const isCurrentUser = member.userId === currentUserId

                return (
                  <div
                    key={member.userId}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar>
                        {member.imageUrl && <AvatarImage src={member.imageUrl} alt={member.name} />}
                        <AvatarFallback>{getInitials(member.name, member.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{member.name}</p>
                          {isCurrentUser && <Badge variant="secondary">You</Badge>}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <Badge variant={member.role === "org:admin" ? "default" : "outline"}>
                          {getRoleLabel(member.role)}
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">Joined {formatDate(member.createdAt)}</p>
                      </div>
                      {canManage && !isCurrentUser && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="outline" size="sm">
                              <UserMinus className="size-4" />
                              <span className="hidden sm:inline">Remove</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove this person?</AlertDialogTitle>
                              <AlertDialogDescription>
                                They won&apos;t be able to manage this org anymore.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep them</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => handleRemoveMember(member)}
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Pending invites</h3>
            <Badge variant="count">{invitations.length}</Badge>
          </div>

          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites.</p>
          ) : (
            <div className="divide-y border">
              {invitations.map((invitation) => {
                const isSending = invitation.id.startsWith("temp-")

                return (
                  <div
                    key={invitation.id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{invitation.email}</p>
                        <Badge variant="secondary">{isSending ? "Sending" : "Pending"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Invited {formatDate(invitation.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <Badge variant={invitation.role === "org:admin" ? "default" : "outline"}>
                        {getRoleLabel(invitation.role)}
                      </Badge>
                      {canManage && !isSending && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelInvitation(invitation)}
                        >
                          <Trash2 className="size-4" />
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
