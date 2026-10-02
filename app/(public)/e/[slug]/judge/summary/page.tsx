import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getRegistrationInfo } from "@/lib/services/hackathons"
import { getJudgeAssignments } from "@/lib/services/judging"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function JudgeSummaryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/e/${slug}/judge/summary`)}`)
  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!hackathon) notFound()
  const registration = await getRegistrationInfo(hackathon.id,userId)
  if (registration.participantRole !== "judge") redirect(`/e/${slug}`)
  const assignments = await getJudgeAssignments(hackathon.id,userId,{ includeClosedRounds: true })
  const reviews = new Map<string,{ title: string; prizeName: string | null }>()
  for (const assignment of assignments.filter((item) => item.isComplete)) {
    const picks = assignment.judgingStyle === "judges_pick" && assignment.prizeId
    reviews.set(picks || assignment.id,{ title: picks ? `Your picks for ${assignment.prizeName || "this prize"}` : assignment.submissionTitle, prizeName: assignment.prizeName })
  }
  return <div className="space-y-6 p-4 md:p-6">
    <PageHeader breadcrumbs={[{ label: hackathon.name,href: `/e/${slug}` },{ label: "Judging",href: `/e/${slug}/judge` },{ label: "Your reviews" }]} title="Your submitted reviews" description="Open any review to read your scores, choices, and notes." />
    <p className="text-sm text-muted-foreground">{reviews.size} reviews submitted. Changes to a draft don&apos;t replace a submitted review until you save them.</p>
    <div className="grid gap-4 sm:grid-cols-2">{[...reviews].map(([id,review]) => <Card key={id}><CardHeader><CardTitle>{review.title}</CardTitle></CardHeader><CardContent><div className="space-y-3">{review.prizeName && <p className="text-sm text-muted-foreground">{review.prizeName}</p>}<Button asChild variant="outline"><Link href={`/e/${slug}/judge?review=${id}`}>Open review</Link></Button></div></CardContent></Card>)}</div>
    {reviews.size === 0 && <p>No reviews are submitted yet. Your drafts are in your judging workspace.</p>}
    <Button asChild variant="outline"><Link href={`/e/${slug}/judge`}>Back to projects</Link></Button>
  </div>
}
