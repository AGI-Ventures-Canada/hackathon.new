import { notFound, redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { JudgeAssignmentsCard } from "@/components/hackathon/judging/judge-assignments-card"
import { PageHeader } from "@/components/page-header"
import { Clock } from "lucide-react"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function JudgePage({ params }: PageProps) {
  const { slug } = await params
  const { userId } = await auth()

  if (!userId) {
    redirect(`/e/${slug}`)
  }

  const hackathon = await getPublicHackathon(slug)
  if (!hackathon) {
    const draftHackathon = await getPublicHackathon(slug, { includeUnpublished: true })
    if (draftHackathon && userId) {
      const { getRegistrationInfo } = await import("@/lib/services/hackathons")
      const regInfo = await getRegistrationInfo(draftHackathon.id, userId)
      if (regInfo.participantRole === "judge") {
        return (
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
            <Clock className="size-10 text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">This event isn&apos;t live yet</h1>
            <p className="text-muted-foreground max-w-md">
              Judging assignments will appear here once the hackathon is published.
              Check back later.
            </p>
          </div>
        )
      }
    }
    notFound()
  }

  const { getRegistrationInfo } = await import("@/lib/services/hackathons")
  const registrationInfo = await getRegistrationInfo(hackathon.id, userId)

  if (registrationInfo.participantRole !== "judge") {
    redirect(`/e/${slug}`)
  }

  const { getJudgeAssignments } = await import("@/lib/services/judging")
  let judgeAssignments = await getJudgeAssignments(hackathon.id, userId)

  if (hackathon.anonymous_judging) {
    judgeAssignments = judgeAssignments.map((a) => ({ ...a, teamName: null }))
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: hackathon.name, href: `/e/${slug}` },
          { label: "Judging" },
        ]}
        title="Judging"
        description="Review and score your assigned submissions"
      />

      {judgeAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          You don&apos;t have any assignments yet.
        </p>
      ) : (
        <JudgeAssignmentsCard
          hackathonSlug={slug}
          assignments={judgeAssignments}
        />
      )}
    </div>
  )
}
