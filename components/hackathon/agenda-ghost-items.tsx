"use client"

import { Button } from "@/components/ui/button"
import { Calendar, Plus, Zap } from "lucide-react"

export type GhostItem = {
  title: string
  startsAt: string
  endsAt: string
  triggerType: "submission_deadline" | null
}

export function buildGhostItems(startsAt: string, endsAt: string): GhostItem[] {
  const start = new Date(startsAt)
  const end = new Date(endsAt)

  function offset(base: Date, minutes: number): string {
    return new Date(base.getTime() + minutes * 60_000).toISOString()
  }

  return [
    {
      title: "Opening Kickoff",
      startsAt: start.toISOString(),
      endsAt: offset(start, 30),
      triggerType: null,
    },
    {
      title: "Hacking Begins",
      startsAt: offset(start, 30),
      endsAt: offset(start, 60),
      triggerType: null,
    },
    {
      title: "Submissions Close & Judging Starts",
      startsAt: end.toISOString(),
      endsAt: end.toISOString(),
      triggerType: "submission_deadline",
    },
    {
      title: "Presentations",
      startsAt: offset(end, -30),
      endsAt: end.toISOString(),
      triggerType: null,
    },
    {
      title: "Awards Ceremony",
      startsAt: end.toISOString(),
      endsAt: offset(end, 30),
      triggerType: null,
    },
  ]
}

function formatGhostTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

interface AgendaGhostItemsProps {
  startsAt: string
  endsAt: string
  onAddItem: (item: GhostItem) => void
  onAddAll: (items: GhostItem[]) => void
  disabled?: boolean
}

export function AgendaGhostItems({ startsAt, endsAt, onAddItem, onAddAll, disabled }: AgendaGhostItemsProps) {
  const items = buildGhostItems(startsAt, endsAt)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Suggested agenda</p>
        <Button variant="outline" size="sm" onClick={() => onAddAll(items)} disabled={disabled}>
          <Plus className="size-3.5" />
          {disabled ? "Adding..." : "Add all"}
        </Button>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.title}
            className={`flex items-center gap-3 rounded-lg border border-dashed p-3 text-muted-foreground ${item.triggerType ? "border-primary/30" : ""}`}
          >
            {item.triggerType ? (
              <Zap className="size-4 shrink-0 opacity-50 text-primary" />
            ) : (
              <Calendar className="size-4 shrink-0 opacity-50" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm">{item.title}</p>
              <p className="text-xs opacity-70">{formatGhostTime(item.startsAt)}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => onAddItem(item)}
              disabled={disabled}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
