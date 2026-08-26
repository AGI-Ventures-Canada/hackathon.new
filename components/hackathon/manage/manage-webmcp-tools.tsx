"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import {
  createManageHackathonTools,
  type ManageHackathonWebMcpContext,
} from "@/lib/webmcp/manage-hackathon-tools"
import { useActionItems } from "./action-items-context"

type ManageHackathonWebMcpToolsProps = {
  context: ManageHackathonWebMcpContext
}

export function ManageHackathonWebMcpTools({
  context,
}: ManageHackathonWebMcpToolsProps) {
  const router = useRouter()
  const { hackathonStatus, activeItems } = useActionItems()
  const tools = useMemo(
    () =>
      createManageHackathonTools({
        context: {
          ...context,
          hackathon: { ...context.hackathon, status: hackathonStatus },
          actionItems: activeItems.map((item) => ({
            label: item.label,
            hint: item.hint ?? null,
            severity: item.severity,
          })),
        },
        fetcher: (input, init) => fetch(input, init),
        onChanged: (href) => {
          router.refresh()
          router.push(href)
        },
        onNavigate: (href) => router.push(href),
      }),
    [activeItems, context, hackathonStatus, router],
  )

  useWebMcpTools(tools)
  return null
}
