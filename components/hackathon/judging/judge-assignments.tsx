"use client"

import { useState, useRef, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Shuffle,
  UserPlus,
  Search,
  Mail,
  X,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"

type SortColumn = "judge" | "submission" | "status" | "assigned"

function SortIcon({
  column,
  sortColumn,
  sortDirection,
}: {
  column: SortColumn
  sortColumn: SortColumn | null
  sortDirection: "asc" | "desc"
}) {
  if (sortColumn !== column) {
    return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground" />
  }
  return sortDirection === "asc" ? (
    <ArrowUp className="ml-1 inline size-3.5" />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" />
  )
}

type Judge = {
  participantId: string
  clerkUserId: string
  displayName: string
  email: string | null
  imageUrl: string | null
  assignmentCount: number
  completedCount: number
}

type PendingInvitation = {
  id: string
  email: string
  status: string
  expiresAt: string
  createdAt: string
}

type SearchUser = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  username: string | null
  imageUrl: string | null
}

type Assignment = {
  id: string
  judgeParticipantId: string
  judgeName: string
  judgeEmail: string | null
  submissionId: string
  submissionTitle: string
  isComplete: boolean
  assignedAt: string
}

type Submission = {
  id: string
  title: string
}

interface JudgeAssignmentsProps {
  hackathonId: string
  initialJudges: Judge[]
  initialAssignments: Assignment[]
  initialInvitations: PendingInvitation[]
  submissions: Submission[]
  anonymousJudging: boolean
  onMutation?: () => void
}

