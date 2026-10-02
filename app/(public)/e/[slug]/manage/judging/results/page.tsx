import { Suspense } from "react"
import { notFound } from "next/navigation"
import { getManageHackathon } from "@/lib/services/manage-hackathon"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { JudgingTabContent } from "../../_judging-tab"
import JudgingLoading from "../loading"
import { JudgingSetupWebMcpTools } from "@/components/hackathon/judging/judging-setup-webmcp-tools"

async function Results({slug}: {slug: string}) {
  const event = await getManageHackathon(slug)
  if (!event.ok) notFound()
  const hackathon = event.hackathon
  const submissions = await getHackathonSubmissions(hackathon.id)
  return <><JudgingSetupWebMcpTools hackathonId={hackathon.id} slug={slug} /><JudgingTabContent hackathonId={hackathon.id} slug={slug} submissions={submissions.map((item) => ({id: item.id, title: item.title}))} resultsPublishedAt={hackathon.results_published_at} activeJtab="results" locationType={hackathon.location_type} hackathonStatus={hackathon.status} hideNavigation /></>
}

export default async function JudgingResults({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  return <Suspense fallback={<JudgingLoading />}><Results slug={slug} /></Suspense>
}
