"use step"

import type { HackathonCreationFinalizationInput } from "@/lib/services/luma-import-create"

export async function runHackathonCreationFinalization(
  input: HackathonCreationFinalizationInput,
): Promise<void> {
  let result: Awaited<ReturnType<
    typeof import("@/lib/services/luma-import-create")["finalizeHackathonCreation"]
  >>
  try {
    const { finalizeHackathonCreation } = await import(
      "@/lib/services/luma-import-create"
    )
    result = await finalizeHackathonCreation(input)
  } catch {
    throw new Error("Event creation finalization could not be started.")
  }
  const { requireHackathonCreationFinalizationComplete } = await import(
    "@/lib/workflows/creation-finalization/result"
  )
  requireHackathonCreationFinalizationComplete(result)
}

runHackathonCreationFinalization.maxRetries = 12
