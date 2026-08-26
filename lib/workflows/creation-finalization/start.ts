import type { HackathonCreationFinalizationInput } from "@/lib/services/luma-import-create"

export async function startHackathonCreationFinalizationWorkflow(
  input: HackathonCreationFinalizationInput,
): Promise<string | null> {
  try {
    const { start } = await import("workflow/api")
    const { hackathonCreationFinalizationWorkflow } = await import("./workflow")
    const run = await start(hackathonCreationFinalizationWorkflow, [input])
    return run.runId
  } catch (error) {
    console.error("Failed to start event creation finalization workflow:", error)
    return null
  }
}
