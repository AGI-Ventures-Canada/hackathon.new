"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"

export function useTeamRename(hackathonId: string, teamId: string, currentName: string) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEditing() {
    setEditing(true)
    setError(null)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function save() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === currentName) {
      setValue(currentName)
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/hackathons/${hackathonId}/teams/${teamId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to rename team")
      }
      setEditing(false)
      router.refresh()
    } catch (err) {
      setValue(currentName)
      setEditing(false)
      setError(err instanceof Error ? err.message : "Failed to rename team")
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setValue(currentName)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === "Escape") {
      cancel()
    }
  }

  return {
    editing,
    value,
    setValue,
    saving,
    error,
    inputRef,
    startEditing,
    save,
    cancel,
    handleKeyDown,
  }
}
