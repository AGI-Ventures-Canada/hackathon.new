import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { listPublicHackathons } from "@/lib/services/public-hackathons"
import { BrowseHackathonGrid } from "@/components/hackathon/browse-hackathon-grid"

const PAGE_SIZE = 9

export default function BrowsePage(props: {
  searchParams: Promise<{ page?: string }>
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Browse Hackathons"
        description="Discover and join published hackathons"
      />

      <Suspense fallback={<DashboardGridLoading statCards={0} showSearch />}>
        <BrowseGridContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function BrowseGridContent({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const searchParams = await searchParamsPromise
  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1)
  const { hackathons, total } = await listPublicHackathons({ page, limit: PAGE_SIZE })

  const initialHackathons = hackathons.map((h) => ({
    id: h.id,
    slug: h.slug,
    name: h.name,
    description: h.description,
    status: h.status,
    startsAt: h.starts_at,
    endsAt: h.ends_at,
    registrationOpensAt: h.registration_opens_at,
    registrationClosesAt: h.registration_closes_at,
  }))

  return (
    <BrowseHackathonGrid
      initialHackathons={initialHackathons}
      initialPage={page}
      initialTotalPages={Math.ceil(total / PAGE_SIZE)}
    />
  )
}
