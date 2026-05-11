import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { resolvePageTenant } from "@/lib/services/tenants"
import { listOrganizedHackathons } from "@/lib/services/hackathons"
import { getBatchHackathonStats } from "@/lib/services/organizer-dashboard"
import { OrganizingDashboard } from "./organizing-dashboard"

export default async function OrganizingPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizing</h1>
        <p className="text-muted-foreground mt-1">Your events at a glance</p>
      </div>

      <Suspense fallback={<DashboardGridLoading />}>
        <OrganizingContent />
      </Suspense>
    </div>
  )
}

async function OrganizingContent() {
  const tenant = await resolvePageTenant()
  const hackathons = await listOrganizedHackathons(tenant.id)
  const stats = await getBatchHackathonStats(hackathons.map((h) => h.id))
  const serializedStats = Object.fromEntries(stats)

  return (
    <OrganizingDashboard
      hackathons={hackathons}
      stats={serializedStats}
      showHeader={false}
    />
  )
}
