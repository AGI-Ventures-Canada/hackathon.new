import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { resolvePageTenant } from "@/lib/services/tenants"
import { listSponsoredHackathons } from "@/lib/services/hackathons"
import { getSponsorshipDetails } from "@/lib/services/persona-stats"
import { SponsoringDashboard } from "@/components/hackathon/sponsoring-dashboard"

export default async function SponsoringPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

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
    />
  )
}
