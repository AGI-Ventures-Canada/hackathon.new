"use client"

import { useState } from "react"
import { CircleCheck, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { SEVERITY_GROUP_LABEL, type ActionSeverity } from "@/lib/utils/organizer-actions"
import { useActionItems } from "./action-items-context"
import { ActionItemRow } from "./action-item-row"
import { AddItemInput } from "./add-item-input"

const groupOrder: ActionSeverity[] = ["urgent", "warning", "info"]

const groupColor: Record<ActionSeverity, string> = {
  urgent: "text-destructive",
  warning: "text-primary",
  info: "text-muted-foreground",
}

export function ActionItemsTab() {
  const { activeItems, completedItems, addCustomItem, remainingCount, totalCount } = useActionItems()

  const transitionItems = activeItems.filter((i) => i.variant === "transition")
  const regularItems = activeItems.filter((i) => i.variant !== "transition")

  const completedCount = totalCount - remainingCount
  const progressValue = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  const groups = groupOrder
    .map((severity) => ({
      severity,
      label: SEVERITY_GROUP_LABEL[severity],
      items: regularItems.filter((i) => i.severity === severity),
    }))
    .filter((g) => g.items.length > 0)

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CircleCheck className="size-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No action items</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <p className="text-muted-foreground">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{completedCount}</span>
          {" "}of {totalCount} complete
        </p>
        <Progress value={progressValue} />
      </div>

      {transitionItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
            NEXT STEP
          </p>
          <div className="space-y-1">
            {transitionItems.map((item) => (
              <ActionItemRow key={item.id} item={item} completed={false} />
            ))}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.severity}>
          <p className={cn("text-xs font-semibold uppercase tracking-wide mb-2", groupColor[group.severity])}>
            {group.label}
          </p>
          <div className="divide-y divide-border">
            {group.items.map((item) => (
              <ActionItemRow key={item.id} item={item} completed={false} />
            ))}
          </div>
        </div>
      ))}

      <AddItemInput onAdd={addCustomItem} />

      {completedItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            COMPLETED
          </p>
          <div className="divide-y divide-border">
            {completedItems.map((item) => (
              <ActionItemRow key={item.id} item={item} completed={true} />
            ))}
          </div>
        </div>
      )}

      {remainingCount === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CircleCheck className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">All caught up</p>
        </div>
      )}
    </div>
  )
}