export function JudgeAssignments({
  hackathonId,
  initialJudges,
  initialAssignments,
  initialInvitations,
  submissions,
  anonymousJudging: initialAnonymous,
  onMutation,
}: JudgeAssignmentsProps) {
  const [judges, setJudges] = useState<Judge[]>(initialJudges)
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [invitations, setInvitations] = useState<PendingInvitation[]>(initialInvitations)
  const [anonymous, setAnonymous] = useState(initialAnonymous)
  const [togglingAnonymous, setTogglingAnonymous] = useState(false)
  const [anonymousError, setAnonymousError] = useState<string | null>(null)

  const [addJudgeOpen, setAddJudgeOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [addingJudge, setAddingJudge] = useState(false)
  const [addJudgeError, setAddJudgeError] = useState<string | null>(null)
  const [addJudgeSuccess, setAddJudgeSuccess] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [removingJudgeId, setRemovingJudgeId] = useState<string | null>(null)
  const [removeJudgeError, setRemoveJudgeError] = useState<string | null>(null)

  const [cancellingInvitationId, setCancellingInvitationId] = useState<string | null>(null)

  const [selectedJudgeId, setSelectedJudgeId] = useState("")
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccess, setAssignSuccess] = useState(false)

  const [autoAssignCount, setAutoAssignCount] = useState("3")
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [autoAssignError, setAutoAssignError] = useState<string | null>(null)
  const [autoAssignSuccess, setAutoAssignSuccess] = useState(false)

  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null)
  const [removeAssignmentError, setRemoveAssignmentError] = useState<string | null>(null)

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  const base = `/api/dashboard/hackathons/${hackathonId}/judging`

  async function handleToggleAnonymous(checked: boolean) {
    setTogglingAnonymous(true)
    setAnonymousError(null)
    const previous = anonymous
    setAnonymous(checked)

    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anonymousJudging: checked }),
        }
      )
      if (!res.ok) {
        setAnonymous(previous)
        setAnonymousError("Failed to update setting")
      }
    } catch {
      setAnonymous(previous)
      setAnonymousError("Failed to update setting")
    } finally {
      setTogglingAnonymous(false)
    }
  }

  function openAddJudge() {
    setSearchQuery("")
    setSearchResults([])
    setAddJudgeError(null)
    setAddJudgeSuccess(null)
    setShowInviteForm(false)
    setInviteEmail("")
    abortRef.current?.abort()
    setAddJudgeOpen(true)
  }

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      setAddJudgeError(null)
      setAddJudgeSuccess(null)

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      abortRef.current?.abort()

      if (query.trim().length < 2) {
        setSearchResults([])
        setSearching(false)
        return
      }

      searchTimeoutRef.current = setTimeout(async () => {
        const controller = new AbortController()
        abortRef.current = controller
        setSearching(true)
        try {
          const res = await fetch(
            `${base}/user-search?q=${encodeURIComponent(query.trim())}`,
            { signal: controller.signal }
          )
          if (!res.ok) throw new Error("Search failed")
          const data = await res.json()
          if (!controller.signal.aborted) {
            setSearchResults(data.users ?? [])
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return
          setSearchResults([])
        } finally {
          if (!controller.signal.aborted) {
            setSearching(false)
          }
        }
      }, 100)
    },
    [base]
  )

  async function handleAddFromSearch(user: SearchUser) {
    setAddingJudge(true)
    setAddJudgeError(null)

    try {
      const res = await fetch(`${base}/judges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: user.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to add judge")
      }
      const data = await res.json()
      const displayName =
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.username ||
        user.id
      setJudges((prev) => [
        ...prev,
        {
          participantId: data.participant.id,
          clerkUserId: data.participant.clerkUserId,
          displayName,
          email: user.email,
          imageUrl: user.imageUrl,
          assignmentCount: 0,
          completedCount: 0,
        },
      ])
      setAddJudgeSuccess(`${displayName} added as judge`)
      setSearchQuery("")
      setSearchResults([])
      onMutation?.()
      setTimeout(() => setAddJudgeOpen(false), 800)
    } catch (err) {
      setAddJudgeError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAddingJudge(false)
    }
  }

  async function handleInviteByEmail(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return

    setAddingJudge(true)
    setAddJudgeError(null)

    try {
      const res = await fetch(`${base}/judges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to invite judge")
      }
      const data = await res.json()

      if (data.invitation) {
        setInvitations((prev) => [
          {
            id: data.invitation.id,
            email,
            status: "pending",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ])
        setAddJudgeSuccess(`Invitation sent to ${email}`)
      } else {
        setJudges((prev) => [
          ...prev,
          {
            participantId: data.participant.id,
            clerkUserId: data.participant.clerkUserId,
            displayName: email,
            email,
            imageUrl: null,
            assignmentCount: 0,
            completedCount: 0,
          },
        ])
        setAddJudgeSuccess(`${email} added as judge`)
      }

      setInviteEmail("")
      setShowInviteForm(false)
      onMutation?.()
      setTimeout(() => setAddJudgeOpen(false), 800)
    } catch (err) {
      setAddJudgeError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAddingJudge(false)
    }
  }

  function handleInviteKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !addingJudge) {
      e.preventDefault()
      handleInviteByEmail(e as unknown as React.FormEvent)
    }
  }

  async function handleRemoveJudge(participantId: string) {
    setRemovingJudgeId(participantId)
    setRemoveJudgeError(null)

    try {
      const res = await fetch(`${base}/judges/${participantId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to remove judge")
      setJudges((prev) => prev.filter((j) => j.participantId !== participantId))
      setAssignments((prev) =>
        prev.filter((a) => a.judgeParticipantId !== participantId)
      )
      onMutation?.()
    } catch {
      setRemoveJudgeError("Failed to remove judge")
    } finally {
      setRemovingJudgeId(null)
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    setCancellingInvitationId(invitationId)

    try {
      const res = await fetch(`${base}/invitations/${invitationId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to cancel invitation")
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId))
    } catch {
      // silently fail
    } finally {
      setCancellingInvitationId(null)
    }
  }

  async function handleManualAssign() {
    if (!selectedJudgeId || !selectedSubmissionId) return
    setAssigning(true)
    setAssignError(null)
    setAssignSuccess(false)

    try {
      const res = await fetch(`${base}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judgeParticipantId: selectedJudgeId,
          submissionId: selectedSubmissionId,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to assign")
      }
      const data = await res.json()
      const judge = judges.find((j) => j.participantId === selectedJudgeId)
      const submission = submissions.find((s) => s.id === selectedSubmissionId)
      setAssignments((prev) => [
        ...prev,
        {
          id: data.id,
          judgeParticipantId: selectedJudgeId,
          judgeName: judge?.displayName ?? selectedJudgeId,
          judgeEmail: judge?.email ?? null,
          submissionId: selectedSubmissionId,
          submissionTitle: submission?.title ?? selectedSubmissionId,
          isComplete: false,
          assignedAt: new Date().toISOString(),
        },
      ])
      setJudges((prev) =>
        prev.map((j) =>
          j.participantId === selectedJudgeId
            ? { ...j, assignmentCount: j.assignmentCount + 1 }
            : j
        )
      )
      setAssignSuccess(true)
      setTimeout(() => setAssignSuccess(false), 2000)
      setSelectedJudgeId("")
      setSelectedSubmissionId("")
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAssigning(false)
    }
  }

  async function handleAutoAssign() {
    const count = parseInt(autoAssignCount)
    if (!count || count < 1) return
    setAutoAssigning(true)
    setAutoAssignError(null)
    setAutoAssignSuccess(false)

    try {
      const res = await fetch(`${base}/auto-assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionsPerJudge: count }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to auto-assign")
      }
      const data = await res.json()
      if (data.assignments) {
        setAssignments(data.assignments)
      }
      if (data.judges) {
        setJudges(data.judges)
      }
      setAutoAssignSuccess(true)
      onMutation?.()
      setTimeout(() => setAutoAssignSuccess(false), 3000)
    } catch (err) {
      setAutoAssignError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAutoAssigning(false)
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    setRemovingAssignmentId(assignmentId)
    setRemoveAssignmentError(null)

    const assignment = assignments.find((a) => a.id === assignmentId)

    try {
      const res = await fetch(`${base}/assignments/${assignmentId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to remove assignment")
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
      if (assignment) {
        setJudges((prev) =>
          prev.map((j) =>
            j.participantId === assignment.judgeParticipantId
              ? {
                  ...j,
                  assignmentCount: Math.max(0, j.assignmentCount - 1),
                  completedCount: assignment.isComplete
                    ? Math.max(0, j.completedCount - 1)
                    : j.completedCount,
                }
              : j
          )
        )
      }
    } catch {
      setRemoveAssignmentError("Failed to remove assignment")
    } finally {
      setRemovingAssignmentId(null)
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const assignedSubmissionIds = useMemo(
    () => new Set(assignments.map((a) => a.submissionId)),
    [assignments]
  )

  const sortedAssignments = useMemo(() => {
    if (!sortColumn) return assignments

    return [...assignments].sort((a, b) => {
      let comparison = 0
      if (sortColumn === "judge") {
        comparison = a.judgeName.localeCompare(b.judgeName)
      } else if (sortColumn === "submission") {
        comparison = a.submissionTitle.localeCompare(b.submissionTitle)
      } else if (sortColumn === "status") {
        comparison = (a.isComplete ? 1 : 0) - (b.isComplete ? 1 : 0)
      } else if (sortColumn === "assigned") {
        comparison = new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime()
      }
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [assignments, sortColumn, sortDirection])

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="anonymous-judging">Anonymous judging</Label>
            {togglingAnonymous && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <Switch
            id="anonymous-judging"
            checked={anonymous}
            onCheckedChange={handleToggleAnonymous}
            disabled={togglingAnonymous}
          />
        </div>
        {anonymousError && (
          <p className="text-sm text-destructive">{anonymousError}</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Judges</h3>
            <p className="text-sm text-muted-foreground">
              Manage judges assigned to this hackathon
            </p>
          </div>
          <Dialog open={addJudgeOpen} onOpenChange={setAddJudgeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAddJudge}>
                <Plus className="mr-2 size-4" />
                Add Judge
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Judge</DialogTitle>
                <DialogDescription>
                  Search for a user or invite by email
                </DialogDescription>
              </DialogHeader>

              {addJudgeSuccess ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CheckCircle2 className="size-10 text-primary" />
                  <p className="text-sm font-medium">{addJudgeSuccess}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Search by name, email, or username..."
                      className="pl-9"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                  </div>

                  {addJudgeError && (
                    <p className="text-sm text-destructive">{addJudgeError}</p>
                  )}

                  {searching && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {!searching && searchResults.length > 0 && (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {searchResults.map((user) => {
                        const displayName =
                          [user.firstName, user.lastName]
                            .filter(Boolean)
                            .join(" ") ||
                          user.username ||
                          user.email ||
                          user.id
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleAddFromSearch(user)}
                            disabled={addingJudge}
                            className="flex items-center gap-3 w-full rounded-lg p-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            <Avatar size="sm">
                              {user.imageUrl && (
                                <AvatarImage src={user.imageUrl} alt={displayName} />
                              )}
                              <AvatarFallback>
                                {getInitials(displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {displayName}
                              </p>
                              {user.email && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {user.email}
                                </p>
                              )}
                            </div>
                            <UserPlus className="size-4 text-muted-foreground shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {!searching &&
                    searchQuery.length >= 2 &&
                    searchResults.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-3">
                        No users found
                      </p>
                    )}

                  <div className="border-t pt-4">
                    {!showInviteForm ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setShowInviteForm(true)}
                      >
                        <Mail className="mr-2 size-4" />
                        Invite by email
                      </Button>
                    ) : (
                      <form
                        onSubmit={handleInviteByEmail}
                        onKeyDown={handleInviteKeyDown}
                        autoComplete="off"
                        className="space-y-3"
                      >
                        <div className="space-y-1.5">
                          <Label htmlFor="invite-email" className="text-xs">
                            Email address
                          </Label>
                          <Input
                            id="invite-email"
                            name="invite-email"
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="judge@example.com"
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            data-form-type="other"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowInviteForm(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={addingJudge || !inviteEmail.trim()}
                          >
                            {addingJudge && (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            )}
                            Send Invitation
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {removeJudgeError && (
          <p className="text-sm text-destructive">{removeJudgeError}</p>
        )}

        {judges.length === 0 && invitations.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No judges added yet. Add judges to begin assignment.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {judges.map((judge) => {
              const progress =
                judge.assignmentCount > 0
                  ? Math.round(
                      (judge.completedCount / judge.assignmentCount) * 100
                    )
                  : 0
              return (
                <div
                  key={judge.participantId}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Avatar size="sm">
                      {judge.imageUrl && (
                        <AvatarImage src={judge.imageUrl} alt={judge.displayName} />
                      )}
                      <AvatarFallback>
                        {getInitials(judge.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {judge.displayName}
                        </span>
                        {judge.email && (
                          <span className="text-xs text-muted-foreground">
                            {judge.email}
                          </span>
                        )}
                        <Badge variant="secondary">
                          {judge.assignmentCount} assigned
                        </Badge>
                        <Badge variant="outline">
                          {judge.completedCount} completed
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={progress} className="max-w-48" />
                        <span className="text-xs text-muted-foreground">
                          {progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        disabled={removingJudgeId === judge.participantId}
                      >
                        {removingJudgeId === judge.participantId ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove judge?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove {judge.displayName} and all their
                          assignments. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            handleRemoveJudge(judge.participantId)
                          }
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )
            })}

            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-dashed p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarFallback>
                      <Mail className="size-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{inv.email}</span>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Invited {formatDate(inv.createdAt)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  onClick={() => handleCancelInvitation(inv.id)}
                  disabled={cancellingInvitationId === inv.id}
                >
                  {cancellingInvitationId === inv.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Assign Submissions</h3>
          <p className="text-sm text-muted-foreground">
            Manually assign a submission to a judge, or auto-assign in bulk
          </p>
        </div>

        {(() => {
          const unassignedCount = submissions.filter((s) => !assignedSubmissionIds.has(s.id)).length
          if (unassignedCount === 0) return null
          return (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                {unassignedCount} submission{unassignedCount !== 1 ? "s" : ""} not assigned to any judge
              </AlertDescription>
            </Alert>
          )
        })()}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Judge</Label>
            <Select value={selectedJudgeId} onValueChange={setSelectedJudgeId}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Select judge" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {judges.map((j) => (
                  <SelectItem key={j.participantId} value={j.participantId}>
                    {j.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Submission</Label>
            <Select
              value={selectedSubmissionId}
              onValueChange={setSelectedSubmissionId}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Select submission" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {submissions.map((s) => {
                  const isUnassigned = !assignedSubmissionIds.has(s.id)
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        {s.title}
                        {isUnassigned && (
                          <AlertTriangle className="size-3.5 text-muted-foreground" />
                        )}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={handleManualAssign}
            disabled={assigning || !selectedJudgeId || !selectedSubmissionId}
          >
            {assigning ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 size-4" />
            )}
            Assign
          </Button>
        </div>

        {assignError && (
          <p className="text-sm text-destructive">{assignError}</p>
        )}
        {assignSuccess && (
          <p className="text-sm text-primary">Assignment created</p>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="auto-assign-count">Submissions per judge</Label>
            <Input
              id="auto-assign-count"
              name="auto-assign-count"
              type="number"
              min={1}
              value={autoAssignCount}
              onChange={(e) => setAutoAssignCount(e.target.value)}
              className="w-24"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoAssign}
            disabled={autoAssigning || judges.length === 0}
          >
            {autoAssigning ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Shuffle className="mr-2 size-4" />
            )}
            Auto-Assign
          </Button>
          {autoAssignError && (
            <p className="text-sm text-destructive">{autoAssignError}</p>
          )}
          {autoAssignSuccess && (
            <p className="text-sm text-primary">Auto-assignment complete</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Assignments</h3>
          <p className="text-sm text-muted-foreground">
            {assignments.length} total assignment{assignments.length !== 1 ? "s" : ""}
          </p>
        </div>

        {removeAssignmentError && (
          <p className="text-sm text-destructive">{removeAssignmentError}</p>
        )}

        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No assignments yet. Assign submissions to judges above.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort("judge")}
                      className="flex items-center hover:text-foreground transition-colors"
                    >
                      Judge
                      <SortIcon column="judge" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort("submission")}
                      className="flex items-center hover:text-foreground transition-colors"
                    >
                      Submission
                      <SortIcon column="submission" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort("status")}
                      className="flex items-center hover:text-foreground transition-colors"
                    >
                      Status
                      <SortIcon column="status" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort("assigned")}
                      className="flex items-center hover:text-foreground transition-colors"
                    >
                      Assigned
                      <SortIcon column="assigned" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </button>
                  </TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAssignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{a.judgeName}</div>
                        {a.judgeEmail && (
                          <div className="text-xs text-muted-foreground">{a.judgeEmail}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{a.submissionTitle}</TableCell>
                    <TableCell>
                      {a.isComplete ? (
                        <Badge variant="default">Complete</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(a.assignedAt)}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            disabled={removingAssignmentId === a.id}
                          >
                            {removingAssignmentId === a.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Remove assignment?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the assignment of &quot;{a.submissionTitle}&quot; from {a.judgeName}. Any existing scores will be deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveAssignment(a.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
