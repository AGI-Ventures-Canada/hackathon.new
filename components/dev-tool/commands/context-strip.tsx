"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { EventContext } from "../use-event-context"

type Persona = { key: string; name: string }

interface ContextStripProps {
  eventContext: EventContext | null
  activePersona: Persona | null
  currentRoles: string[]
}

export function ContextStrip({
  eventContext,
  activePersona,
  currentRoles,
}: ContextStripProps) {
  const chips: { label: string; value: string; dim?: boolean }[] = []

  if (eventContext) {
    chips.push({ label: "Event", value: eventContext.slug })
    chips.push({ label: "Status", value: eventContext.status })
  } else {
    chips.push({
      label: "Context",
      value: "not on an event page",
      dim: true,
    })
  }

  if (activePersona) {
    chips.push({ label: "You", value: activePersona.name })
  }

  if (currentRoles.length > 0) {
    chips.push({ label: "Roles", value: currentRoles.join(", ") })
  } else if (eventContext) {
    chips.push({ label: "Roles", value: "none", dim: true })
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 border-b border-dashed px-3 py-2 text-[11px]"
      )}
    >
      {chips.map((chip, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-muted-foreground">{chip.label}:</span>
          <Badge
            variant="outline"
            className={cn(
              "h-4 px-1 text-[10px] font-normal",
              chip.dim && "text-muted-foreground"
            )}
          >
            {chip.value}
          </Badge>
        </div>
      ))}
    </div>
  )
}
