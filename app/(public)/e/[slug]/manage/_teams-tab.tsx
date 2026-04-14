"use client"

import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, Plus, Users, ChevronRight, FileText, DoorOpen, Crown, Mail, Settings2,
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
import { Input } from "@/components/ui/input"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { TeamSettingsDialog, teamSettingsSummary } from "@/components/hackathon/manage/team-settings-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { extractYouTubeVideoId } from "@/lib/utils/youtube"
import { YouTubeEmbed } from "@/components/hackathon/youtube-embed"
import { SubmissionLinks } from "@/components/hackathon/submission-links"

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
  createdAt: string
}

type Team = {
  id: string
  name: string
  status: string
  captainClerkUserId: string | null
  pendingCaptainEmail: string | null
  members: TeamMember[]
  submission: TeamSubmission | null
  room: { id: string; name: string } | null
}

function TeamSubmissionPanel({ submission }: { submission: TeamSubmission }) {
  const youtubeVideoId = submission.demoVideoUrl
    ? extractYouTubeVideoId(submission.demoVideoUrl)
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
      {submission.screenshotUrl && (
        <div className="rounded-md overflow-hidden border bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={submission.screenshotUrl}
            alt={`Screenshot of ${submission.title}`}
            className="w-full h-auto max-h-80 object-contain"
          />
        </div>
      )}
      {youtubeVideoId && <YouTubeEmbed videoId={youtubeVideoId} />}
      <SubmissionLinks
        githubUrl={submission.githubUrl}
        liveAppUrl={submission.liveAppUrl}
        demoVideoUrl={submission.demoVideoUrl}
        isYouTube={youtubeVideoId !== null}
      />
    </div>
  )
}

type TeamsTabProps = {
  hackathonId: string
  maxTeamSize: number
  minTeamSize: number
  allowSolo: boolean
}

export function TeamsTab({ hackathonId, maxTeamSize: initialMax, minTeamSize: initialMin, allowSolo: initialSolo }: TeamsTabProps) {
  const router = useRouter()
  const ctx = useActionItemsOptional()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [teamName, setTeamName] = useState("")
  const [captainEmail, setCaptainEmail] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!ctx) return
    ctx.registerTabAction("review-team-settings", () => setSettingsDialogOpen(true))
    return () => ctx.unregisterTabAction("review-team-settings")
  }, [ctx])

  async function fetchTeams() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/teams`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to fetch teams")
      }
      const data = await res.json()
      setTeams(data.teams ?? [])
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !creating) {
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

    setCreating(true)
    setCreateError(null)

    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: teamName.trim(),
          captainEmail: captainEmail.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create team")
      }

      const data = await res.json()

      setDialogOpen(false)
      setTeamName("")
      setCaptainEmail("")
      setCreateError(null)

      if (data.invited) {
        setInviteSuccess(`Invite sent to ${captainEmail.trim()}`)
        setTimeout(() => setInviteSuccess(null), 5000)
      }

      await fetchTeams()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create team")
    } finally {
      setCreating(false)
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
          <span className="text-sm">{teamSettingsSummary({ minTeamSize: initialMin, maxTeamSize: initialMax, allowSolo: initialSolo })}</span>
        </div>
        <span className="text-sm text-muted-foreground">Edit</span>
      </button>
      <TeamSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        hackathonId={hackathonId}
        initialData={{ minTeamSize: initialMin, maxTeamSize: initialMax, allowSolo: initialSolo }}
      />

      {inviteSuccess && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          <Mail className="size-4 text-muted-foreground" />
          {inviteSuccess}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {teams.length === 0
            ? "No teams yet"
            : (() => {
                const submittedCount = teams.filter((t) => t.submission).length
                return `${teams.length} team${teams.length === 1 ? "" : "s"} · ${submittedCount} submitted`
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
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Team"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                            {team.status}
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
                        <TableCell>
                          {team.room ? (
                            <span>{team.room.name}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={5} className="py-4">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                              <div className="space-y-4">
                                <section className="space-y-2">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Users className="size-3" />
                                    Members
                                  </div>
                                  <div className="rounded-md border bg-background p-3">
                                    {team.pendingCaptainEmail && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <Mail className="size-3 text-muted-foreground shrink-0" />
                                        <span className="text-muted-foreground truncate">{team.pendingCaptainEmail}</span>
                                        <Badge variant="secondary" className="ml-auto font-normal">Pending</Badge>
                                      </div>
                                    )}
                                    {team.members.length === 0 && !team.pendingCaptainEmail ? (
                                      <p className="text-sm text-muted-foreground">No members yet</p>
                                    ) : (
                                      <ul className="flex flex-col gap-1.5">
                                        {team.members.map((m) => (
                                          <li key={m.clerkUserId} className="flex items-center gap-2 text-sm">
                                            {m.clerkUserId === team.captainClerkUserId ? (
                                              <Crown className="size-3 text-primary shrink-0" />
                                            ) : (
                                              <span className="size-3 shrink-0" />
                                            )}
                                            <span className="font-medium">{m.displayName || m.clerkUserId}</span>
                                            {m.email && (
                                              <span className="text-muted-foreground text-xs truncate">
                                                {m.email}
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </section>

                                {team.room && (
                                  <section className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      <DoorOpen className="size-3" />
                                      Room
                                    </div>
                                    <div className="rounded-md border bg-background px-3 py-2">
                                      <p className="text-sm font-medium">{team.room.name}</p>
                                    </div>
                                  </section>
                                )}
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
