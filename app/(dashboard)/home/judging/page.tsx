import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"
import { listJudgingHackathons } from "@/lib/services/hackathons"
import { getBatchJudgeStats } from "@/lib/services/persona-stats"
import { JudgingDashboard } from "./judging-dashboard"
import { listMyJudgeInvitations } from "@/lib/services/judging-home"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function JudgingPage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Judging</h1>
        <p className="text-muted-foreground mt-1">Your invitations and reviews</p>
      </div>

      <Suspense fallback={<DashboardGridLoading showProgress />}>
        <JudgingContent userId={userId} />
      </Suspense>
    </div>
  )
}

async function JudgingContent({ userId }: { userId: string }) {
  const [hackathons,invitations] = await Promise.all([listJudgingHackathons(userId),listMyJudgeInvitations(userId)])
  const judgeStats = await getBatchJudgeStats(
    hackathons.map((h) => h.id),
    userId,
  )
  const serializedStats = Object.fromEntries(judgeStats)

  return (
    <div className="space-y-6">
    {invitations.length > 0 && <section aria-label="Judging invitations" className="space-y-3"><h2 className="text-lg font-semibold">You&apos;re invited to judge</h2><div className="grid gap-4 sm:grid-cols-2">{invitations.map((invitation) => <Card key={invitation.id}><CardHeader><CardTitle>{invitation.eventName}</CardTitle></CardHeader><CardContent><div className="space-y-3"><p className="text-sm text-muted-foreground">Sent to {invitation.email}</p><Button asChild><Link href={`/judge-invite/${invitation.token}`}>Review invitation</Link></Button></div></CardContent></Card>)}</div></section>}
    <JudgingDashboard
      hackathons={hackathons}
      judgeStats={serializedStats}
      showHeader={false}
    />
    </div>
  )
}
