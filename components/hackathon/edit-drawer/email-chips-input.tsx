"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { X, Check, Loader2 } from "lucide-react"

export type EmailEntry = {
  email: string
  clerkUser?: {
    id: string
    firstName: string | null
    lastName: string | null
    imageUrl: string | null
  } | null
}

interface EmailChipsInputProps {
  hackathonId: string
  entries: EmailEntry[]
  onAdd: (entries: EmailEntry[]) => void
  onRemove: (email: string) => void
  existingEmails?: string[]
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getInitials(firstName: string | null, lastName: string | null): string {
  return [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"
}

interface UserSearchResult {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
}

export function EmailChipsInput({
  hackathonId,
  entries,
  onAdd,
  onRemove,
  existingEmails = [],
}: EmailChipsInputProps) {
  const [input, setInput] = useState("")
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const allEmails = [
    ...existingEmails,
    ...entries.map((e) => e.email),
  ]
  const allEmailsRef = useRef(allEmails)
  allEmailsRef.current = allEmails

  const searchUsers = useCallback(async (query: string, signal: AbortSignal) => {
    setSearching(true)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/judging/user-search?q=${encodeURIComponent(query)}`,
        { signal }
      )
      if (signal.aborted) return
      if (res.ok) {
        const data = await res.json()
        const filtered = (data.users || []).filter(
          (u: UserSearchResult) => !allEmailsRef.current.includes(u.email)
        )
        setSearchResults(filtered)
        setShowDropdown(filtered.length > 0)
        setSelectedIndex(-1)
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setSearchResults([])
    } finally {
      if (!signal.aborted) setSearching(false)
    }
  }, [hackathonId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    const trimmed = input.trim()
    if (trimmed.length >= 2 && trimmed.includes("@") && trimmed.indexOf("@") < trimmed.length - 1) {
      const controller = new AbortController()
      abortRef.current = controller
      debounceRef.current = setTimeout(() => searchUsers(trimmed, controller.signal), 100)
    } else {
      abortRef.current = null
      setSearchResults([])
      setShowDropdown(false)
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [input, searchUsers])

  function addEmail(email: string, clerkUser?: EmailEntry["clerkUser"]) {
    const trimmed = email.trim().toLowerCase()
    if (!isValidEmail(trimmed)) return
    if (allEmails.includes(trimmed)) return

    let resolvedClerkUser = clerkUser ?? null
    if (!resolvedClerkUser) {
      const match = searchResults.find((u) => u.email?.toLowerCase() === trimmed)
      if (match) {
        resolvedClerkUser = {
          id: match.id,
          firstName: match.firstName,
          lastName: match.lastName,
          imageUrl: match.imageUrl,
        }
      }
    }

    onAdd([{ email: trimmed, clerkUser: resolvedClerkUser }])
    setInput("")
    setShowDropdown(false)
    setSearchResults([])
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value

    if (value.includes(",")) {
      const parts = value.split(",")
      const newEntries: EmailEntry[] = []
      let remaining = ""

      for (const part of parts) {
        const trimmed = part.trim().toLowerCase()
        if (isValidEmail(trimmed) && !allEmails.includes(trimmed)) {
          const match = searchResults.find((u) => u.email?.toLowerCase() === trimmed)
          newEntries.push({
            email: trimmed,
            clerkUser: match
              ? { id: match.id, firstName: match.firstName, lastName: match.lastName, imageUrl: match.imageUrl }
              : null,
          })
        } else if (trimmed) {
          remaining = trimmed
        }
      }

      if (newEntries.length > 0) onAdd(newEntries)
      setInput(remaining)
      return
    }

    setInput(value)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showDropdown && searchResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, -1))
        return
      }
      if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault()
        const user = searchResults[selectedIndex]
        addEmail(user.email, {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
        })
        return
      }
    }

    if ((e.key === "Enter" || e.key === "Tab" || e.key === " ") && input.trim()) {
      const trimmed = input.trim()
      if (isValidEmail(trimmed)) {
        e.preventDefault()
        addEmail(trimmed)
        return
      }
      if (e.key === "Tab") return
      if (e.key === " ") return
    }

    if (e.key === "Backspace" && !input && entries.length > 0) {
      e.preventDefault()
      onRemove(entries[entries.length - 1].email)
    }

    if (e.key === "Escape") {
      setShowDropdown(false)
    }
  }

  function handleSelectUser(user: UserSearchResult) {
    addEmail(user.email, {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
    })
    inputRef.current?.focus()
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-3 py-2 min-h-10 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {entries.map((entry) => (
          <Badge
            key={entry.email}
            variant="secondary"
            className="gap-1 pr-1 max-w-full"
          >
            {entry.clerkUser && (
              <Check className="size-3 text-primary shrink-0" />
            )}
            <span className="truncate text-xs">{entry.email}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(entry.email)
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => setShowDropdown(false), 200)
            if (input.trim() && isValidEmail(input.trim())) {
              addEmail(input.trim())
            }
          }}
          placeholder={entries.length === 0 ? "Enter email addresses..." : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          autoFocus
        />
        {searching && <Loader2 className="size-4 text-muted-foreground animate-spin shrink-0" />}
      </div>

      <p className="text-xs text-muted-foreground mt-1">
        Separate multiple emails with commas
      </p>

      {showDropdown && searchResults.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full border rounded-lg bg-popover shadow-md max-h-48 overflow-y-auto">
          {searchResults.map((user, i) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelectUser(user)}
              className={`w-full flex items-center gap-3 p-2.5 text-left transition-colors ${
                i === selectedIndex ? "bg-accent" : "hover:bg-muted/50"
              }`}
            >
              <Avatar className="size-7">
                {user.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
                <AvatarFallback className="text-[10px]">
                  {getInitials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
