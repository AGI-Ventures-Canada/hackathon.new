import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"

export default function SponsoringLoading() {
  return <div className="space-y-8"><div><h1 className="text-2xl font-semibold tracking-tight">Sponsoring</h1><p className="mt-1 text-muted-foreground">Your sponsorship portfolio</p></div><DashboardGridLoading statCards={3} /></div>
}
