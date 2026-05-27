"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { assertOk, assertOkJson } from "@/lib/utils/fetch"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  Loader2, Plus, Users, ChevronRight, FileText, Crown, Mail, Settings2, MoreHorizontal, Pencil, Trash2, Bell, X, UserMinus, Check, Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { TeamSettingsDialog, teamSettingsSummary } from "@/components/hackathon/manage/team-settings-dialog"
import { TeamEditDialog } from "@/components/hackathon/manage/team-edit-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { getVideoEmbedInfo } from "@/lib/utils/video-embed"
import { getDisplayName } from "@/lib/utils/person-display"
import { SubmissionMedia } from "@/components/hackathon/submission-media"
import { SubmissionLinks } from "@/components/hackathon/submission-links"
import { DEFAULT_TEAM_STATUS, TEAM_STATUS_LABELS, type TeamStatus } from "@/lib/db/hackathon-types"

type TeamMember = {
  clerkUserId: string
  displayName: string | null
  email: string | null
  role: string
}

type TeamSubmission = {
  id: string
  title: string
  status: string
  description: string | null
  githubUrl: string | null
  liveAppUrl: string | null
  demoVideoUrl: string | null
  screenshotUrl: string | null
  screenshotUrls: string[]
  createdAt: string
}

type TeamPendingInvitation = {
  id: string
  email: string
  isCaptainInvite: boolean
  createdAt: string
  remindedAt: string | null
}

type Team = {
  id: string
  name: string
  status: TeamStatus
  mode: "in_person" | "virtual" | null
  captainClerkUserId: string | null
  pendingCaptainEmail: string | null
  pendingCaptainInvitationId: string | null
  pendingCaptainRemindedAt: string | null
  pendingInvitations: TeamPendingInvitation[]
  members: TeamMember[]
  submission: TeamSubmission | null
  room: { id: string; name: string } | null
}

type ReviewTeamResponse = {
  success: true
  team: { id: string; name: string; status: TeamStatus }
  membersUnassigned?: number
  invitesCancelled?: number
  membersNotified?: number
}

function getTeamMemberName(member: TeamMember): string {
  return getDisplayName({
    name: member.displayName,
    email: member.email,
    fallback: "Unknown member",
  })
}

function TeamSubmissionPanel({ submission }: { submission: TeamSubmission }) {
  const videoEmbed = submission.demoVideoUrl
    ? getVideoEmbedInfo(submission.demoVideoUrl)
    : null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold leading-tight">{submission.title}</h3>
        {submission.description && (
          <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">
            {submission.description}
          </p>
        )}
      </div>
      <SubmissionMedia
        title={submission.title}
        video={videoEmbed}
        screenshotUrl={submission.screenshotUrl}
        screenshotUrls={submission.screenshotUrls}
      />
      <SubmissionLinks
        githubUrl={submission.githubUrl}
        liveAppUrl={submission.liveAppUrl}
        demoVideoUrl={submission.demoVideoUrl}
        hasEmbeddedVideo={videoEmbed !== null}
      />
    </div>
  )
}

type TeamsTabProps = {
  hackathonId: string
  maxTeamSize: number
  minTeamSize: number
  allowSolo: boolean
  requireTeamApproval: boolean
  hackathonStatus: string | null
}

const STATUS_LOCKS_TEAM_DELETE = new Set(["judging", "completed", "archived"])

const UNASSIGNED_ROOM = "__unassigned__"

