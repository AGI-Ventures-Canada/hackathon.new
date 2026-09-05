"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import { createDirectActionTools } from "@/lib/webmcp/direct-action-tools"
import { WebMcpActionRegistry } from "@/lib/webmcp/action-registry"

export function DirectWebMcpTools() {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth()
  const router = useRouter()
  const scope = `${isLoaded}:${isSignedIn}:${userId}:${orgId}`
  const [session] = useState(() => new WebMcpActionRegistry({ scope }, {}))
  useEffect(() => {
    session.update({ scope }, {})
    return () => { session.update({ scope: "closed" }, {}) }
  }, [scope, session])
  const tools = useMemo(() => isLoaded && isSignedIn && userId
    ? createDirectActionTools({ fetcher: fetch, onSaved: () => router.refresh(), isCurrent: () => session.getContext().scope === scope, organizationId: orgId })
    : [], [isLoaded, isSignedIn, userId, scope, orgId, router, session])
  useWebMcpTools(tools)
  return null
}
