"use workflow"

import type { HackathonCreationFinalizationInput } from "@/lib/services/luma-import-create"

export async function hackathonCreationFinalizationWorkflow(
  input: HackathonCreationFinalizationInput,
): Promise<{ status: "complete" }> {
  const { runHackathonCreationFinalization } = await import("./steps")
  await runHackathonCreationFinalization(input)
  return { status: "complete" }
}
