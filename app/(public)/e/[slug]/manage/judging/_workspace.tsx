import { notFound } from "next/navigation"
import { getManageHackathon } from "@/lib/services/manage-hackathon"
import { getJudgingSetup } from "@/lib/services/judging-setup"
import { JudgingOrganizerWorkspace } from "@/components/hackathon/judging/judging-organizer-workspace"
import type { JudgingDestination, JudgingEditor } from "@/lib/judging/setup"

export async function JudgingWorkspaceContent({slug, destination, edit}: {slug: string; destination: JudgingDestination; edit?: string}) {
  const event = await getManageHackathon(slug)
  if (!event.ok) notFound()
  const setup = await getJudgingSetup(event.hackathon.id)
  const editors: JudgingEditor[] = ["prizes", "scorecard", "judges", "schedule", "assignments", "notifications", "rounds"]
  const initialEditor = editors.find((editor) => editor === edit)
  return <JudgingOrganizerWorkspace key={setup.id} initialSetup={setup} destination={destination} initialEditor={initialEditor} />
}
