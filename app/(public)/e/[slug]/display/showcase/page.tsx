import { notFound } from "next/navigation"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getPresenterView, resolvePresenterSubmissions } from "@/lib/services/presenter-views"
import { isValidUuid } from "@/lib/utils/uuid"
import { FullscreenShowcase } from "@/components/hackathon/display/fullscreen-showcase"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ view?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  return {
    title: hackathon ? `Showcase | ${hackathon.name}` : "Showcase",
  }
}

export default async function DisplayShowcasePage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { view: viewId } = await searchParams

  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!hackathon) notFound()

  if (!viewId || !isValidUuid(viewId)) {
    return (
      <FullscreenShowcase
        hackathonName={hackathon.name}
        viewName={null}
        submissions={[]}
        message="Open this page from the Showcase dialog in the dashboard. Pick a view first, then copy or open its link."
      />
    )
  }

  const view = await getPresenterView(viewId)
  if (!view || view.hackathon_id !== hackathon.id) {
    return (
      <FullscreenShowcase
        hackathonName={hackathon.name}
        viewName={null}
        submissions={[]}
        message="That showcase view wasn't found. The organizer may have deleted it."
      />
    )
  }

  const submissions = await resolvePresenterSubmissions(view)

  return (
    <FullscreenShowcase
      hackathonName={hackathon.name}
      viewName={view.name}
      submissions={submissions.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        liveAppUrl: s.live_app_url,
        demoVideoUrl: s.demo_video_url,
        screenshotUrl: s.screenshot_url,
        submitter: s.submitter_name,
      }))}
      message={
        submissions.length === 0
          ? "No projects yet. Once teams advance into this round (or you tick projects in the dialog), they'll show up here."
          : null
      }
    />
  )
}
