"use client"

import { useActionItems } from "./action-items-context"
import { TabCount } from "@/components/ui/tab-count"

export function ManageHackathonName() {
  const { manageWebMcpView } = useActionItems()
  return (
    <h1 className="text-lg font-semibold">
      {manageWebMcpView.details.name}
    </h1>
  )
}

export function ManageHackathonTabCount({
  kind,
}: {
  kind: "challenges" | "prizes"
}) {
  const { manageWebMcpView } = useActionItems()
  const count = manageWebMcpView[kind].length
  return count > 0 ? <TabCount>{count}</TabCount> : null
}
