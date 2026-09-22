import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"

export default function OrganizingLoading() {
  return <div className="space-y-8"><div><h1 className="text-2xl font-semibold tracking-tight">Organizing</h1><p className="mt-1 text-muted-foreground">Your events at a glance</p></div><DashboardGridLoading /></div>
}
