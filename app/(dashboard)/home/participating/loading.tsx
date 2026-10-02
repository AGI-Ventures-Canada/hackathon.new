import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"

export default function ParticipatingLoading() {
  return <div className="space-y-8"><div><h1 className="text-2xl font-semibold tracking-tight">Participating</h1><p className="mt-1 text-muted-foreground">Your hackathon journey</p></div><DashboardGridLoading /></div>
}
