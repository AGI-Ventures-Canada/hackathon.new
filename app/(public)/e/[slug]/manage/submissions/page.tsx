import { notFound } from "next/navigation"
import { getManageHackathon } from "@/lib/services/manage-hackathon"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { getSubmissionScreenshotUrls } from "@/lib/utils/submission-screenshots"
import { PageHeader } from "@/components/page-header"
import { SubmissionGallery } from "@/components/hackathon/submission-gallery"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function SubmissionsPage({ params }: PageProps) {
  const { slug } = await params
  const result = await getManageHackathon(slug)

  if (!result.ok) {
    notFound()
  }

  const { hackathon } = result

  const rawSubmissions = await getHackathonSubmissions(hackathon.id)

  const submissions = rawSubmissions.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    githubUrl: s.github_url,
    liveAppUrl: s.live_app_url,
    demoVideoUrl: s.demo_video_url,
    screenshotUrl: s.screenshot_url,
    screenshotUrls: getSubmissionScreenshotUrls(s),
    submitter: s.submitter_name,
    createdAt: s.created_at,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/home" },
          { label: hackathon.name, href: `/e/${slug}/manage` },
          { label: "Submissions" },
        ]}
        title="Submissions"
        description={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""} for ${hackathon.name}`}
      />

      <div className="-mx-4 sm:mx-0">
        <SubmissionGallery submissions={submissions} />
      </div>
    </div>
  )
}
