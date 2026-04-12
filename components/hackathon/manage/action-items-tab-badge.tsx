"use client"

import { useSyncExternalStore } from "react"
import { TabCount } from "@/components/ui/tab-count"
import { useActionItems } from "./action-items-context"

const emptySubscribe = () => () => {}

export function ActionItemsTabBadge() {
  const { remainingCount } = useActionItems()
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false)
  if (!isClient || remainingCount === 0) return null
  return <TabCount>{remainingCount}</TabCount>
}
