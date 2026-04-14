"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Loader2,
  CheckCircle2,
  UserPlus,
  Search,
  Mail,
} from "lucide-react"

type SearchUser = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  username: string | null
  imageUrl: string | null
}

export type AddJudgeResult =
  | { type: "judge"; participantId: string; clerkUserId: string; displayName: string; email: string | null; imageUrl: string | null }
  | { type: "invitation"; id: string; email: string }

interface AddJudgeDialogProps {
  hackathonId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (result: AddJudgeResult) => void
}

export function AddJudgeDialog({
  hackathonId,
  open,
  onOpenChange,
  onSuccess,
}: AddJudgeDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cacheRef = useRef<Map<string, SearchUser[]>>(new Map())

  const base = `/api/dashboard/hackathons/${hackathonId}/judging`

  function reset() {
    setSearchQuery("")
    setSearchResults([])
    setError(null)
    setSuccess(null)
    setShowInviteForm(false)
    setInviteEmail("")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    cacheRef.current.clear()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const doSearch = useCallback(
    async (query: string, signal: AbortSignal) => {
      setSearching(true)
      try {
        const res = await fetch(
          `${base}/user-search?q=${encodeURIComponent(query)}`,
          { signal }
        )
        if (!res.ok) throw new Error("Search failed")
        const data = await res.json()
        if (!signal.aborted) {
          const users = data.users ?? []
          cacheRef.current.set(query.toLowerCase(), users)
          setSearchResults(users)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
      } finally {
        if (!signal.aborted) {
          setSearching(false)
        }
      }
    },
    [base]
  )

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      setError(null)
      setSuccess(null)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()

      const minLength = query.includes("@") ? 2 : 3
      if (query.trim().length < minLength) {
        setSearchResults([])
        setSearching(false)
        return
      }

      const normalized = query.trim().toLowerCase()
      let bestPrefix = ""
      let bestResults: SearchUser[] | null = null
      for (const [cachedQuery, cachedResults] of cacheRef.current) {
        if (normalized.startsWith(cachedQuery) && cachedQuery.length > bestPrefix.length) {
          bestPrefix = cachedQuery
          bestResults = cachedResults
        }
      }
      if (bestResults !== null) {
        setSearchResults(
          bestResults.filter((u) => {
            const s = normalized
            return (
              u.firstName?.toLowerCase().includes(s) ||
              u.lastName?.toLowerCase().includes(s) ||
              u.email?.toLowerCase().includes(s) ||
              u.username?.toLowerCase().includes(s)
            )
          })
        )
      }

      const controller = new AbortController()
      abortRef.current = controller
      debounceRef.current = setTimeout(() => doSearch(query.trim(), controller.signal), 200)
    },
    [doSearch]
  )

  function getDisplayName(user: SearchUser) {
    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.email ||
      user.id
    )
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  async function handleAddFromSearch(user: SearchUser) {
    setAdding(true)
    setError(null)

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
      onSuccess?.({
        type: "judge",
        participantId: data.participant.id,
        clerkUserId: user.id,
        displayName: getDisplayName(user),
        email: user.email,
        imageUrl: user.imageUrl,
      })
      setSuccess(`${getDisplayName(user)} added as judge`)
      setTimeout(() => handleOpenChange(false), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAdding(false)
    }
  }

  async function handleInviteByEmail(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return

    setAdding(true)
    setError(null)

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
        onSuccess?.({ type: "invitation", id: data.invitation.id, email })
      } else {
        onSuccess?.({
          type: "judge",
          participantId: data.participant.id,
          clerkUserId: data.participant.clerkUserId,
          displayName: email,
          email,
          imageUrl: null,
        })
      }
      setSuccess(
        data.invitation ? `Invitation sent to ${email}` : `${email} added as judge`
      )
      setTimeout(() => handleOpenChange(false), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAdding(false)
    }
  }

  function handleInviteKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !adding) {
      e.preventDefault()
      handleInviteByEmail(e as unknown as React.FormEvent)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Judge</DialogTitle>
          <DialogDescription>
            Search for a user or invite by email
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="size-10 text-primary" />
            <p className="text-sm font-medium">{success}</p>
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
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {searching && searchResults.length === 0 && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {searchResults.length > 0 && (
              <div className={`space-y-1 max-h-64 overflow-y-auto transition-opacity ${searching ? "opacity-60" : ""}`}>
                {searchResults.map((user) => {
                  const displayName = getDisplayName(user)
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleAddFromSearch(user)}
                      disabled={adding}
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
              searchQuery.length >= (searchQuery.includes("@") ? 2 : 3) &&
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
                      autoFocus
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
                      disabled={adding || !inviteEmail.trim()}
                    >
                      {adding && (
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
  )
}
