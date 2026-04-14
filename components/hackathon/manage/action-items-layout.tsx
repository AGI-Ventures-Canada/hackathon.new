"use client"

import { useOptimisticTab } from "@/app/(public)/e/[slug]/manage/_tabs-url-sync"
import { ActionItemsPanel } from "./action-items-panel"

export function ActionItemsLayout({ children }: { children: React.ReactNode }) {
  const optimisticTab = useOptimisticTab()
  const currentTab = optimisticTab ?? "action-items"
  const showPanel = currentTab !== "action-items"

  return (
    <div className="flex gap-0">
      <div className="flex-1 min-w-0 space-y-6">{children}</div>
      <ActionItemsPanel visible={showPanel} />
    </div>
  )
}
