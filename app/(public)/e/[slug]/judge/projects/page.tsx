import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getRegistrationInfo } from "@/lib/services/hackathons"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { JudgeProjectBrowser } from "@/components/hackathon/judging/judge-project-browser"

export default async function JudgeProjectsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/e/${slug}/judge/projects`)}`)
  const event = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!event || !(event as typeof event & { judging_browse_enabled?: boolean }).judging_browse_enabled) notFound()
  const registration = await getRegistrationInfo(event.id, userId)
  if (registration.participantRole !== "judge") notFound()
  const projects = await getHackathonSubmissions(event.id)
  return <div className="space-y-6 p-4 md:p-6"><PageHeader title="Browse projects" description="Explore the work. You can only score projects in your assigned queue." breadcrumbs={[{ label: event.name, href: `/e/${slug}` }, { label: "Judging", href: `/e/${slug}/judge` }, { label: "Projects" }]} /><Button asChild variant="outline"><Link href={`/e/${slug}/judge`}>Back to your reviews</Link></Button><JudgeProjectBrowser projects={projects.map((project) => ({ submissionId: project.id, submissionTitle: project.title, submissionDescription: project.description, submissionGithubUrl: project.github_url, submissionLiveAppUrl: project.live_app_url, submissionDemoVideoUrl: project.demo_video_url, submissionScreenshotUrl: project.screenshot_url, teamName: event.anonymous_judging ? null : project.submitter_name }))} /></div>
}
