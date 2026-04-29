"use client"

import { TabCount } from "@/components/ui/tab-count"
import { useIsClient } from "@/hooks/use-is-client"
import { useActionItems } from "./action-items-context"

export function ActionItemsTabBadge() {
  const { remainingCount } = useActionItems()
  const isClient = useIsClient()
  if (!isClient || remainingCount === 0) return null
  return <TabCount>{remainingCount}</TabCount>
}
