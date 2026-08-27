"use client"

import { type KeyboardEvent, type RefObject } from "react"
import { CheckCircle2, Lock, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TeamInviteDialog } from "@/components/hackathon/team-invite-dialog"
import type { ParticipantTeamInfo } from "@/lib/services/hackathons"

type TeamInfo = NonNullable<ParticipantTeamInfo>

export type TeamRenameControls = {
  editing: boolean
  value: string
  setValue: (value: string) => void
  saving: boolean
  inputRef: RefObject<HTMLInputElement | null>
  startEditing: () => void
  save: () => void
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

interface ParticipantTeamHeaderProps {
  teamInfo: TeamInfo | null
  hackathonId: string
  maxTeamSize: number
  canRenameTeam: boolean
  canInviteTeamMembers: boolean
  rename: TeamRenameControls
}

export function ParticipantTeamHeader({
  teamInfo,
  hackathonId,
  maxTeamSize,
  canRenameTeam,
  canInviteTeamMembers,
  rename,
}: ParticipantTeamHeaderProps) {
  const {
    editing,
    value,
    setValue,
    saving,
    inputRef,
    startEditing,
    save,
    handleKeyDown,
  } = rename

  return (
    <div className="rounded-lg border bg-muted/50 px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Registered</span>
              {teamInfo?.isCaptain && (
                <Badge variant="secondary">Team captain</Badge>
              )}
              {teamInfo?.team.status === "pending_approval" && (
                <Badge variant="outline">Waiting for approval</Badge>
              )}
            </div>
            {teamInfo && (
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Your team</p>
                {editing ? (
                  <input
                    ref={inputRef}
                    aria-label="Team name"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={save}
                    onKeyDown={handleKeyDown}
                    disabled={saving}
                    className="mt-1 h-7 w-full min-w-0 border-b border-input bg-transparent text-sm font-medium outline-none focus:border-ring sm:w-64"
                    maxLength={100}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{teamInfo.team.name}</span>
                    {teamInfo.team.status === "locked" && (
                      <Lock className="size-3 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                )}
                {teamInfo.room && (
                  <div className="min-w-0 pt-1">
                    <p className="text-xs text-muted-foreground">Your room</p>
                    <p className="truncate text-sm font-medium">{teamInfo.room.name}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {teamInfo && canRenameTeam && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {!editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startEditing}
              >
                <Pencil className="size-3.5" />
                Rename team
              </Button>
            )}
            {canInviteTeamMembers && (
              <TeamInviteDialog
                teamId={teamInfo.team.id}
                hackathonId={hackathonId}
                teamName={teamInfo.team.name}
                maxTeamSize={maxTeamSize}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
