"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { useOptimisticList } from "@/hooks/use-optimistic-list"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { Bell, Download, Search, MoreHorizontal, UserCog, UserMinus, Users as UsersIcon, X } from "lucide-react"
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
  const list = useOptimisticList({ items: initialPeople, getId: (p) => p.id })
  const people = list.visibleItems
  const [query, setQuery] = useState("")
  const [removingPerson, setRemovingPerson] = useState<Person | null>(null)
  const [removing, setRemoving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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

  async function handleAssignTeam(person: Person, nextTeamId: string | null) {
    if (person.teamId === nextTeamId) return
    const nextTeamName = nextTeamId ? teams.find((t) => t.id === nextTeamId)?.name ?? null : null
    list.setLocalEdit(person.id, { teamId: nextTeamId, teamName: nextTeamName, isCaptain: false })
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/participants/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: nextTeamId }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      list.clearLocalEdit(person.id)
      showError(err instanceof Error ? err.message : "Failed to update team")
    }
  }

  async function handleChangeRole(person: Person, nextRole: PersonRole) {
    if (person.role === nextRole) return
    const droppingFromTeam = person.role === "participant" && nextRole !== "participant"
    const patch: Partial<Person> = droppingFromTeam
      ? { role: nextRole, teamId: null, teamName: null, isCaptain: false }
      : { role: nextRole }
    list.setLocalEdit(person.id, patch)
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/participants/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      list.clearLocalEdit(person.id)
      showError(err instanceof Error ? err.message : "Failed to change role")
    }
  }

  async function handleRemoveFromEvent(person: Person) {
    setRemoving(true)
    list.hideItem(person.id)
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/participants/${person.id}`, {
        method: "DELETE",
      }).then(assertOk)
      setRemovingPerson(null)
      router.refresh()
    } catch (err) {
      list.unhideItem(person.id)
      showError(err instanceof Error ? err.message : "Failed to remove person")
    } finally {
      setRemoving(false)
    }
  }

  const { execute: handleRemind, isPending: remindPending, error: remindError } = useOptimisticMutation({
    fn: async (person: Person) => {
      const parsed = parsePendingId(person.id)
      if (!parsed) throw new Error("This row has no invitation to remind")
      if (parsed.kind === "team") {
        if (!person.teamId) throw new Error("Missing team for invite")
        await fetch(
          `/api/dashboard/hackathons/${hackathonId}/teams/${person.teamId}/invitations/${parsed.invitationId}/remind`,
          { method: "POST" },
        ).then(assertOk)
        return
      }
      await fetch(
        `/api/dashboard/hackathons/${hackathonId}/judging/invitations/${parsed.invitationId}/remind`,
        { method: "POST" },
      ).then(assertOk)
    },
    onOptimistic: (person) =>
      list.setLocalEdit(person.id, { remindedAt: new Date().toISOString() }),
    onRevert: (person) => list.clearLocalEdit(person.id),
  })

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
    list.hideItem(person.id)
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/teams/${person.teamId}/invitations/${parsed.invitationId}`, {
        method: "DELETE",
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      list.unhideItem(person.id)
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

      {(actionError || remindError) && (
        <p className="text-sm text-destructive">
          {[actionError, remindError].filter(Boolean).join(" · ")}
        </p>
      )}

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
                const isPending = p.status === "pending"
                const isTeamInvite = parsedPending?.kind === "team"
                const isReminded = isPending && !!p.remindedAt
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
                      {isReminded ? (
                        <Badge variant="secondary">
                          <Bell className="mr-1 size-3" />
                          Reminded
                        </Badge>
                      ) : (
                        <Badge variant={isAccepted ? "default" : "outline"}>{STATUS_LABEL[p.status]}</Badge>
                      )}
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
                      <div className="flex items-center justify-end gap-1">
                        {isPending && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Send reminder to ${p.email ?? "invitee"}`}
                            title="Send reminder"
                            disabled={remindPending}
                            onClick={() => handleRemind(p)}
                          >
                            <Bell className="size-4" />
                          </Button>
                        )}
                        {isAccepted && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.name ?? p.email ?? "person"}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {p.role === "participant" && (
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
                              )}
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
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {isTeamInvite && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.email ?? "invitee"}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem variant="destructive" onSelect={() => handleCancelInvite(p)}>
                                <X className="size-4" />
                                Cancel invite
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
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
