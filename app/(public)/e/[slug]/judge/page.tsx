import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getRegistrationInfo } from "@/lib/services/hackathons"
import { getJudgeAssignments, isJudgingOpenForHackathon, listRounds } from "@/lib/services/judging"
import { getJudgeDraftTargetIds } from "@/lib/services/judging-reviews"
import { JudgeWorkspace } from "@/components/hackathon/judging/judge-workspace"
import { JudgingInbox } from "@/components/hackathon/judging/judging-inbox"
import { PageHeader } from "@/components/page-header"
import { AutoRefresh } from "@/components/ui/auto-refresh"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { canWriteJudgingWindow, resolveJudgingWindow, type JudgingWindowEvent } from "@/lib/utils/judging-window"

export default async function JudgePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ review?: string }> }) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/e/${slug}/judge`)}`)
  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!hackathon) notFound()
  const registration = await getRegistrationInfo(hackathon.id, userId)
  if (registration.participantRole !== "judge") redirect(`/e/${slug}`)
  const settings = hackathon as typeof hackathon & JudgingWindowEvent & { judging_instructions?: string; judging_browse_enabled?: boolean }
  const [assignments, judgingPhaseOpen, draftTargetIds, query, activeAssignments, rounds] = await Promise.all([
    getJudgeAssignments(hackathon.id, userId, { includeClosedRounds: true }),
    isJudgingOpenForHackathon(hackathon),
    getJudgeDraftTargetIds(hackathon.id, userId),
    searchParams ?? Promise.resolve({ review: undefined }),
    getJudgeAssignments(hackathon.id, userId),
    listRounds(hackathon.id),
  ])
  const activeRound = rounds.find((round) => round.status === "active")
  const roundWindow = (round: typeof activeRound) => round ? { opens_at: round.opensAt, closes_at: round.closesAt } : null
  const window = resolveJudgingWindow(settings, roundWindow(activeRound))
  const writableAssignments = !judgingPhaseOpen || hackathon.results_published_at ? [] : activeAssignments.filter((assignment) => !assignment.selfJudging && canWriteJudgingWindow(settings, roundWindow(rounds.find((round) => round.id === assignment.roundId))))
  const canJudge = judgingPhaseOpen && !hackathon.results_published_at && (activeAssignments.length > 0 ? writableAssignments.length > 0 : canWriteJudgingWindow(settings, roundWindow(activeRound)))
  const timezone = settings.judging_timezone || "UTC"
  const formatTime = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value))
  const eligibleAssignments = assignments.filter((assignment) => !assignment.selfJudging)
  const safeAssignments = hackathon.anonymous_judging ? eligibleAssignments.map((assignment) => ({ ...assignment, teamName: null, teamMode: null, teamMemberCount: null, selfJudging: false })) : eligibleAssignments
  return <div className="space-y-6 p-4 md:p-6">
    <AutoRefresh intervalMs={30_000} enabled={hackathon.status !== "archived"} />
    <PageHeader breadcrumbs={[{ label: hackathon.name, href: `/e/${slug}` }, { label: "Judging" }]} title={`Judge ${hackathon.name}`} description="Your projects, reviews, and next steps in one place." />
    <Card><CardHeader><CardTitle>{canJudge ? "Judging is open" : window.state === "closed" || hackathon.results_published_at || ["completed","archived"].includes(hackathon.status) ? "Judging is closed" : window.state === "upcoming" ? "Judging opens soon" : window.state === "invalid" ? "Judging dates need an update" : "You're on the judge list"}</CardTitle></CardHeader><CardContent><div className="space-y-3">
      {window.state !== "invalid" && window.opensAt && window.closesAt ? <p className="text-sm">{formatTime(window.opensAt)} – {formatTime(window.closesAt)} ({timezone})</p> : <p className="text-sm text-muted-foreground">{canJudge ? "Your organizer will let you know when reviews are due." : "Your organizer will let you know when judging opens. You can prepare here."}</p>}
      {settings.judging_instructions ? <p className="whitespace-pre-wrap text-sm">{settings.judging_instructions}</p> : <p className="text-sm text-muted-foreground">Open an assigned project. Review its demo, then fill in the scorecard. Drafts save as you go; submit when you&apos;re ready.</p>}
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/e/${slug}`}>Event details and contact</Link></Button>{hackathon.results_published_at && <Button asChild variant="outline"><Link href={`/e/${slug}/winners`}>See the winners</Link></Button>}</div>
    </div></CardContent></Card>
    <JudgeWorkspace slug={slug} assignments={safeAssignments} activeAssignmentIds={writableAssignments.map((assignment) => assignment.id)} draftTargetIds={draftTargetIds} initialReview={query.review} canJudge={canJudge} browseEnabled={settings.judging_browse_enabled ?? false} />
    <JudgingInbox hackathonId={hackathon.id} />
  </div>
}
