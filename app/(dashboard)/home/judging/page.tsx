import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { listJudgingHackathons } from "@/lib/services/hackathons"
import { getBatchJudgeStats } from "@/lib/services/persona-stats"
import { JudgingDashboard } from "./judging-dashboard"

export default async function JudgingPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Judging</h1>
        <p className="text-muted-foreground mt-1">Your review queue</p>
      </div>

      <Suspense fallback={<DashboardGridLoading showProgress />}>
        <JudgingContent userId={userId} />
      </Suspense>
    </div>
  )
}

async function JudgingContent({ userId }: { userId: string }) {
  const hackathons = await listJudgingHackathons(userId)
  const judgeStats = await getBatchJudgeStats(
    hackathons.map((h) => h.id),
    userId,
  )
  const serializedStats = Object.fromEntries(judgeStats)

  return (
    <JudgingDashboard
      hackathons={hackathons}
      judgeStats={serializedStats}
      showHeader={false}
    />
  )
}
