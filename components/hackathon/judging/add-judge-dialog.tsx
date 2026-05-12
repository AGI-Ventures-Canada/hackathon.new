"use client"

import { useState, useRef, useCallback } from "react"
import { assertOkJson } from "@/lib/utils/fetch"
import { Input } from "@/components/ui/input"
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
  UserPlus,
  Search,
  Mail,
} from "lucide-react"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  | { type: "invitation"; id: string; email: string; token: string }

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
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cacheRef = useRef<Map<string, SearchUser[]>>(new Map())

  const base = `/api/dashboard/hackathons/${hackathonId}/judging`

  function reset() {
    setSearchQuery("")
    setSearchResults([])
    setError(null)
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
    const savedQuery = searchQuery
    const savedResults = searchResults
    handleOpenChange(false)

    try {
      const data = await fetch(`${base}/judges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: user.id }),
      }).then(assertOkJson<{ participant: { id: string; clerkUserId?: string } }>)
      onSuccess?.({
        type: "judge",
        participantId: data.participant.id,
        clerkUserId: user.id,
        displayName: getDisplayName(user),
        email: user.email,
        imageUrl: user.imageUrl,
      })
    } catch (err) {
      setSearchQuery(savedQuery)
      setSearchResults(savedResults)
      setError(err instanceof Error ? err.message : "Something went wrong")
      onOpenChange(true)
    } finally {
      setAdding(false)
    }
  }

  async function handleInviteByEmail(email: string) {
    setAdding(true)
    setError(null)
    const savedQuery = searchQuery
    const savedResults = searchResults
    handleOpenChange(false)

    try {
      const data = await fetch(`${base}/judges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then(
        assertOkJson<{
          invitation?: { id: string; token: string }
          participant?: { id: string; clerkUserId: string }
        }>
      )
      if (data.invitation) {
        onSuccess?.({ type: "invitation", id: data.invitation.id, email, token: data.invitation.token })
      } else if (data.participant) {
        onSuccess?.({
          type: "judge",
          participantId: data.participant.id,
          clerkUserId: data.participant.clerkUserId,
          displayName: email,
          email,
          imageUrl: null,
        })
      }
    } catch (err) {
      setSearchQuery(savedQuery)
      setSearchResults(savedResults)
      setError(err instanceof Error ? err.message : "Something went wrong")
      onOpenChange(true)
    } finally {
      setAdding(false)
    }
  }

  const trimmedQuery = searchQuery.trim()
  const isQueryValidEmail = EMAIL_REGEX.test(trimmedQuery)
  const hasExactEmailMatch = searchResults.some(
    (u) => u.email?.toLowerCase() === trimmedQuery.toLowerCase()
  )
  const minLength = trimmedQuery.includes("@") ? 2 : 3
  const aboveMinLength = trimmedQuery.length >= minLength

  // Only one of these is true at a time after searching settles:
  //  - searching:          spinner only (invite/no-results suppressed during fetch)
  //  - showInviteByEmail:  complete email + no exact match -> invite row
  //  - showNoResults:      incomplete query past min length with zero hits -> message
  const showInviteByEmail = isQueryValidEmail && !hasExactEmailMatch && !searching
  const hasPartialEmail = trimmedQuery.includes("@") && !isQueryValidEmail
  const showNoResults =
    !searching && !isQueryValidEmail && aboveMinLength && searchResults.length === 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Judge</DialogTitle>
          <DialogDescription>
            Search for a user or invite by email
          </DialogDescription>
        </DialogHeader>

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

            {(searchResults.length > 0 || showInviteByEmail) && (
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

                {showInviteByEmail && (
                  <button
                    type="button"
                    onClick={() => handleInviteByEmail(trimmedQuery)}
                    disabled={adding}
                    className="flex items-center gap-3 w-full rounded-lg p-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <Avatar size="sm">
                      <AvatarFallback>
                        <Mail className="size-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {trimmedQuery}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        Invite via email
                      </p>
                    </div>
                    {adding ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <UserPlus className="size-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                )}
              </div>
            )}

            {showNoResults && (
              <p className="text-sm text-muted-foreground text-center py-3">
                {hasPartialEmail
                  ? "Enter a full email to invite someone new"
                  : "No users found"}
              </p>
            )}
          </div>
      </DialogContent>
    </Dialog>
  )
}
