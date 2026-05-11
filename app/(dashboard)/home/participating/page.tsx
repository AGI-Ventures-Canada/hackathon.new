import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { listParticipatingHackathons } from "@/lib/services/hackathons"
import { getSubmittedHackathonIds } from "@/lib/services/submissions"
import { ParticipatingDashboard } from "./participating-dashboard"

export default async function ParticipatingPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Participating</h1>
        <p className="text-muted-foreground mt-1">Your hackathon journey</p>
      </div>

      <Suspense fallback={<DashboardGridLoading />}>
        <ParticipatingContent userId={userId} />
      </Suspense>
    </div>
  )
}

async function ParticipatingContent({ userId }: { userId: string }) {
  const [hackathons, submittedIds] = await Promise.all([
    listParticipatingHackathons(userId),
    getSubmittedHackathonIds(userId),
  ])

  return (
    <ParticipatingDashboard
      hackathons={hackathons}
      submittedHackathonIds={Array.from(submittedIds)}
      showHeader={false}
    />
  )
}
