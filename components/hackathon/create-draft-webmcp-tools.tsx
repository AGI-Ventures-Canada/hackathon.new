"use client"

import { useEffect, useMemo, useState } from "react"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import type { DraftEnvelope, DraftPatch } from "@/lib/hackathon-draft"
import { WebMcpActionRegistry } from "@/lib/webmcp/action-registry"
import { createHackathonDraftTools } from "@/lib/webmcp/hackathon-draft-tools"

type CreateDraftWebMcpToolsProps = {
  enabled: boolean
  canOpenSignIn: boolean
  envelope: DraftEnvelope
  onPatch: (expectedRevision: number, patch: DraftPatch) => DraftEnvelope
  onOpenReview: () => void
  onOpenSignIn: () => void
}

type DraftToolContext = {
  envelope: DraftEnvelope
  onPatch: CreateDraftWebMcpToolsProps["onPatch"]
  onOpenReview: CreateDraftWebMcpToolsProps["onOpenReview"]
  onOpenSignIn: CreateDraftWebMcpToolsProps["onOpenSignIn"]
}

export function CreateDraftWebMcpTools({
  enabled,
  canOpenSignIn,
  envelope,
  onPatch,
  onOpenReview,
  onOpenSignIn,
}: CreateDraftWebMcpToolsProps) {
  const [actionRegistry] = useState(
    () => new WebMcpActionRegistry<DraftToolContext, Record<never, never>>(
      { envelope, onPatch, onOpenReview, onOpenSignIn },
      {},
    ),
  )
  useEffect(() => {
    actionRegistry.update({ envelope, onPatch, onOpenReview, onOpenSignIn }, {})
  }, [actionRegistry, envelope, onOpenReview, onOpenSignIn, onPatch])

  const tools = useMemo(
    () =>
      createHackathonDraftTools({
        getEnvelope: () => actionRegistry.getContext().envelope,
        updateDraft: (expectedRevision, patch) =>
          actionRegistry.getContext().onPatch(expectedRevision, patch),
        openReview: () => actionRegistry.getContext().onOpenReview(),
        openSignIn: canOpenSignIn
          ? () => actionRegistry.getContext().onOpenSignIn()
          : undefined,
      }),
    [actionRegistry, canOpenSignIn],
  )
  const registeredTools = useMemo(() => enabled ? tools : [], [enabled, tools])

  useWebMcpTools(registeredTools)
  return null
}
