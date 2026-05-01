import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { resolvePageTenant } from "@/lib/services/tenants"
import { MissingSupabaseCredentialsError } from "@/lib/db/client"
import {
  listParticipatingHackathons,
  listOrganizedHackathons,
  listSponsoredHackathons,
  listJudgingHackathons,
} from "@/lib/services/hackathons"
import { getSubmittedHackathonIds } from "@/lib/services/submissions"
import { getBatchHackathonStats } from "@/lib/services/organizer-dashboard"
import { HackathonTabs } from "./hackathon-tabs"

const emptyDashboardData = {
  myHackathons: [],
  organizedHackathons: [],
  sponsoredHackathons: [],
  judgingHackathons: [],
  submittedHackathonIds: [],
  organizedStats: {},
}

async function getDashboardData(userId: string) {
  try {
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

    return {
      myHackathons,
      organizedHackathons: organized.hackathons,
      sponsoredHackathons,
      judgingHackathons,
      submittedHackathonIds: Array.from(submittedHackathonIds),
      organizedStats: Object.fromEntries(organized.stats),
    }
  } catch (error) {
    if (error instanceof MissingSupabaseCredentialsError) {
      console.warn("Supabase credentials are missing; dashboard data is unavailable.")
      return emptyDashboardData
    }

    throw error
  }
}

export default async function DashboardPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const dashboardData = await getDashboardData(userId)

  return (
    <div className="space-y-6">
      <HackathonTabs {...dashboardData} />
    </div>
  )
}
