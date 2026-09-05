"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import { createJudgingSetupTools } from "@/lib/webmcp/judging-setup-tools"

export function JudgingSetupWebMcpTools({
  hackathonId,
  slug,
}: {
  hackathonId: string
  slug: string
}) {
  const router = useRouter()
  const tools = useMemo(
    () =>
      createJudgingSetupTools({
        hackathonId,
        slug,
        fetcher: fetch,
        navigate: (href) => router.push(href),
        refresh: () => router.refresh(),
      }),
    [hackathonId, slug, router],
  )
  useWebMcpTools(tools)
  return null
}
