"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Search, Check, Mail } from "lucide-react"
import { getJudgeAddedMessage, getJudgeInvitationMessage } from "@/lib/judge-invitation-message"

type JudgeData = {
  participantId: string
  clerkUserId: string
  displayName: string
  email: string | null
  imageUrl: string | null
  prizeIds: string[]
}

type SearchUser = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  username: string | null
  imageUrl: string | null
}

interface AssignJudgesDialogProps {
  hackathonId: string
  prizeId: string
  prizeName: string
  judges: JudgeData[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssignJudge: (prizeId: string, judgeParticipantId: string) => Promise<void>
  onUnassignJudge: (prizeId: string, judgeParticipantId: string) => Promise<void>
  onRefresh: () => void
}

export function AssignJudgesDialog({
  hackathonId,
  prizeId,
  prizeName,
  judges,
  open,
  onOpenChange,
  onAssignJudge,
  onUnassignJudge,
  onRefresh,
}: AssignJudgesDialogProps) {
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [localOverrides, setLocalOverrides] = useState<Map<string, boolean>>(new Map())
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [addingBatch, setAddingBatch] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasChanges = useRef(false)

  const base = `/api/dashboard/hackathons/${hackathonId}/judging`

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSearchQuery("")
      setSearchResults([])
      setSelectedUsers(new Set())
      setLocalOverrides(new Map())
      setFeedback(null)
      setInviteEmail("")
      if (hasChanges.current) {
        onRefresh()
        hasChanges.current = false
      }
    }
    onOpenChange(nextOpen)
  }

  function isJudgeAssigned(judge: JudgeData) {
    if (localOverrides.has(judge.participantId)) {
      return localOverrides.get(judge.participantId)!
    }
    return judge.prizeIds.includes(prizeId)
  }

  async function handleToggle(judge: JudgeData) {
    const wasAssigned = isJudgeAssigned(judge)
    const newState = !wasAssigned

    setLocalOverrides((prev) => new Map(prev).set(judge.participantId, newState))
    setToggling((prev) => new Set(prev).add(judge.participantId))

    try {
      if (wasAssigned) {
        await onUnassignJudge(prizeId, judge.participantId)
      } else {
        await onAssignJudge(prizeId, judge.participantId)
      }
    } catch {
      setLocalOverrides((prev) => {
        const next = new Map(prev)
        next.set(judge.participantId, wasAssigned)
        return next
      })
      setFeedback({ message: `Failed to ${wasAssigned ? "remove" : "assign"} ${judge.displayName}`, isError: true })
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(judge.participantId)
        return next
      })
    }
  }

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      setFeedback(null)
      setSelectedUsers(new Set())

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }

      if (query.trim().length < 2) {
        setSearchResults([])
        setSearching(false)
        return
      }

      setSearching(true)
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `${base}/user-search?q=${encodeURIComponent(query.trim())}`
          )
          if (!res.ok) throw new Error("Search failed")
          const data = await res.json()
          const existingClerkIds = new Set(judges.map((j) => j.clerkUserId))
          setSearchResults(
            (data.users ?? []).filter((u: SearchUser) => !existingClerkIds.has(u.id))
          )
        } catch {
          setSearchResults([])
        } finally {
          setSearching(false)
        }
      }, 300)
    },
    [base, judges]
  )

  function getDisplayName(user: SearchUser) {
    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      user.id
    )
  }

  function toggleUserSelection(userId: string) {
    setSelectedUsers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  async function handleAddSelected() {
    if (selectedUsers.size === 0) return
    setAddingBatch(true)
    setFeedback(null)

    let added = 0
    const errors: string[] = []

    for (const userId of selectedUsers) {
      const user = searchResults.find((u) => u.id === userId)
      const name = user ? getDisplayName(user) : userId
      try {
        const res = await fetch(`${base}/judges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clerkUserId: userId }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          errors.push(`${name}: ${data.error || "failed to add"}`)
          continue
        }
        const data = await res.json()

        if (data.participant?.id) {
          await fetch(`/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign-judge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ judgeParticipantId: data.participant.id }),
          })
        }
        added++
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : "unknown error"}`)
      }
    }

    hasChanges.current = true
    setSearchQuery("")
    setSearchResults([])
    setSelectedUsers(new Set())

    const parts: string[] = []
    if (added > 0) parts.push(`${added} judge${added !== 1 ? "s" : ""} added`)
    if (errors.length > 0) parts.push(errors.join("; "))
    setFeedback({ message: parts.join(". "), isError: errors.length > 0 })

    setAddingBatch(false)
  }

  async function handleInviteByEmail(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return

    setInviting(true)
    setFeedback(null)

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
      setFeedback({
        message: data.invitation
          ? getJudgeInvitationMessage(email, data.queued === true, data.delivery === "failed")
          : getJudgeAddedMessage(email, data.queued === true, data.delivery === "failed"),
        isError: data.delivery === "failed",
      })
      hasChanges.current = true
      setInviteEmail("")
    } catch (err) {
      setFeedback({ message: err instanceof Error ? err.message : "Something went wrong", isError: true })
    } finally {
      setInviting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Judges</DialogTitle>
          <DialogDescription>{prizeName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {judges.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {judges.map((judge) => {
                const isAssigned = isJudgeAssigned(judge)
                const isLoading = toggling.has(judge.participantId)
                return (
                  <button
                    key={judge.participantId}
                    type="button"
                    onClick={() => handleToggle(judge)}
                    disabled={isLoading}
                    className="flex items-center gap-3 w-full rounded-lg p-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <Avatar size="sm">
                      {judge.imageUrl && <AvatarImage src={judge.imageUrl} alt={judge.displayName} />}
                      <AvatarFallback className="text-[10px]">{judge.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{judge.displayName}</p>
                      {judge.email && <p className="text-xs text-muted-foreground truncate">{judge.email}</p>}
                    </div>
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                    ) : isAssigned ? (
                      <div className="flex items-center justify-center size-5 rounded bg-primary text-primary-foreground shrink-0">
                        <Check className="size-3" />
                      </div>
                    ) : (
                      <div className="size-5 rounded border shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {judges.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No judges added yet. Search below to add one.
            </p>
          )}

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Add new judge</p>
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

            {searching && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {searchResults.map((user) => {
                    const displayName = getDisplayName(user)
                    const isSelected = selectedUsers.has(user.id)
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUserSelection(user.id)}
                        disabled={addingBatch}
                        className="flex items-center gap-3 w-full rounded-lg p-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <Avatar size="sm">
                          {user.imageUrl && <AvatarImage src={user.imageUrl} alt={displayName} />}
                          <AvatarFallback className="text-[10px]">
                            {displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                        </div>
                        {isSelected ? (
                          <div className="flex items-center justify-center size-5 rounded bg-primary text-primary-foreground shrink-0">
                            <Check className="size-3" />
                          </div>
                        ) : (
                          <div className="size-5 rounded border shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={selectedUsers.size === 0 || addingBatch}
                  onClick={handleAddSelected}
                >
                  {addingBatch ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {selectedUsers.size === 0
                    ? "Select judges to add"
                    : `Add ${selectedUsers.size} judge${selectedUsers.size !== 1 ? "s" : ""}`}
                </Button>
              </>
            )}

            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center py-2">No users found</p>
                <form onSubmit={handleInviteByEmail} autoComplete="off" className="flex gap-2">
                  <Input
                    name="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Invite by email..."
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    className="flex-1"
                  />
                  <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}>
                    {inviting ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  </Button>
                </form>
              </div>
            )}
          </div>

          {feedback && (
            <p className={`text-sm text-center ${feedback.isError ? "text-destructive" : "text-muted-foreground"}`}>
              {feedback.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
