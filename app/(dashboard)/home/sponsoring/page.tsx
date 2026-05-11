import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { resolvePageTenant } from "@/lib/services/tenants"
import { listSponsoredHackathons } from "@/lib/services/hackathons"
import { getSponsorshipDetails } from "@/lib/services/persona-stats"
import { SponsoringDashboard } from "@/components/hackathon/sponsoring-dashboard"

export default async function SponsoringPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sponsoring</h1>
        <p className="text-muted-foreground mt-1">Your sponsorship portfolio</p>
      </div>

      <Suspense fallback={<DashboardGridLoading statCards={3} />}>
        <SponsoringContent />
      </Suspense>
    </div>
  )
}

async function SponsoringContent() {
  const tenant = await resolvePageTenant()
  const hackathons = await listSponsoredHackathons(tenant.id)
  const sponsorships = await getSponsorshipDetails(
    tenant.id,
    hackathons.map((h) => h.id),
  )
  const serializedSponsorships = Object.fromEntries(sponsorships)

  return (
    <SponsoringDashboard
      hackathons={hackathons}
      sponsorships={serializedSponsorships}
      showHeader={false}
    />
  )
}
