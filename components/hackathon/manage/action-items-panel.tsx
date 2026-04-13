"use client"

import { useSyncExternalStore } from "react"
import { ClipboardList, ChevronRight, CircleCheck, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { SEVERITY_GROUP_LABEL, type ActionSeverity } from "@/lib/utils/organizer-actions"
import { useActionItems } from "./action-items-context"
import { ActionItemRow } from "./action-item-row"
import { AddItemInput } from "./add-item-input"

const emptySubscribe = () => () => {}

const groupOrder: ActionSeverity[] = ["urgent", "warning", "info"]

const groupColor: Record<ActionSeverity, string> = {
  urgent: "text-destructive",
  warning: "text-primary",
  info: "text-muted-foreground",
}

type Props = {
  visible: boolean
}

export function ActionItemsPanel({ visible }: Props) {
  const { activeItems, completedItems, addCustomItem, remainingCount, panelOpen, setPanelOpen, isStale } = useActionItems()
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false)

  const hasUrgent = activeItems.some((i) => i.severity === "urgent" || i.severity === "warning")
  const transitionItems = activeItems.filter((i) => i.variant === "transition")
  const regularItems = activeItems.filter((i) => i.variant !== "transition")

  const groups = groupOrder
    .map((severity) => ({
      severity,
      label: SEVERITY_GROUP_LABEL[severity],
      items: regularItems.filter((i) => i.severity === severity),
    }))
    .filter((g) => g.items.length > 0)

  const expanded = visible && panelOpen

  return (
    <div className="hidden lg:block shrink-0">
      <div
        className={cn(
          "transition-[width] duration-300 ease-in-out",
          expanded ? "w-72" : "w-0",
        )}
      />

      {visible && (
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className={cn(
            "fixed z-50 flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2.5 text-sm shadow-md transition-colors hover:bg-muted",
            "top-16",
            panelOpen ? "right-[calc(18rem+0.25rem)]" : "right-2",
            !panelOpen && hasUrgent && remainingCount > 0 && "border-primary/50 bg-primary/5",
          )}
        >
          {panelOpen ? (
            <ChevronRight className="size-5" />
          ) : (
            <>
              <ClipboardList className="size-5" />
              {isClient && remainingCount > 0 && (
                <Badge variant={hasUrgent ? "default" : "count"} className="rounded-full px-1.5 text-xs">
                  {remainingCount}
                </Badge>
              )}
            </>
          )}
        </button>
      )}

      <div
        className={cn(
          "fixed inset-y-0 right-0 z-30 hidden h-svh lg:flex",
          "transition-[width] duration-300 ease-in-out overflow-hidden",
          expanded ? "w-72" : "w-0",
        )}
      >
        <div className="flex h-full w-full flex-col border-l bg-muted">
          <div className="flex items-center border-b px-4 py-3 shrink-0">
            <h3 className="text-sm font-semibold">Action Items</h3>
          </div>

          {isStale && (
            <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
              <WifiOff className="size-3 shrink-0" />
              <span>Updates may be outdated</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
            {isClient && groups.length === 0 && transitionItems.length === 0 && completedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CircleCheck className="size-6 text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">All caught up</p>
              </div>
            ) : (
              <>
                {isClient && transitionItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1 px-2">
                      NEXT STEP
                    </p>
                    <div className="space-y-1">
                      {transitionItems.map((item) => (
                        <ActionItemRow key={item.id} item={item} completed={false} compact />
                      ))}
                    </div>
                  </div>
                )}

                {isClient && groups.map((group) => (
                  <div key={group.severity}>
                    <p className={cn("text-xs font-semibold uppercase tracking-wide mb-1 px-2", groupColor[group.severity])}>
                      {group.label} ({group.items.length})
                    </p>
                    <div className="divide-y divide-border">
                      {group.items.map((item) => (
                        <ActionItemRow key={item.id} item={item} completed={false} compact />
                      ))}
                    </div>
                  </div>
                ))}

                <div className="mx-2">
                  <AddItemInput onAdd={addCustomItem} compact />
                </div>

                {isClient && completedItems.length > 0 && (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="completed" className="border-none">
                      <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2">
                        COMPLETED ({completedItems.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="divide-y divide-border">
                          {completedItems.map((item) => (
                            <ActionItemRow key={item.id} item={item} completed={true} compact />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
