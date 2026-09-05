import { Suspense } from "react"
import { JudgingWorkspaceContent } from "../_workspace"
import JudgingLoading from "../loading"

export default async function JudgingPage({params, searchParams}: {params: Promise<{slug: string}>; searchParams: Promise<{edit?: string}>}) {
  const [{slug}, {edit}] = await Promise.all([params, searchParams])
  return <Suspense fallback={<JudgingLoading />}><JudgingWorkspaceContent slug={slug} destination="settings" edit={edit} /></Suspense>
}
