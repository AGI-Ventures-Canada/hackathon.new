import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon, PUBLISHED_STATUSES } from "@/lib/services/public-hackathons"
import { PageHeader } from "@/components/page-header"
import { JudgeSummaryView } from "@/components/hackathon/judging/judge-summary-view"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function JudgeSummaryPage({ params }: PageProps) {
  const { slug } = await params
  const { userId } = await auth()

  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/e/${slug}/judge/summary`)}`)
  }

  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!hackathon) notFound()

  if (!PUBLISHED_STATUSES.includes(hackathon.status)) notFound()

  const { getRegistrationInfo } = await import("@/lib/services/hackathons")
  const registrationInfo = await getRegistrationInfo(hackathon.id, userId)

  if (registrationInfo.participantRole !== "judge") {
    redirect(`/e/${slug}`)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: hackathon.name, href: `/e/${slug}` },
          { label: "Judging", href: `/e/${slug}/judge` },
          { label: "Your summary" },
        ]}
        title="Your top picks"
        description="Only you can see this. Your scores stay private."
      />

      <JudgeSummaryView hackathonSlug={slug} />
    </div>
  )
}