export function TeamsTab({ hackathonId, maxTeamSize: initialMax, minTeamSize: initialMin, allowSolo: initialSolo, requireTeamApproval: initialApproval, hackathonStatus }: TeamsTabProps) {
  const router = useRouter()
  const ctx = useActionItemsOptional()
  const [teams, setTeams] = useState<Team[]>([])
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [teamName, setTeamName] = useState("")
  const [captainEmail, setCaptainEmail] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const tempIdCounter = useRef(0)
  const denySnapshotsRef = useRef(new Map<string, Team[]>())
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [denyingTeam, setDenyingTeam] = useState<Team | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reinviteTarget, setReinviteTarget] = useState<{ team: Team; invitationId: string; previousEmail: string } | null>(null)
  const [reinviteEmail, setReinviteEmail] = useState("")
  const [reinviteBusy, setReinviteBusy] = useState(false)
  const [reinviteError, setReinviteError] = useState<string | null>(null)
  const [remindError, setRemindError] = useState<string | null>(null)
  const [remindPendingIds, setRemindPendingIds] = useState<Set<string>>(new Set())
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!ctx) return
    ctx.registerTabAction("review-team-settings", () => setSettingsDialogOpen(true))
    return () => ctx.unregisterTabAction("review-team-settings")
  }, [ctx])

  useEffect(() => () => denySnapshotsRef.current.clear(), [])

  async function fetchTeams() {
    try {
      setLoading(true)
      setError(null)
      const [teamsRes, roomsRes] = await Promise.all([
        fetch(`/api/dashboard/hackathons/${hackathonId}/teams`),
        fetch(`/api/dashboard/hackathons/${hackathonId}/rooms`),
      ])
      if (!teamsRes.ok) {
        const data = await teamsRes.json().catch(() => ({}))
        throw new Error(data.error || "Failed to fetch teams")
      }
      const teamsData = await teamsRes.json()
      setTeams(teamsData.teams ?? [])
      if (roomsRes.ok) {
        const roomsData = await roomsRes.json()
        setRooms((roomsData.rooms ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch teams")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeams()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchTeams recreates on every render; hackathonId is the real trigger
  }, [hackathonId])

  useEffect(() => {
    async function refreshRooms() {
      try {
        const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/rooms`)
        if (!res.ok) return
        const data = await res.json()
        const next = (data.rooms ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }))
        setRooms(next)
        const validIds = new Set(next.map((r: { id: string }) => r.id))
        setTeams((prev) =>
          prev.map((t) => (t.room && !validIds.has(t.room.id) ? { ...t, room: null } : t))
        )
      } catch {}
    }
    document.addEventListener("rooms-changed", refreshRooms)
    return () => document.removeEventListener("rooms-changed", refreshRooms)
  }, [hackathonId])

  async function handleAssignRoom(teamId: string, newRoomId: string | null) {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return
    const previousRoom = team.room
    const previousRoomId = previousRoom?.id ?? null
    if (previousRoomId === newRoomId) return

    const newRoom = newRoomId ? rooms.find((r) => r.id === newRoomId) ?? null : null
    setRoomError(null)
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, room: newRoom } : t)))

    try {
      if (previousRoomId) {
        await fetch(
          `/api/dashboard/hackathons/${hackathonId}/rooms/${previousRoomId}/teams/${teamId}`,
          { method: "DELETE" },
        ).then(assertOk)
      }
      if (newRoomId) {
        await fetch(`/api/dashboard/hackathons/${hackathonId}/rooms/${newRoomId}/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        }).then(assertOk)
      }
    } catch (err) {
      setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, room: previousRoom } : t)))
      setRoomError(err instanceof Error ? err.message : "Failed to update room")
      setTimeout(() => setRoomError(null), 8000)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void handleCreate(e as unknown as React.FormEvent)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!teamName.trim() || !captainEmail.trim()) {
      setCreateError("Both fields are required")
      return
    }

    const name = teamName.trim()
    const email = captainEmail.trim()
    const tempId = `temp-${++tempIdCounter.current}`

    setCreateError(null)
    setDialogOpen(false)
    setTeamName("")
    setCaptainEmail("")

    const tempTeam: Team = {
      id: tempId,
      name,
      status: "forming",
      mode: null,
      captainClerkUserId: null,
      pendingCaptainEmail: email,
      pendingCaptainInvitationId: null,
      pendingCaptainRemindedAt: null,
      pendingInvitations: [],
      members: [],
      submission: null,
      room: null,
    }
    setTeams((prev) => [tempTeam, ...prev])

    try {
      const data = await fetch(`/api/dashboard/hackathons/${hackathonId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, captainEmail: email }),
      }).then(assertOkJson<{ team?: Team; invited?: boolean; queued?: boolean }>)

      if (data.invited) {
        setInviteSuccess(
          data.queued
            ? `Invite saved for ${email}. We'll send it when you go live.`
            : `Invite sent to ${email}`
        )
        setTimeout(() => setInviteSuccess(null), 5000)
      }

      await fetchTeams()
      router.refresh()
    } catch (err) {
      setTeams((prev) => prev.filter((t) => t.id !== tempId))
      setTeamName(name)
      setCaptainEmail(email)
      setCreateError(err instanceof Error ? err.message : "Failed to create team")
      setDialogOpen(true)
    }
  }

  function showActionError(message: string) {
    setActionError(message)
    setTimeout(() => setActionError(null), 8000)
  }

  function showActionSuccess(message: string) {
    setActionSuccess(message)
    setTimeout(() => setActionSuccess(null), 5000)
  }

  function formatActionSuccess(action: string, details: Array<string | null>): string {
    const visibleDetails = details.filter((detail): detail is string => Boolean(detail))
    return visibleDetails.length ? `${action}. ${visibleDetails.join(", ")}.` : `${action}.`
  }

  function notifiedText(count: number | undefined): string | null {
    const safeCount = count ?? 0
    if (safeCount <= 0) return null
    return `${safeCount} member${safeCount === 1 ? "" : "s"} notified`
  }

  function countText(count: number | undefined, singular: string, plural: string): string | null {
    const safeCount = count ?? 0
    if (safeCount <= 0) return null
    return `${safeCount} ${safeCount === 1 ? singular : plural}`
  }

  const { execute: approveTeam, error: approveError } = useOptimisticMutation<Team, ReviewTeamResponse>({
    fn: (team) =>
      fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${team.id}/approve`, {
        method: "POST",
      }).then(assertOkJson<ReviewTeamResponse>),
    onOptimistic: (team) => {
      setActionSuccess(null)
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, status: DEFAULT_TEAM_STATUS } : t)))
    },
    onRevert: (team) => {
      setTeams((prev) => prev.map((t) => (t.id === team.id ? team : t)))
    },
    onSuccess: (response, team) => {
      setTeams((prev) =>
        prev.map((t) => (t.id === team.id ? { ...t, name: response.team.name, status: response.team.status } : t))
      )
      showActionSuccess(formatActionSuccess(`Approved ${response.team.name}`, [notifiedText(response.membersNotified)]))
    },
  })

  const { execute: denyTeam, error: denyError } = useOptimisticMutation<Team, ReviewTeamResponse>({
    fn: (team) =>
      fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${team.id}/deny`, {
        method: "POST",
      }).then(assertOkJson<ReviewTeamResponse>),
    onOptimistic: (team) => {
      setActionSuccess(null)
      setTeams((prev) => {
        denySnapshotsRef.current.set(team.id, prev)
        return prev.filter((t) => t.id !== team.id)
      })
      setDenyingTeam(null)
    },
    onRevert: (team) => {
      const snapshot = denySnapshotsRef.current.get(team.id)
      if (snapshot) {
        setTeams(snapshot)
      } else {
        setTeams((prev) => prev.some((t) => t.id === team.id) ? prev : [...prev, team])
      }
      denySnapshotsRef.current.delete(team.id)
    },
    onSuccess: (_response, team) => {
      denySnapshotsRef.current.delete(team.id)
      showActionSuccess(
        formatActionSuccess(`Denied ${team.name}`, [
          countText(_response.membersUnassigned, "member moved", "members moved"),
          countText(_response.invitesCancelled, "invite canceled", "invites canceled"),
          notifiedText(_response.membersNotified),
        ])
      )
    },
  })

  function deleteBlockReason(team: Team): string | null {
    if (hackathonStatus && STATUS_LOCKS_TEAM_DELETE.has(hackathonStatus)) {
      return "Teams can't be deleted once judging has started"
    }
    if (team.submission) return "This team has a submission. Delete the submission first."
    return null
  }

  async function handleDeleteTeam(team: Team) {
    setDeleting(true)
    const snapshot = teams
    setTeams((prev) => prev.filter((t) => t.id !== team.id))
    setDeletingTeam(null)
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${team.id}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setTeams(snapshot)
      showActionError(err instanceof Error ? err.message : "Failed to delete team")
    } finally {
      setDeleting(false)
    }
  }

  async function handleRemoveMember(team: Team, member: TeamMember) {
    const snapshotMembers = team.members
    const snapshotCaptain = team.captainClerkUserId
    const nextMembers = team.members.filter((m) => m.clerkUserId !== member.clerkUserId)
    const removedCaptain = team.captainClerkUserId === member.clerkUserId
    setTeams((prev) => prev.map((t) => (t.id === team.id ? {
      ...t,
      members: nextMembers,
      captainClerkUserId: removedCaptain ? null : t.captainClerkUserId,
    } : t)))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${team.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: [member.clerkUserId] }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setTeams((prev) => prev.map((t) => (t.id === team.id ? {
        ...t,
        members: snapshotMembers,
        captainClerkUserId: snapshotCaptain,
      } : t)))
      showActionError(err instanceof Error ? err.message : "Failed to remove member")
    }
  }

  async function handleMakeCaptain(team: Team, member: TeamMember) {
    const previous = team.captainClerkUserId
    setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, captainClerkUserId: member.clerkUserId } : t)))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captainClerkUserId: member.clerkUserId }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, captainClerkUserId: previous } : t)))
      showActionError(err instanceof Error ? err.message : "Failed to change captain")
    }
  }

  function showRemindError(message: string) {
    setRemindError(message)
    setTimeout(() => setRemindError(null), 8000)
  }

  async function handleResendInvite(team: Team, invitationId: string) {
    if (remindPendingIds.has(invitationId)) return
    const now = new Date().toISOString()
    const wasCaptainInvite = team.pendingCaptainInvitationId === invitationId
    let snapshot: { pendingInvitations: TeamPendingInvitation[]; pendingCaptainRemindedAt: string | null } | null = null
    setRemindPendingIds((prev) => new Set(prev).add(invitationId))
    setTeams((prev) => prev.map((t) => {
      if (t.id !== team.id) return t
      snapshot = {
        pendingInvitations: t.pendingInvitations,
        pendingCaptainRemindedAt: t.pendingCaptainRemindedAt,
      }
      return {
        ...t,
        pendingCaptainRemindedAt: wasCaptainInvite ? now : t.pendingCaptainRemindedAt,
        pendingInvitations: t.pendingInvitations.map((inv) =>
          inv.id === invitationId ? { ...inv, remindedAt: now } : inv,
        ),
      }
    }))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${team.id}/invitations/${invitationId}/remind`, {
        method: "POST",
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      if (snapshot) {
        const { pendingInvitations, pendingCaptainRemindedAt } = snapshot
        setTeams((prev) => prev.map((t) => (
          t.id === team.id ? { ...t, pendingInvitations, pendingCaptainRemindedAt } : t
        )))
      }
      showRemindError(err instanceof Error ? err.message : "Failed to send reminder")
    } finally {
      setRemindPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(invitationId)
        return next
      })
    }
  }

  async function handleCancelInvite(team: Team, invitationId: string) {
    const wasCaptainInvite = team.pendingCaptainInvitationId === invitationId
    const snapshot = teams
    setTeams((prev) => prev.map((t) => {
      if (t.id !== team.id) return t
      return {
        ...t,
        pendingInvitations: t.pendingInvitations.filter((i) => i.id !== invitationId),
        pendingCaptainEmail: wasCaptainInvite ? null : t.pendingCaptainEmail,
        pendingCaptainInvitationId: wasCaptainInvite ? null : t.pendingCaptainInvitationId,
      }
    }))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${team.id}/invitations/${invitationId}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setTeams(snapshot)
      showActionError(err instanceof Error ? err.message : "Failed to cancel invite")
    }
  }

  async function handleChangeCaptainInviteEmail() {
    if (!reinviteTarget) return
    const email = reinviteEmail.trim().toLowerCase()
    if (!email) {
      setReinviteError("Email is required")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setReinviteError("Enter a valid email address")
      return
    }
    if (email === reinviteTarget.previousEmail.toLowerCase()) {
      setReinviteError("That's the same email")
      return
    }
    const targetTeamId = reinviteTarget.team.id
    const snapshot = teams
    setTeams((prev) => prev.map((t) => (t.id === targetTeamId ? { ...t, pendingCaptainEmail: email } : t)))
    setReinviteTarget(null)
    setReinviteEmail("")
    setReinviteBusy(true)
    setReinviteError(null)
    try {
      const data = await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${targetTeamId}/captain-invitation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then(assertOkJson<{ queued?: boolean }>)
      setInviteSuccess(
        data.queued
          ? `Invite saved for ${email}. We'll send it when you go live.`
          : `Invite sent to ${email}`
      )
      setTimeout(() => setInviteSuccess(null), 5000)
      await fetchTeams()
      router.refresh()
    } catch (err) {
      setTeams(snapshot)
      showActionError(err instanceof Error ? err.message : "Failed to update invite")
    } finally {
      setReinviteBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border p-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchTeams()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => setSettingsDialogOpen(true)}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-muted-foreground" />
          <span className="text-sm">{teamSettingsSummary({ minTeamSize: initialMin, maxTeamSize: initialMax, allowSolo: initialSolo, requireTeamApproval: initialApproval })}</span>
        </div>
        <span className="text-sm text-muted-foreground">Edit</span>
      </button>
      <TeamSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        hackathonId={hackathonId}
        initialData={{ minTeamSize: initialMin, maxTeamSize: initialMax, allowSolo: initialSolo, requireTeamApproval: initialApproval }}
      />

      {inviteSuccess && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <Mail className="size-4 text-muted-foreground" />
          {inviteSuccess}
        </div>
      )}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <Check className="size-4 text-muted-foreground" />
          {actionSuccess}
        </div>
      )}
      {roomError && <p className="text-sm text-destructive">{roomError}</p>}
      {(actionError || remindError || approveError || denyError) && (
        <p className="text-sm text-destructive">
          {[actionError, remindError, approveError, denyError].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {teams.length === 0
            ? "No teams yet"
            : (() => {
                const submittedCount = teams.filter((t) => t.submission).length
                const pendingCount = teams.filter((t) => t.status === "pending_approval").length
                return `${teams.length} team${teams.length === 1 ? "" : "s"} · ${submittedCount} submitted${pendingCount > 0 ? ` · ${pendingCount} waiting` : ""}`
              })()}
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Create Team</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Team</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleCreate}
              onKeyDown={handleKeyDown}
              className="space-y-4"
              autoComplete="off"
            >
              <div className="space-y-2">
                <label htmlFor="team-name" className="text-xs font-medium">
                  Team Name
                </label>
                <Input
                  id="team-name"
                  name="team-name"
                  type="text"
                  placeholder="Awesome Team"
                  value={teamName}
                  onChange={(e) => {
                    setTeamName(e.target.value)
                    setCreateError(null)
                  }}
                  required
                  autoFocus
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="captain-email" className="text-xs font-medium">
                  Captain Email
                </label>
                <Input
                  id="captain-email"
                  name="captain-email"
                  type="email"
                  placeholder="captain@example.com"
                  value={captainEmail}
                  onChange={(e) => {
                    setCaptainEmail(e.target.value)
                    setCreateError(null)
                  }}
                  required
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
              {createError && <p className="text-destructive text-sm">{createError}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  Create Team
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {editingTeam && (
        <TeamEditDialog
          open
          onOpenChange={(open) => { if (!open) setEditingTeam(null) }}
          hackathonId={hackathonId}
          teamId={editingTeam.id}
          initial={{ name: editingTeam.name, mode: editingTeam.mode, captainClerkUserId: editingTeam.captainClerkUserId }}
          members={editingTeam.members.map((m) => ({ clerkUserId: m.clerkUserId, displayName: m.displayName, email: m.email }))}
          onSaved={(next) => {
            setTeams((prev) => prev.map((t) => (t.id === editingTeam.id ? {
              ...t,
              name: next.name,
              mode: next.mode,
              captainClerkUserId: next.captainClerkUserId,
            } : t)))
          }}
        />
      )}

      <AlertDialog open={!!deletingTeam} onOpenChange={(open) => { if (!open && !deleting) setDeletingTeam(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team &quot;{deletingTeam?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingTeam ? (
                <>
                  {deletingTeam.members.length > 0 && (
                    <>{deletingTeam.members.length} member{deletingTeam.members.length === 1 ? "" : "s"} will be unassigned but stay registered. </>
                  )}
                  {deletingTeam.pendingInvitations.length > 0 && (
                    <>{deletingTeam.pendingInvitations.length} pending invite{deletingTeam.pendingInvitations.length === 1 ? "" : "s"} will be cancelled. </>
                  )}
                  {deletingTeam.room && <>The room will be unassigned. </>}
                  This can&apos;t be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep team</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deletingTeam) void handleDeleteTeam(deletingTeam) }}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!denyingTeam} onOpenChange={(open) => { if (!open) setDenyingTeam(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deny team &quot;{denyingTeam?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll go back to no team and can join or start another. Pending invites will be canceled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep team</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (denyingTeam) void denyTeam(denyingTeam) }}
            >
              Deny team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!reinviteTarget} onOpenChange={(open) => { if (!open && !reinviteBusy) setReinviteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change captain invite email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cancels the invite for {reinviteTarget?.previousEmail} and sends a new one.
            </p>
            <Input
              type="email"
              placeholder="captain@example.com"
              autoFocus
              value={reinviteEmail}
              onChange={(e) => { setReinviteEmail(e.target.value); setReinviteError(null) }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault()
                  void handleChangeCaptainInviteEmail()
                }
              }}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
            {reinviteError && <p className="text-sm text-destructive">{reinviteError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReinviteTarget(null)} disabled={reinviteBusy}>Cancel</Button>
              <Button onClick={() => void handleChangeCaptainInviteEmail()} disabled={reinviteBusy}>
                {reinviteBusy ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {teams.length > 0 && (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Submission</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead className="w-10 sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => {
                  const isExpanded = expandedId === team.id
                  return (
                    <Fragment key={team.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedId(isExpanded ? null : team.id)}
                      >
                        <TableCell className="w-8 pr-0">
                          <ChevronRight className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-90",
                          )} />
                        </TableCell>
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {TEAM_STATUS_LABELS[team.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {team.members.length === 0 && team.pendingCaptainEmail
                              ? "0 (invited)"
                              : team.members.length}
                          </span>
                        </TableCell>
                        <TableCell>
                          {team.submission ? (
                            <Badge variant="secondary" className="font-normal">
                              {team.submission.status}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {rooms.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <Select
                              value={team.room?.id ?? UNASSIGNED_ROOM}
                              onValueChange={(value) =>
                                handleAssignRoom(team.id, value === UNASSIGNED_ROOM ? null : value)
                              }
                            >
                              <SelectTrigger size="sm" className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNASSIGNED_ROOM}>Unassigned</SelectItem>
                                {rooms.map((room) => (
                                  <SelectItem key={room.id} value={room.id}>
                                    {room.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          {team.id.startsWith("temp-") ? null : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" aria-label={`Team actions for ${team.name}`}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {team.status === "pending_approval" && (
                                  <>
                                    <DropdownMenuItem onSelect={() => { void approveTeam(team) }}>
                                      <Check className="size-4" />
                                      Approve team
                                    </DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" onSelect={() => setDenyingTeam(team)}>
                                      <Ban className="size-4" />
                                      Deny team
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem onSelect={() => setEditingTeam(team)}>
                                  <Pencil className="size-4" />
                                  Edit team
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={!!deleteBlockReason(team)}
                                  onSelect={() => {
                                    const reason = deleteBlockReason(team)
                                    if (reason) {
                                      showActionError(reason)
                                      return
                                    }
                                    setDeletingTeam(team)
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                  Delete team
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={6} className="py-4">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                              <div className="space-y-4">
                                <section className="space-y-2">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Users className="size-3" />
                                    Members
                                  </div>
                                  <div className="rounded-md border bg-background p-3">
                                    {(() => {
                                      const captainInvitationId = team.pendingCaptainInvitationId
                                      const captainEmail = team.pendingCaptainEmail
                                      if (!captainInvitationId || !captainEmail) return null
                                      return (
                                        <div className="flex items-center gap-2 text-sm">
                                          <Mail className="size-3 text-muted-foreground shrink-0" />
                                          <span className="min-w-0 flex-1 break-all text-muted-foreground">{captainEmail}</span>
                                          {team.pendingCaptainRemindedAt ? (
                                            <Badge variant="secondary" className="shrink-0 font-normal">
                                              <Bell className="mr-1 size-3" />
                                              Reminded
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary" className="shrink-0 font-normal">Pending</Badge>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-6"
                                            aria-label={`Send reminder to ${captainEmail}`}
                                            title="Send reminder"
                                            disabled={remindPendingIds.has(captainInvitationId)}
                                            onClick={() => handleResendInvite(team, captainInvitationId)}
                                          >
                                            <Bell className="size-3.5" />
                                          </Button>
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button variant="ghost" size="icon" className="size-6" aria-label="Captain invite actions">
                                                <MoreHorizontal className="size-3.5" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              <DropdownMenuItem onSelect={() => {
                                                setReinviteTarget({ team, invitationId: captainInvitationId, previousEmail: captainEmail })
                                                setReinviteEmail("")
                                                setReinviteError(null)
                                              }}>
                                                <Pencil className="size-4" />
                                                Change email
                                              </DropdownMenuItem>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem variant="destructive" onSelect={() => handleCancelInvite(team, captainInvitationId)}>
                                                <X className="size-4" />
                                                Cancel invite
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      )
                                    })()}
                                    {team.members.length === 0 && !team.pendingCaptainEmail ? (
                                      <p className="text-sm text-muted-foreground">No members yet</p>
                                    ) : (
                                      <ul className="flex flex-col gap-1.5">
                                        {team.members.map((m) => {
                                          const isCaptain = m.clerkUserId === team.captainClerkUserId
                                          const memberName = getTeamMemberName(m)
                                          return (
                                            <li key={m.clerkUserId} className="flex items-start gap-2 text-sm">
                                              {isCaptain ? (
                                                <Crown className="mt-1 size-3 shrink-0 text-primary" />
                                              ) : (
                                                <span className="size-3 shrink-0" />
                                              )}
                                              <span className="min-w-0 flex-1">
                                                <span className="block font-medium break-words">{memberName}</span>
                                                {m.email && (
                                                  <span className="block text-xs text-muted-foreground break-all">
                                                    {m.email}
                                                  </span>
                                                )}
                                              </span>
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`Actions for ${memberName}`}>
                                                    <MoreHorizontal className="size-3.5" />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                  {!isCaptain && (
                                                    <DropdownMenuItem onSelect={() => handleMakeCaptain(team, m)}>
                                                      <Crown className="size-4" />
                                                      Make captain
                                                    </DropdownMenuItem>
                                                  )}
                                                  <DropdownMenuItem
                                                    variant="destructive"
                                                    onSelect={() => handleRemoveMember(team, m)}
                                                  >
                                                    <UserMinus className="size-4" />
                                                    Remove from team
                                                  </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </li>
                                          )
                                        })}
                                      </ul>
                                    )}
                                    {team.pendingInvitations.filter((i) => !i.isCaptainInvite).length > 0 && (
                                      <ul className="mt-2 flex flex-col gap-1.5 border-t pt-2">
                                        {team.pendingInvitations.filter((i) => !i.isCaptainInvite).map((inv) => (
                                          <li key={inv.id} className="flex items-center gap-2 text-sm">
                                            <Mail className="size-3 text-muted-foreground shrink-0" />
                                            <span className="min-w-0 flex-1 break-all text-muted-foreground">{inv.email}</span>
                                            {inv.remindedAt ? (
                                              <Badge variant="secondary" className="shrink-0 font-normal">
                                                <Bell className="mr-1 size-3" />
                                                Reminded
                                              </Badge>
                                            ) : (
                                              <Badge variant="secondary" className="shrink-0 font-normal">Pending</Badge>
                                            )}
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="size-6"
                                              aria-label={`Send reminder to ${inv.email}`}
                                              title="Send reminder"
                                              disabled={remindPendingIds.has(inv.id)}
                                              onClick={() => handleResendInvite(team, inv.id)}
                                            >
                                              <Bell className="size-3.5" />
                                            </Button>
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="size-6" aria-label={`Invite actions for ${inv.email}`}>
                                                  <MoreHorizontal className="size-3.5" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem variant="destructive" onSelect={() => handleCancelInvite(team, inv.id)}>
                                                  <X className="size-4" />
                                                  Cancel invite
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </section>

                              </div>

                              <section className="space-y-2">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  <FileText className="size-3" />
                                  Submission
                                </div>
                                {team.submission ? (
                                  <div className="rounded-md border bg-background p-4">
                                    <TeamSubmissionPanel submission={team.submission} />
                                  </div>
                                ) : (
                                  <div className="rounded-md border border-dashed bg-background/50 px-4 py-6 text-center">
                                    <p className="text-sm text-muted-foreground">No submission yet</p>
                                  </div>
                                )}
                              </section>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
