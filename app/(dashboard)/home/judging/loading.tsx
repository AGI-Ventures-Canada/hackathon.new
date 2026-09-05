import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"

export default function JudgingLoading() {
  return <div className="space-y-8"><div><h1 className="text-2xl font-semibold tracking-tight">Judging</h1><p className="mt-1 text-muted-foreground">Your invitations and reviews</p></div><DashboardGridLoading showProgress /></div>
}
