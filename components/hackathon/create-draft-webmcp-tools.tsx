"use client"

import { useEffect, useMemo, useState } from "react"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import type { DraftEnvelope, DraftPatch } from "@/lib/hackathon-draft"
import { WebMcpActionRegistry } from "@/lib/webmcp/action-registry"
import { createHackathonDraftTools } from "@/lib/webmcp/hackathon-draft-tools"
import type { TestEventStage } from "@/lib/fixtures/test-event"

type CreateDraftWebMcpToolsProps = {
  enabled: boolean
  canOpenSignIn: boolean
  envelope: DraftEnvelope
  onPatch: (expectedRevision: number, patch: DraftPatch) => DraftEnvelope
  onOpenReview: () => void
  onOpenTestEvent?: (stage: TestEventStage) => void
  onOpenSignIn: () => void
}

type DraftToolContext = {
  envelope: DraftEnvelope
  onPatch: CreateDraftWebMcpToolsProps["onPatch"]
  onOpenReview: CreateDraftWebMcpToolsProps["onOpenReview"]
  onOpenTestEvent: CreateDraftWebMcpToolsProps["onOpenTestEvent"]
  onOpenSignIn: CreateDraftWebMcpToolsProps["onOpenSignIn"]
}

export function CreateDraftWebMcpTools({
  enabled,
  canOpenSignIn,
  envelope,
  onPatch,
  onOpenReview,
  onOpenTestEvent,
  onOpenSignIn,
}: CreateDraftWebMcpToolsProps) {
  const [actionRegistry] = useState(
    () => new WebMcpActionRegistry<DraftToolContext, Record<never, never>>(
      { envelope, onPatch, onOpenReview, onOpenTestEvent, onOpenSignIn },
      {},
    ),
  )
  useEffect(() => {
    actionRegistry.update({ envelope, onPatch, onOpenReview, onOpenTestEvent, onOpenSignIn }, {})
  }, [actionRegistry, envelope, onOpenReview, onOpenSignIn, onOpenTestEvent, onPatch])

  const tools = useMemo(
    () =>
      createHackathonDraftTools({
        getEnvelope: () => actionRegistry.getContext().envelope,
        updateDraft: (expectedRevision, patch) =>
          actionRegistry.getContext().onPatch(expectedRevision, patch),
        openReview: () => actionRegistry.getContext().onOpenReview(),
        openTestEvent: actionRegistry.getContext().onOpenTestEvent
          ? (stage) => actionRegistry.getContext().onOpenTestEvent?.(stage)
          : undefined,
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
