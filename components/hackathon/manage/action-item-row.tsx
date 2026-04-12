"use client"

import Link from "next/link"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"
import type { ActionItem, ActionSeverity } from "@/lib/utils/organizer-actions"
import { buildActionHref, useActionItems } from "./action-items-context"

const severityDotClass: Record<ActionSeverity, string> = {
  urgent: "bg-destructive",
  warning: "bg-primary",
  info: "bg-muted-foreground",
}

type Props = {
  item: ActionItem
  completed: boolean
  compact?: boolean
}

function WithTooltip({ tooltip, children }: { tooltip?: string; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  if (!tooltip) return <>{children}</>
  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-72 text-sm">
          {tooltip}
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="left" align="start" className="w-72 text-sm">
        {tooltip}
      </HoverCardContent>
    </HoverCard>
  )
}

export function ActionItemRow({ item, completed, compact }: Props) {
  const { toggleComplete, handleActionClick, removeCustomItem, slug } = useActionItems()
  const isCustom = item.id.startsWith("custom-")
  const href = buildActionHref(slug, item)
  const hasAction = !!item.action
  const isTransition = item.variant === "transition"

  if (isTransition) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleActionClick(item)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleActionClick(item) } }}
        className="group block w-full text-left rounded-md px-2 hover:bg-primary/5 transition-colors cursor-pointer border border-primary/20 bg-primary/5 my-1"
      >
        <span className={cn("flex items-center gap-3 py-2.5", compact && "py-2")}>
          <span className="flex-1 min-w-0">
            <span className={cn("text-sm font-medium block", compact && "text-sm")}>{item.label}</span>
            {!compact && item.hint && (
              <span className="text-xs text-muted-foreground block">{item.hint}</span>
            )}
          </span>
          {item.ctaLabel && (
            <Badge className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer">
              {item.ctaLabel}
            </Badge>
          )}
        </span>
      </div>
    )
  }

  const ctaBadge = item.ctaLabel && !completed ? (
    <Badge
      variant="outline"
      className="shrink-0 gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer"
    >
      <span className={cn("size-1.5 rounded-full", severityDotClass[item.severity])} />
      {item.ctaLabel}
    </Badge>
  ) : null

  const content = (
    <span className={cn("flex items-center gap-3 py-2.5", compact && "py-2")}>
      <span
        className="shrink-0"
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        <Checkbox
          checked={completed}
          onCheckedChange={() => toggleComplete(item.id)}
        />
      </span>
      <span className={cn("flex-1 min-w-0", completed && "opacity-50")}>
        <span className={cn("text-sm block", compact && "text-sm")}>{item.label}</span>
        {!compact && !completed && item.hint && (
          <span className="text-xs text-muted-foreground block">{item.hint}</span>
        )}
      </span>
      {ctaBadge}
      {isCustom && (
        <span
          role="button"
          tabIndex={0}
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeCustomItem(item.id) }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); removeCustomItem(item.id) } }}
        >
          <X className="size-3.5 text-muted-foreground" />
        </span>
      )}
    </span>
  )

  if (completed) {
    return <WithTooltip tooltip={item.tooltip}><div className="px-2">{content}</div></WithTooltip>
  }

  if (href) {
    return (
      <WithTooltip tooltip={item.tooltip}>
        <Link
          href={href}
          className="group block rounded-md px-2 hover:bg-muted transition-colors"
        >
          {content}
        </Link>
      </WithTooltip>
    )
  }

  if (hasAction) {
    return (
      <WithTooltip tooltip={item.tooltip}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleActionClick(item)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleActionClick(item) } }}
          className="group block w-full text-left rounded-md px-2 hover:bg-muted transition-colors cursor-pointer"
        >
          {content}
        </div>
      </WithTooltip>
    )
  }

  return <WithTooltip tooltip={item.tooltip}><div className="px-2">{content}</div></WithTooltip>
}
