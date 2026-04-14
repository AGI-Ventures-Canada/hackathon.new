"use client"

import { useRef, useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActionSeverity } from "@/lib/utils/organizer-actions"

const severities: { key: ActionSeverity; label: string; dot: string; active: string }[] = [
  { key: "urgent", label: "Blocker", dot: "bg-destructive", active: "border-destructive/50 bg-destructive/10 text-destructive" },
  { key: "warning", label: "Warning", dot: "bg-primary", active: "border-primary/50 bg-primary/10 text-primary" },
  { key: "info", label: "Optional", dot: "bg-muted-foreground", active: "border-muted-foreground/50 bg-muted-foreground/10" },
]

type Props = {
  onAdd: (label: string, severity?: ActionSeverity) => void
  compact?: boolean
}

export function AddItemInput({ onAdd, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [severity, setSeverity] = useState<ActionSeverity>("info")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function handleSubmit() {
    const value = inputRef.current?.value.trim()
    if (value) {
      onAdd(value, severity)
      inputRef.current!.value = ""
    }
  }

  function handleCancel() {
    if (inputRef.current) inputRef.current.value = ""
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors",
          compact ? "text-xs px-2" : "text-sm",
        )}
      >
        <Plus className={cn(compact ? "size-3.5" : "size-4")} />
        Add item
      </button>
    )
  }

  return (
    <div className={cn(
      "rounded-md border border-dashed border-muted-foreground/25",
      compact ? "px-2 py-1.5 space-y-1.5" : "px-2 py-2 space-y-2",
    )}>
      <input
        ref={inputRef}
        type="text"
        placeholder={compact ? "Add item..." : "What needs to be done?"}
        className={cn(
          "w-full bg-transparent outline-none placeholder:text-muted-foreground",
          compact ? "text-xs" : "text-sm",
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit()
          if (e.key === "Escape") handleCancel()
        }}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
      />
      <div className="flex items-center gap-1">
        {severities.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSeverity(s.key)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              severity === s.key
                ? s.active
                : "border-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            <span className={cn("size-1.5 rounded-full", s.dot)} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
