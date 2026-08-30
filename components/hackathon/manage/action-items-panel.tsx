"use client"

import { useState } from "react"
import { ClipboardList, ChevronRight, CircleCheck, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SEVERITY_GROUP_LABEL, type ActionSeverity } from "@/lib/utils/organizer-actions"
import { useIsClient } from "@/hooks/use-is-client"
import { useActionItems } from "./action-items-context"
import { ActionItemRow } from "./action-item-row"
import { AddItemInput } from "./add-item-input"

const groupOrder: ActionSeverity[] = ["urgent", "warning", "scheduled", "info"]

const groupColor: Record<ActionSeverity, string> = {
  urgent: "text-destructive",
  warning: "text-primary",
  scheduled: "text-muted-foreground",
  info: "text-muted-foreground",
}

type Props = {
  visible: boolean
}

function ActionItemsPanelBody() {
  const {
    activeItems,
    completedItems,
    addCustomItem,
    isStale,
    actionItemsError,
  } = useActionItems()
  const isClient = useIsClient()
  const transitionItems = activeItems.filter((item) => item.close.kind === "transition")
  const regularItems = activeItems.filter((item) => item.close.kind !== "transition")
  const groups = groupOrder
    .map((severity) => ({
      severity,
      label: SEVERITY_GROUP_LABEL[severity],
      items: regularItems.filter((item) => item.severity === severity),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <>
      {isStale && (
        <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          <WifiOff className="size-3 shrink-0" />
          <span>Updates may be outdated</span>
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {actionItemsError && (
          <p role="alert" className="px-2 text-xs text-destructive">{actionItemsError}</p>
        )}
        {isClient && groups.length === 0 && transitionItems.length === 0 && completedItems.length === 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CircleCheck className="mb-2 size-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">All caught up</p>
            </div>
            <div className="mx-2">
              <AddItemInput onAdd={addCustomItem} compact />
            </div>
          </div>
        ) : (
          <>
            {isClient && transitionItems.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-primary">
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
                <p className={cn("mb-1 px-2 text-xs font-semibold uppercase tracking-wide", groupColor[group.severity])}>
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
                  <AccordionTrigger className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
    </>
  )
}

export function ActionItemsPanel({ visible }: Props) {
  const { activeItems, remainingCount, panelOpen, setPanelOpen } = useActionItems()
  const isClient = useIsClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const hasUrgent = activeItems.some(
    (item) => item.severity === "urgent" || item.severity === "warning",
  )
  const expanded = visible && panelOpen

  return (
    <>
      {visible && (
        <div className="lg:hidden">
          <Button
            type="button"
            size="lg"
            variant={hasUrgent ? "default" : "outline"}
            aria-label="Open action items on mobile"
            className="fixed bottom-4 right-4 z-40 shadow-md"
            onClick={() => setMobileOpen(true)}
          >
            <ClipboardList className="size-5" />
            Action items
            {isClient && remainingCount > 0 && (
              <Badge variant={hasUrgent ? "secondary" : "count"} className="rounded-full px-1.5 text-xs">
                {remainingCount}
              </Badge>
            )}
          </Button>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent className="w-full p-0" aria-describedby="mobile-action-items-description">
              <SheetHeader className="border-b">
                <SheetTitle>Action items</SheetTitle>
                <SheetDescription id="mobile-action-items-description">
                  See what needs your attention now.
                </SheetDescription>
              </SheetHeader>
              <ActionItemsPanelBody />
            </SheetContent>
          </Sheet>
        </div>
      )}

      <div className="hidden shrink-0 lg:block">
        <div
          className={cn(
            "transition-[width] duration-300 ease-in-out",
            expanded ? "w-80" : "w-0",
          )}
        />

        {visible && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-label={panelOpen ? "Close action items" : "Open action items"}
            aria-expanded={panelOpen}
            aria-controls="action-items-panel"
            className={cn(
              "fixed top-16 z-50 shadow-md",
              panelOpen ? "right-[calc(20rem+0.25rem)]" : "right-2",
            )}
          >
            {panelOpen ? (
              <ChevronRight className="size-5" />
            ) : (
              <>
                <ClipboardList className="size-5" />
                {isClient && remainingCount > 0 && (
                  <Badge variant={hasUrgent ? "default" : "count"} className="absolute -right-2 -top-2 rounded-full px-1.5 text-xs">
                    {remainingCount}
                  </Badge>
                )}
              </>
            )}
          </Button>
        )}

        <div
          id="action-items-panel"
          className={cn(
            "fixed inset-y-0 right-0 z-30 hidden h-svh overflow-hidden transition-[width] duration-300 ease-in-out lg:flex",
            expanded ? "w-80" : "w-0",
          )}
          aria-hidden={!expanded}
          inert={expanded ? undefined : true}
        >
          <div className="flex h-full w-full flex-col border-l bg-muted">
            <div className="flex shrink-0 items-center border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Action items</h3>
            </div>
            <ActionItemsPanelBody />
          </div>
        </div>
      </div>
    </>
  )
}
