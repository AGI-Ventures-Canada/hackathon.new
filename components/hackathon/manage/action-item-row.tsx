"use client"

import Link from "next/link"
import { Info, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  scheduled: "bg-muted-foreground",
  info: "bg-muted-foreground",
}

type Props = {
  item: ActionItem
  completed: boolean
  compact?: boolean
}

function WithTooltip({
  tooltip,
  label,
  children,
}: {
  tooltip?: string
  label: string
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  if (!tooltip) return <>{children}</>
  if (isMobile) {
    return (
      <>
        {children}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              aria-label={`More information: ${label}`}
            >
              <Info className="size-3.5" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-72 text-sm">
            {tooltip}
          </PopoverContent>
        </Popover>
      </>
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
  const { toggleComplete, dismissItem, handleActionClick, removeCustomItem, slug } = useActionItems()
  const isCustom = item.id.startsWith("custom-")
  const href = buildActionHref(slug, item)
  const hasAction = !!item.action
  const isTransition = item.close.kind === "transition"
  const canToggle = item.close.kind === "manual"
  const canDismiss = item.close.kind === "dismiss"

  if (isTransition) {
    return (
      <Button
        type="button"
        size={compact ? "sm" : "default"}
        variant={compact ? "default" : "outline"}
        onClick={() => handleActionClick(item)}
        className="h-auto w-full justify-start text-left"
      >
        {compact ? (item.ctaLabel || item.label) : (
          <span className="flex w-full items-center gap-3 py-1">
          <span className="flex-1 min-w-0">
            <span className="text-sm font-medium block">{item.label}</span>
            {item.hint && (
              <span className="text-xs text-muted-foreground block">{item.hint}</span>
            )}
          </span>
          {item.ctaLabel && (
            <Badge className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer">
              {item.ctaLabel}
            </Badge>
          )}
          </span>
        )}
      </Button>
    )
  }

  const ctaBadge = item.ctaLabel && !completed && !compact ? (
    <Badge
      variant="outline"
      className="shrink-0 gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer"
    >
      <span className={cn("size-1.5 rounded-full", severityDotClass[item.severity])} />
      {item.ctaLabel}
    </Badge>
  ) : null

  const mainContent = (
    <span className={cn("flex min-w-0 flex-1 items-center gap-3 py-2.5", compact && "py-2", completed && "opacity-50")}>
      <span className="min-w-0 flex-1">
        <span className={cn("text-sm block", compact && "text-sm")}>{item.label}</span>
        {!compact && !completed && item.hint && (
          <span className="text-xs text-muted-foreground block">{item.hint}</span>
        )}
      </span>
      {ctaBadge}
    </span>
  )

  let target: React.ReactNode = mainContent
  if (!completed && href) {
    target = (
        <Link
          href={href}
          onClick={(e) => { e.preventDefault(); handleActionClick(item) }}
          className="flex min-w-0 flex-1 rounded-md hover:bg-muted"
        >
          {mainContent}
        </Link>
    )
  } else if (!completed && hasAction) {
    target = (
        <button
          type="button"
          onClick={() => handleActionClick(item)}
          className="flex min-w-0 flex-1 rounded-md text-left hover:bg-muted"
        >
          {mainContent}
        </button>
    )
  }

  return (
    <div className="group flex items-center gap-2 px-2">
      <Checkbox
        checked={completed}
        disabled={!canToggle}
        aria-label={
          canToggle
            ? `${completed ? "Reopen" : "Complete"}: ${item.label}`
            : `Status is updated automatically: ${item.label}`
        }
        onCheckedChange={canToggle ? () => toggleComplete(item.id) : undefined}
      />
      <WithTooltip tooltip={item.tooltip} label={item.label}>{target}</WithTooltip>
      {(isCustom || (canDismiss && !completed)) && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={isCustom ? `Remove custom item: ${item.label}` : `Dismiss: ${item.label}`}
          className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          onClick={() => {
            if (isCustom) removeCustomItem(item.id)
            else dismissItem(item.id)
          }}
        >
          <X className="size-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  )
}
