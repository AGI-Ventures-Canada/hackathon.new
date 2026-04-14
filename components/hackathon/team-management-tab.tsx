"use client"

import { useState } from "react"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { assertOk } from "@/lib/utils/fetch"
import { useUser } from "@clerk/nextjs"
import { useTeamRename } from "@/hooks/use-team-rename"
import { useTeamMode } from "@/hooks/use-team-mode"
import { TeamInviteDialog } from "./team-invite-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Crown, Clock, X, Mail, Users, MapPin, Video, AlertTriangle } from "lucide-react"
import type { ParticipantTeamInfo } from "@/lib/services/hackathons"

interface TeamManagementTabProps {
  teamInfo: NonNullable<ParticipantTeamInfo>
  hackathonId: string
  maxTeamSize: number
  locationType?: "in_person" | "virtual" | "hybrid" | null
}

export function TeamManagementTab({ teamInfo, hackathonId, maxTeamSize, locationType }: TeamManagementTabProps) {
  const { user } = useUser()
  const [hiddenInvitations, setHiddenInvitations] = useState<Set<string>>(new Set())
  const {
    editing: renameEditing,
    value: renameValue,
    setValue: setRenameValue,
    saving: renameSaving,
    error: renameError,
    inputRef: renameInputRef,
    startEditing: renameStart,
    save: renameSave,
    handleKeyDown: renameHandleKeyDown,
  } = useTeamRename(hackathonId, teamInfo.team.id, teamInfo.team.name)
  const teamMode = useTeamMode(hackathonId, teamInfo.team.id, teamInfo.team.mode ?? null)
  const canEdit = teamInfo.isCaptain && teamInfo.team.status === "forming"
  const showModePicker = locationType === "hybrid"

  const { execute: handleCancelInvitation } = useOptimisticMutation({
    fn: (invitationId: string) =>
      fetch(
        `/api/dashboard/teams/${teamInfo.team.id}/invitations/${invitationId}`,
        { method: "DELETE" }
      ).then(assertOk),
    onOptimistic: (invitationId) =>
      setHiddenInvitations((prev) => new Set(prev).add(invitationId)),
    onRevert: (invitationId) =>
      setHiddenInvitations((prev) => {
        const next = new Set(prev)
        next.delete(invitationId)
        return next
      }),
  })

  const visibleInvitations = teamInfo.pendingInvitations.filter(
    (inv) => !hiddenInvitations.has(inv.id)
  )

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
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 min-w-0">
                <Users className="size-5" />
                {canEdit && !renameEditing ? (
                  <button
                    type="button"
                    className="text-left hover:underline underline-offset-2 decoration-muted-foreground/40"
                    onClick={renameStart}
                  >
                    {teamInfo.team.name}
                  </button>
                ) : renameEditing ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={renameSave}
                    onKeyDown={renameHandleKeyDown}
                    disabled={renameSaving}
                    className="h-8 text-base font-semibold bg-transparent border-b border-input outline-none focus:border-ring w-full min-w-0 flex-1"
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
              {renameError && (
                <p className="text-xs text-destructive mt-1">{renameError}</p>
              )}
              {showModePicker && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    How will your team join?
                  </p>
                  {teamInfo.isCaptain ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={teamMode.mode === "in_person" ? "default" : "outline"}
                        size="sm"
                        onClick={() => teamMode.setMode("in_person")}
                        disabled={teamMode.saving}
                      >
                        <MapPin className="size-3.5" />
                        In person
                      </Button>
                      <Button
                        type="button"
                        variant={teamMode.mode === "virtual" ? "default" : "outline"}
                        size="sm"
                        onClick={() => teamMode.setMode("virtual")}
                        disabled={teamMode.saving}
                      >
                        <Video className="size-3.5" />
                        Virtual
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {teamMode.mode === "in_person"
                        ? "Joining in person"
                        : teamMode.mode === "virtual"
                          ? "Joining virtually"
                          : "Your captain hasn't chosen yet"}
                    </p>
                  )}
                  {teamMode.mode === null && teamInfo.isCaptain && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                      <span>Pick one so judges know where to find your team.</span>
                    </div>
                  )}
                  {teamMode.error && (
                    <p className="text-xs text-destructive">{teamMode.error}</p>
                  )}
                </div>
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

      {teamInfo.isCaptain && visibleInvitations.length > 0 && (
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
              {visibleInvitations.map((invitation) => (
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
