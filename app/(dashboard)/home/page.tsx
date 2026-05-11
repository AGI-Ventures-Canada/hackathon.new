import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { resolvePageTenant } from "@/lib/services/tenants"
import {
  listParticipatingHackathons,
  listOrganizedHackathons,
  listSponsoredHackathons,
  listJudgingHackathons,
} from "@/lib/services/hackathons"
import { getSubmittedHackathonIds } from "@/lib/services/submissions"
import { getBatchHackathonStats } from "@/lib/services/organizer-dashboard"
import { HackathonTabs } from "./hackathon-tabs"

export default async function DashboardPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  return (
    <Suspense fallback={<DashboardGridLoading statCards={0} showSearch />}>
      <DashboardHomeContent userId={userId} />
    </Suspense>
  )
}

async function DashboardHomeContent({ userId }: { userId: string }) {
  const tenant = await resolvePageTenant()

  const organizedWithStats = listOrganizedHackathons(tenant.id).then(async (hackathons) => {
    const stats = await getBatchHackathonStats(hackathons.map((h) => h.id))
    return { hackathons, stats }
  })

  const [myHackathons, organized, sponsoredHackathons, judgingHackathons, submittedHackathonIds] = await Promise.all([
    listParticipatingHackathons(userId),
    organizedWithStats,
    listSponsoredHackathons(tenant.id),
    listJudgingHackathons(userId),
    getSubmittedHackathonIds(userId),
  ])

  const organizedHackathons = organized.hackathons
  const serializedStats = Object.fromEntries(organized.stats)

  return (
    <div className="space-y-6">
      <HackathonTabs
        myHackathons={myHackathons}
        organizedHackathons={organizedHackathons}
        sponsoredHackathons={sponsoredHackathons}
        judgingHackathons={judgingHackathons}
        submittedHackathonIds={Array.from(submittedHackathonIds)}
        organizedStats={serializedStats}
      />
    </div>
  )
}
