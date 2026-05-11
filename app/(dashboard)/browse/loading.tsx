import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { PageHeader } from "@/components/page-header"

export default function BrowseLoading() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Browse Hackathons"
        description="Discover and join published hackathons"
      />

      <DashboardGridLoading
        statCards={0}
        cardCount={9}
        showSearch
        showPagination
      />
    </div>
  )
}
