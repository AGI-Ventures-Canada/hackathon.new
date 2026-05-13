"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Download, Search, MoreHorizontal, UserCog, UserMinus, Users as UsersIcon, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { formatDate } from "@/lib/utils/format"
import { assertOk } from "@/lib/utils/fetch"
import { ROLE_LABEL, STATUS_LABEL, type Person, type PersonRole } from "@/lib/services/hackathon-people-types"

type PeopleTabClientProps = {
  hackathonId: string
  people: Person[]
  teams: { id: string; name: string }[]
  hackathonStatus: string | null
}

const emptySubscribe = () => () => {}
const UNASSIGNED = "__unassigned__"
const ROLES: PersonRole[] = ["participant", "judge", "mentor", "organizer"]
const LOCKED_STATUSES = new Set(["judging", "completed", "archived"])

function parsePendingId(id: string): { kind: "team" | "judge"; invitationId: string } | null {
  if (id.startsWith("team_invitation:")) return { kind: "team", invitationId: id.slice("team_invitation:".length) }
  if (id.startsWith("judge_invitation:")) return { kind: "judge", invitationId: id.slice("judge_invitation:".length) }
  return null
}

export function PeopleTabClient({ hackathonId, people: initialPeople, teams, hackathonStatus }: PeopleTabClientProps) {
  const router = useRouter()
  const [people, setPeople] = useState(initialPeople)
  const [query, setQuery] = useState("")
  const [removingPerson, setRemovingPerson] = useState<Person | null>(null)
  const [removing, setRemoving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionInfo, setActionInfo] = useState<string | null>(null)
  const [resendingIds, setResendingIds] = useState<Set<string>>(new Set())

  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const csvHref = useMemo(() => {
    const base = `/api/dashboard/hackathons/${hackathonId}/people.csv`
    if (!isClient) return base
    const today = new Date().toLocaleDateString("sv-SE")
    return `${base}?date=${today}`
  }, [hackathonId, isClient])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => {
      const haystack = [p.name ?? "", p.email ?? "", p.teamName ?? "", ROLE_LABEL[p.role]]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [people, query])

  const acceptedCount = people.filter((p) => p.status === "accepted").length
  const pendingCount = people.length - acceptedCount
  const isLocked = hackathonStatus ? LOCKED_STATUSES.has(hackathonStatus) : false

  function showError(message: string) {
    setActionError(message)
    setTimeout(() => setActionError(null), 8000)
  }

  function showInfo(message: string) {
    setActionInfo(message)
    setTimeout(() => setActionInfo(null), 5000)
  }

  async function handleAssignTeam(person: Person, nextTeamId: string | null) {
    if (person.teamId === nextTeamId) return
    const prev = people
    const nextTeamName = nextTeamId ? teams.find((t) => t.id === nextTeamId)?.name ?? null : null
    setPeople((cur) => cur.map((p) => (p.id === person.id ? { ...p, teamId: nextTeamId, teamName: nextTeamName, isCaptain: false } : p)))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/participants/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: nextTeamId }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setPeople(prev)
      showError(err instanceof Error ? err.message : "Failed to update team")
    }
  }

  async function handleChangeRole(person: Person, nextRole: PersonRole) {
    if (person.role === nextRole) return
    const prev = people
    const droppingFromTeam = person.role === "participant" && nextRole !== "participant"
    setPeople((cur) => cur.map((p) => (p.id === person.id
      ? { ...p, role: nextRole, teamId: droppingFromTeam ? null : p.teamId, teamName: droppingFromTeam ? null : p.teamName, isCaptain: droppingFromTeam ? false : p.isCaptain }
      : p)))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/participants/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setPeople(prev)
      showError(err instanceof Error ? err.message : "Failed to change role")
    }
  }

  async function handleRemoveFromEvent(person: Person) {
    setRemoving(true)
    const prev = people
    setPeople((cur) => cur.filter((p) => p.id !== person.id))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/participants/${person.id}`, {
        method: "DELETE",
      }).then(assertOk)
      setRemovingPerson(null)
      router.refresh()
    } catch (err) {
      setPeople(prev)
      showError(err instanceof Error ? err.message : "Failed to remove person")
    } finally {
      setRemoving(false)
    }
  }

  async function handleResendInvite(person: Person) {
    const parsed = parsePendingId(person.id)
    if (!parsed || parsed.kind !== "team") {
      showError("Only team invitations can be resent from here")
      return
    }
    if (!person.teamId) {
      showError("Missing team for invite")
      return
    }
    if (resendingIds.has(parsed.invitationId)) return
    setResendingIds((prev) => new Set(prev).add(parsed.invitationId))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${person.teamId}/invitations/${parsed.invitationId}/remind`, {
        method: "POST",
      }).then(assertOk)
      showInfo(`Reminder sent to ${person.email}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to resend invite")
    } finally {
      setResendingIds((prev) => {
        const next = new Set(prev)
        next.delete(parsed.invitationId)
        return next
      })
    }
  }

  async function handleCancelInvite(person: Person) {
    const parsed = parsePendingId(person.id)
    if (!parsed || parsed.kind !== "team") {
      showError("Only team invitations can be cancelled from here")
      return
    }
    if (!person.teamId) {
      showError("Missing team for invite")
      return
    }
    const prev = people
    setPeople((cur) => cur.filter((p) => p.id !== person.id))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${person.teamId}/invitations/${parsed.invitationId}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setPeople(prev)
      showError(err instanceof Error ? err.message : "Failed to cancel invite")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Everyone at this event</h2>
          <p className="text-sm text-muted-foreground">
            {acceptedCount} signed up · {pendingCount} invited
          </p>
        </div>
        <a href={csvHref} download className="self-start sm:self-auto">
          <Button variant="outline">
            <Download className="size-4" />
            Export CSV
          </Button>
        </a>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or team"
          className="pl-9"
          aria-label="Search people"
        />
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      {actionInfo && <p className="text-sm text-muted-foreground">{actionInfo}</p>}

      {people.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No one&apos;s signed up yet.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          No one matches that search.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Joined / Invited</TableHead>
                <TableHead className="w-10 sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const parsedPending = parsePendingId(p.id)
                const isAccepted = p.status === "accepted"
                const isTeamInvite = parsedPending?.kind === "team"
                const hasActions = isAccepted || isTeamInvite
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABEL[p.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "accepted" ? "default" : "outline"}>{STATUS_LABEL[p.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.teamName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span>{p.teamName}</span>
                          {p.isCaptain && (
                            <Badge variant="outline" className="text-xs">Captain</Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(p.joinedOrInvitedAt)}</TableCell>
                    <TableCell className="w-10">
                      {hasActions ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.name ?? p.email ?? "person"}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isAccepted && (
                              <>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger disabled={isLocked}>
                                    <UsersIcon className="size-4" />
                                    {p.teamId ? "Move team" : "Assign team"}
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {teams.length === 0 ? (
                                      <DropdownMenuItem disabled>No teams yet</DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuRadioGroup
                                        value={p.teamId ?? UNASSIGNED}
                                        onValueChange={(v) => handleAssignTeam(p, v === UNASSIGNED ? null : v)}
                                      >
                                        <DropdownMenuRadioItem value={UNASSIGNED}>No team</DropdownMenuRadioItem>
                                        {teams.map((t) => (
                                          <DropdownMenuRadioItem key={t.id} value={t.id}>{t.name}</DropdownMenuRadioItem>
                                        ))}
                                      </DropdownMenuRadioGroup>
                                    )}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger disabled={isLocked}>
                                    <UserCog className="size-4" />
                                    Change role
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                      Pick a role
                                    </DropdownMenuLabel>
                                    <DropdownMenuRadioGroup
                                      value={p.role}
                                      onValueChange={(v) => handleChangeRole(p, v as PersonRole)}
                                    >
                                      {ROLES.map((r) => (
                                        <DropdownMenuRadioItem key={r} value={r}>{ROLE_LABEL[r]}</DropdownMenuRadioItem>
                                      ))}
                                    </DropdownMenuRadioGroup>
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={isLocked}
                                  onSelect={() => {
                                    if (isLocked) {
                                      showError("People can't be removed once judging has started")
                                      return
                                    }
                                    setRemovingPerson(p)
                                  }}
                                >
                                  <UserMinus className="size-4" />
                                  Remove from event
                                </DropdownMenuItem>
                              </>
                            )}
                            {isTeamInvite && (() => {
                              const parsed = parsePendingId(p.id)
                              const invitationId = parsed?.kind === "team" ? parsed.invitationId : null
                              const isResending = invitationId ? resendingIds.has(invitationId) : false
                              return (
                              <>
                                <DropdownMenuItem
                                  disabled={isResending}
                                  onSelect={() => handleResendInvite(p)}
                                >
                                  <Send className="size-4" />
                                  {isResending ? "Sending…" : "Resend invite"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => handleCancelInvite(p)}>
                                  <X className="size-4" />
                                  Cancel invite
                                </DropdownMenuItem>
                              </>
                              )
                            })()}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!removingPerson} onOpenChange={(open) => { if (!open && !removing) setRemovingPerson(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removingPerson?.name ?? removingPerson?.email ?? "this person"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingPerson ? (
                <>
                  They&apos;ll be dropped from the event{removingPerson.teamName ? ` and removed from team ${removingPerson.teamName}` : ""}.
                  {removingPerson.isCaptain && " Another member will be promoted to captain."}
                  {" "}This can&apos;t be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep them</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (removingPerson) void handleRemoveFromEvent(removingPerson) }}
              disabled={removing}
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
