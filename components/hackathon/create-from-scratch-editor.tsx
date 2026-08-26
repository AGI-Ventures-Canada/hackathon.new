"use client"

import { CreateFlow } from "@/components/hackathon/create-flow/create-flow"
import {
  createDefaultHackathonDraft,
  createEmptyHackathonDraft,
  normalizeDraftTimestampsForSubmission,
  type DraftState,
} from "@/lib/hackathon-draft"
import { assertOkJson } from "@/lib/utils/fetch"

const emptyDraft = createEmptyHackathonDraft()

function createBrowserDraft() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return createDefaultHackathonDraft(new Date(), timeZone)
}

export async function submitHackathonDraft(
  state: DraftState,
  draftId: string,
  expectedOrganizationId: string,
) {
  const normalized = normalizeDraftTimestampsForSubmission(
    state,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  if (!normalized.ok) throw new Error(normalized.message)

  const res = await fetch("/api/dashboard/hackathons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...normalized.state,
      draftId,
      expectedOrganizationId,
    }),
  })

  return assertOkJson<{ id: string; slug: string }>(res)
}

export function CreateFromScratchEditor() {
  return (
    <CreateFlow
      initialState={emptyDraft}
      createInitialStateAfterMount={createBrowserDraft}
      onSubmit={submitHackathonDraft}
    />
  )
}
