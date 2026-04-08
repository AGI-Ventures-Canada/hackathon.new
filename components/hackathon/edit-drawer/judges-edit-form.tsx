"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import { useEdit } from "@/components/hackathon/preview/edit-context"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Trash2, Loader2, Plus, Building2 } from "lucide-react"
import { EmailChipsInput, type EmailEntry } from "./email-chips-input"
import { JudgeHeadshotUpload } from "./judge-headshot-upload"
import type { HackathonJudgeDisplay } from "@/lib/db/hackathon-types"

interface JudgesEditFormProps {
  hackathonId: string
  initialJudges: HackathonJudgeDisplay[]
  onSaveAndNext?: () => void
}

interface OrgSearchResult {
  id: string
  name: string
  slug: string | null
  logoUrl: string | null
  logoUrlDark: string | null
  websiteUrl: string | null
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function useOrgSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<OrgSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dashboard/organizations/search?q=${encodeURIComponent(query)}`
        )
        if (res.ok) {
          const data = await res.json()
          setResults(data.organizations || [])
        }
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return { query, setQuery, results, loading }
}

function OrgAutocomplete({
  value,
  onChange,
  onBlur,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}) {
  const { query, setQuery, results, loading } = useOrgSearch()
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const justSelected = useRef(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    onChange(val)
    setQuery(val)
    setShowDropdown(true)
  }

  function handleSelect(org: OrgSearchResult) {
    justSelected.current = true
    onChange(org.name)
    setShowDropdown(false)
    setQuery("")
    onBlur?.()
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onFocus={() => { if (query.length >= 2) setShowDropdown(true) }}
        onBlur={() => setTimeout(() => {
          setShowDropdown(false)
          if (justSelected.current) {
            justSelected.current = false
            return
          }
          onBlur?.()
        }, 200)}
        placeholder="Organization"
        disabled={disabled}
        className="h-8 text-sm"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground animate-spin" />
      )}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full border rounded-lg bg-popover shadow-md max-h-32 overflow-y-auto">
          {results.map((org) => (
            <button
              key={org.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(org)}
              className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors"
            >
              <Building2 className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{org.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function JudgesEditForm({
  hackathonId,
  initialJudges,
  onSaveAndNext,
}: JudgesEditFormProps) {
  const router = useRouter()
  const { closeDrawer } = useEdit()
  const [emailEntries, setEmailEntries] = useState<EmailEntry[]>([])
  const [submittedEmails, setSubmittedEmails] = useState<string[]>([])
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [localEdits, setLocalEdits] = useState<Record<string, Record<string, string | null>>>({})
  const savingFieldsRef = useRef<Set<string>>(new Set())


  useEffect(() => {
    setLocalEdits((prev) => {
      const kept: Record<string, Record<string, string | null>> = {}
      for (const [judgeId, fields] of Object.entries(prev)) {
        const remaining: Record<string, string | null> = {}
        for (const [field, value] of Object.entries(fields)) {
          if (savingFieldsRef.current.has(`${judgeId}:${field}`)) {
            remaining[field] = value
          }
        }
        if (Object.keys(remaining).length > 0) kept[judgeId] = remaining
      }
      return kept
    })
    setHiddenIds(new Set())
  }, [initialJudges])

  const visibleJudges = useMemo(() => {
    return initialJudges
      .filter((j) => !hiddenIds.has(j.id))
      .map((j) => {
        const edits = localEdits[j.id]
        if (!edits) return j
        return { ...j, ...edits }
      })
  }, [initialJudges, hiddenIds, localEdits])

  async function handleAddFromChips() {
    if (emailEntries.length === 0) return
    setResolving(true)
    setError(null)
    setSubmittedEmails(emailEntries.map((e) => e.email))

    try {
      const unresolvedEmails = emailEntries
        .filter((e) => !e.clerkUser)
        .map((e) => e.email)

      const resolvedMap = new Map<string, EmailEntry["clerkUser"]>()
      if (unresolvedEmails.length > 0) {
        const lookups = unresolvedEmails.map(async (email) => {
          try {
            const res = await fetch(
              `/api/dashboard/hackathons/${hackathonId}/judging/user-search?q=${encodeURIComponent(email)}`
            )
            if (!res.ok) return
            const data = await res.json()
            const match = (data.users ?? []).find(
              (u: { email: string | null }) => u.email?.toLowerCase() === email.toLowerCase()
            )
            if (match) {
              resolvedMap.set(email, {
                id: match.id,
                firstName: match.firstName ?? null,
                lastName: match.lastName ?? null,
                imageUrl: match.imageUrl ?? null,
              })
            }
          } catch (err) {
            console.error(`Failed to resolve Clerk user for ${email}:`, err)
          }
        })
        await Promise.all(lookups)
      }

      const succeededEmails = new Set<string>()
      const duplicateEmails: string[] = []

      const addResults = await Promise.allSettled(
        emailEntries.map(async (entry) => {
          const clerkUser = entry.clerkUser ?? resolvedMap.get(entry.email) ?? null
          const name = clerkUser
            ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || entry.email.split("@")[0]
            : entry.email.split("@")[0]

          const res = await fetch(
            `/api/dashboard/hackathons/${hackathonId}/judges/display`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                ...(clerkUser ? { clerkUserId: clerkUser.id } : {}),
                ...(clerkUser?.imageUrl ? { headshotUrl: clerkUser.imageUrl } : {}),
                ...(entry.email ? { email: entry.email } : {}),
              }),
            }
          )
          if (res.status === 409) {
            succeededEmails.add(entry.email)
            duplicateEmails.push(entry.email)
            return
          }
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || `Failed to add ${name}`)
          }

          succeededEmails.add(entry.email)

          if (entry.email) {
            const judgeRes = await fetch(
              `/api/dashboard/hackathons/${hackathonId}/judging/judges`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  clerkUser ? { clerkUserId: clerkUser.id } : { email: entry.email }
                ),
              }
            )
            if (!judgeRes.ok) {
              const judgeData = await judgeRes.json()
              throw new Error(`${name}: ${judgeData.error || "Failed to assign judge role"}`)
            }
          }
        })
      )

      const failures = addResults.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      )

      setEmailEntries((prev) => prev.filter((e) => !succeededEmails.has(e.email)))
      router.refresh()

      if (failures.length > 0) {
        throw failures[0].reason
      }

      if (duplicateEmails.length > 0) {
        setError(`Already added: ${duplicateEmails.join(", ")}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add judges")
    } finally {
      setResolving(false)
      setSubmittedEmails([])
    }
  }

  async function handleDeleteJudge(judgeId: string) {
    setHiddenIds((prev) => new Set(prev).add(judgeId))
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/judges/display/${judgeId}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to remove judge")
      }
      const data = await res.json()
      if (data.warning) {
        setError("Judge removed, but some linked data could not be cleaned up")
      }
      router.refresh()
    } catch (err) {
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(judgeId)
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to remove judge")
    }
  }

  function handleFieldChange(judgeId: string, field: string, value: string) {
    setLocalEdits((prev) => ({
      ...prev,
      [judgeId]: { ...(prev[judgeId] || {}), [field]: value || null },
    }))
  }

  async function handleFieldBlur(judgeId: string, field: string) {
    const value = localEdits[judgeId]?.[field]
    if (value === undefined) return
    if (field === "name" && !value?.trim()) return

    const original = initialJudges.find((j) => j.id === judgeId)
    if (!original) return

    const oldValue = (original as unknown as Record<string, unknown>)[field] as string | null
    if ((value || null) === (oldValue || null)) return

    const fieldKey = `${judgeId}:${field}`
    savingFieldsRef.current.add(fieldKey)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/judges/display/${judgeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value || null }),
        }
      )
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update judge")
      }
      savingFieldsRef.current.delete(fieldKey)
      router.refresh()
    } catch (err) {
      savingFieldsRef.current.delete(fieldKey)
      setLocalEdits((prev) => {
        const next = { ...prev }
        if (next[judgeId]) {
          delete next[judgeId][field]
          if (Object.keys(next[judgeId]).length === 0) delete next[judgeId]
        }
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to update")
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      if (emailEntries.length > 0 && !resolving) {
        handleAddFromChips()
      } else if (onSaveAndNext) {
        onSaveAndNext()
      } else {
        closeDrawer()
      }
    }
  }

  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      <FieldGroup>
        <Field>
          <FieldLabel>Invite Judges</FieldLabel>
          <EmailChipsInput
            hackathonId={hackathonId}
            entries={emailEntries}
            onAdd={(newEntries) => setEmailEntries((prev) => [...prev, ...newEntries])}
            onRemove={(email) => setEmailEntries((prev) => prev.filter((e) => e.email !== email))}
            existingEmails={submittedEmails}
          />
        </Field>

        {emailEntries.length > 0 && (
          <Button
            type="button"
            onClick={handleAddFromChips}
            disabled={resolving}
            className="w-full"
          >
            {resolving
              ? <Loader2 className="size-4 mr-2 animate-spin" />
              : <Plus className="size-4 mr-2" />}
            Add {emailEntries.length} judge{emailEntries.length > 1 ? "s" : ""}
          </Button>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}
      </FieldGroup>

      {visibleJudges.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">
            Judges ({visibleJudges.length})
          </h4>
          <div className="space-y-2">
            {visibleJudges.map((judge) => (
              <div
                key={judge.id}
                className="rounded-lg border p-3 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <JudgeHeadshotUpload
                    headshotUrl={judge.headshot_url}
                    hackathonId={hackathonId}
                    judgeId={judge.id}
                    initials={getInitials(judge.name)}
                    onUploaded={() => router.refresh()}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={judge.name}
                        onChange={(e) => handleFieldChange(judge.id, "name", e.target.value)}
                        onBlur={() => handleFieldBlur(judge.id, "name")}
                        placeholder="Name"
                        className="h-8 text-sm font-medium"
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteJudge(judge.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0 shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Input
                      value={judge.title ?? ""}
                      onChange={(e) => handleFieldChange(judge.id, "title", e.target.value)}
                      onBlur={() => handleFieldBlur(judge.id, "title")}
                      placeholder="Title"
                      className="h-8 text-sm"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <OrgAutocomplete
                      value={judge.organization ?? ""}
                      onChange={(value) => handleFieldChange(judge.id, "organization", value)}
                      onBlur={() => handleFieldBlur(judge.id, "organization")}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 pt-2">
        <Button type="button" variant="outline" onClick={closeDrawer}>
          Done
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>{" "}
            {onSaveAndNext ? "next" : "done"}
          </span>
        </div>
      </div>
    </div>
  )
}
