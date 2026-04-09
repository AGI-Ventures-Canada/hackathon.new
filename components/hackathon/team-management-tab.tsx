"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { useTeamRename } from "@/hooks/use-team-rename"
import { TeamInviteDialog } from "./team-invite-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Crown, Clock, X, Mail, Users } from "lucide-react"
import type { ParticipantTeamInfo } from "@/lib/services/hackathons"

interface TeamManagementTabProps {
  teamInfo: NonNullable<ParticipantTeamInfo>
  hackathonId: string
  maxTeamSize: number
}

export function TeamManagementTab({ teamInfo, hackathonId, maxTeamSize }: TeamManagementTabProps) {
  const router = useRouter()
  const { user } = useUser()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const rename = useTeamRename(hackathonId, teamInfo.team.id, teamInfo.team.name)
  const canEdit = teamInfo.isCaptain && teamInfo.team.status === "forming"

  async function handleCancelInvitation(invitationId: string) {
    setCancellingId(invitationId)
    try {
      const res = await fetch(
        `/api/dashboard/teams/${teamInfo.team.id}/invitations/${invitationId}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setCancellingId(null)
    }
  }

  function getInitials(email: string) {
    return email.substring(0, 2).toUpperCase()
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })
  }

  const isExpiringSoon = (expiresAt: string) => {
    const expiry = new Date(expiresAt)
    const now = new Date()
    const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60)
    return hoursUntilExpiry < 48
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                {canEdit && !rename.editing ? (
                  <button
                    type="button"
                    className="text-left hover:underline underline-offset-2 decoration-muted-foreground/40"
                    onClick={rename.startEditing}
                  >
                    {teamInfo.team.name}
                  </button>
                ) : rename.editing ? (
                  <Input
                    ref={rename.inputRef}
                    value={rename.value}
                    onChange={(e) => rename.setValue(e.target.value)}
                    onBlur={rename.save}
                    onKeyDown={rename.handleKeyDown}
                    disabled={rename.saving}
                    className="h-7 text-base font-semibold"
                    maxLength={100}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                ) : (
                  teamInfo.team.name
                )}
              </CardTitle>
              <CardDescription>
                {teamInfo.members.length} member{teamInfo.members.length !== 1 ? "s" : ""}
                {teamInfo.team.status === "locked" && " · Team locked"}
              </CardDescription>
              {teamInfo.isCaptain && (
                <p className="text-xs text-muted-foreground mt-1">
                  You&apos;re the team captain &mdash; you can invite members and manage your team.
                </p>
              )}
              {rename.error && (
                <p className="text-xs text-destructive mt-1">{rename.error}</p>
              )}
            </div>
            {teamInfo.isCaptain && teamInfo.team.status === "forming" && (
              <TeamInviteDialog
                teamId={teamInfo.team.id}
                hackathonId={hackathonId}
                teamName={teamInfo.team.name}
                maxTeamSize={maxTeamSize}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {teamInfo.members.map((member) => {
              const isCurrentUser = member.clerkUserId === user?.id
              return (
                <div
                  key={member.clerkUserId}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">
                        {member.displayName?.[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {member.displayName || "Team Member"}
                        </span>
                        {member.isCaptain && (
                          <Crown className="size-3.5 text-primary" />
                        )}
                        {isCurrentUser && (
                          <Badge variant="secondary" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Joined {formatDate(member.registeredAt)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {teamInfo.isCaptain && teamInfo.pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              Invitations waiting for response
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {teamInfo.pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(invitation.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="text-sm">{invitation.email}</span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        <span className={isExpiringSoon(invitation.expiresAt) ? "text-destructive" : ""}>
                          Expires {formatDate(invitation.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelInvitation(invitation.id)}
                    disabled={cancellingId === invitation.id}
                  >
                    <X className="size-4" />
                    <span className="sr-only">Cancel invitation</span>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!teamInfo.isCaptain && (
        <p className="text-sm text-muted-foreground text-center">
          Only the team captain can invite new members.
        </p>
      )}
    </div>
  )
}
