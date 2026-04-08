import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { listScheduleItems } from "@/lib/services/schedule-items"
import { listPublishedAnnouncements } from "@/lib/services/announcements"
import { HackathonPreviewClient } from "@/components/hackathon/preview/hackathon-preview-client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, Clock } from "lucide-react"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })

  if (!hackathon) {
    return {
      title: "Hackathon Not Found",
    }
  }

  return {
    title: `${hackathon.name} | Oatmeal`,
    description: hackathon.description || `Join ${hackathon.name} hackathon`,
  }
}

export default async function EventPage({ params }: PageProps) {
  const { slug } = await params
  const { orgId, userId } = await auth()

  let hackathon = await getPublicHackathon(slug)
  let isPreview = false
  let isOrganizer = false

  if (hackathon && orgId && hackathon.organizer.clerk_org_id === orgId) {
    isOrganizer = true
  }

  if (!hackathon) {
    const draftHackathon = await getPublicHackathon(slug, { includeUnpublished: true })

    if (draftHackathon && orgId && draftHackathon.organizer.clerk_org_id === orgId) {
      hackathon = draftHackathon
      isPreview = true
      isOrganizer = true
    } else if (draftHackathon && userId) {
      const { getRegistrationInfo } = await import("@/lib/services/hackathons")
      const regInfo = await getRegistrationInfo(draftHackathon.id, userId)
      if (regInfo.participantRole === "judge") {
        return (
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
            <Clock className="size-10 text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">This event isn&apos;t live yet</h1>
            <p className="text-muted-foreground max-w-md">
              You&apos;ve been added as a judge for this hackathon, but it hasn&apos;t been
              published yet. Check back later — you&apos;ll be notified when it&apos;s ready.
            </p>
          </div>
        )
      }
    }
  }

  if (!hackathon) {
    notFound()
  }

  let isRegistered = false
  let participantRole: string | null = null
  let participantCount = 0
  let submission = null
  let teamInfo = null
  let judgeAssignments: {
    id: string
    submissionId: string
    submissionTitle: string
    submissionDescription: string | null
    submissionGithubUrl: string | null
    submissionLiveAppUrl: string | null
    submissionScreenshotUrl: string | null
    teamName: string | null
    isComplete: boolean
    notes: string
  }[] = []

  const isViewingAsParticipant = !orgId || orgId !== hackathon.organizer.clerk_org_id

  if (userId && isViewingAsParticipant) {
    const { getRegistrationInfo, getParticipantTeamInfo } = await import("@/lib/services/hackathons")
    const registrationInfo = await getRegistrationInfo(hackathon.id, userId)
    isRegistered = registrationInfo.isRegistered
    participantRole = registrationInfo.participantRole
    participantCount = registrationInfo.participantCount

    if (isRegistered && participantRole === "participant") {
      const [submissionResult, teamResult] = await Promise.all([
        import("@/lib/services/submissions").then((m) =>
          m.getSubmissionForParticipant(hackathon.id, userId)
        ),
        getParticipantTeamInfo(hackathon.id, userId),
      ])
      submission = submissionResult
      teamInfo = teamResult
    }

    if (participantRole === "judge") {
      const { getJudgeAssignments } = await import("@/lib/services/judging")
      judgeAssignments = await getJudgeAssignments(hackathon.id, userId)

      if (hackathon.anonymous_judging) {
        judgeAssignments = judgeAssignments.map((a) => ({ ...a, teamName: null }))
      }
    }
  }

  if (userId && isOrganizer) {
    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const registrationInfo = await getRegistrationInfo(hackathon.id, userId)
    if (registrationInfo.participantRole === "judge") {
      participantRole = "judge"
      const { getJudgeAssignments } = await import("@/lib/services/judging")
      judgeAssignments = await getJudgeAssignments(hackathon.id, userId)
      if (hackathon.anonymous_judging) {
        judgeAssignments = judgeAssignments.map((a) => ({ ...a, teamName: null }))
      }
    }
  }

  const { getHackathonSubmissions } = await import("@/lib/services/submissions")
  const [rawSubmissions, scheduleItems, publishedAnnouncements] = await Promise.all([
    getHackathonSubmissions(hackathon.id),
    listScheduleItems(hackathon.id),
    listPublishedAnnouncements(hackathon.id),
  ])
  const gallerySubmissions = rawSubmissions.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    githubUrl: s.github_url,
    liveAppUrl: s.live_app_url,
    demoVideoUrl: s.demo_video_url,
    screenshotUrl: s.screenshot_url,
    submitter: s.submitter_name,
    createdAt: s.created_at,
  }))

  let publicResults: import("@/lib/services/results").PublicResultWithDetails[] = []

  if (hackathon.results_published_at) {
    const { getPublicResultsWithDetails } = await import("@/lib/services/results")
    publicResults = (await getPublicResultsWithDetails(hackathon.id)) ?? []
  }

  return (
    <div>
      {isPreview && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-muted">
          <Eye className="size-4" />
          <AlertDescription>
            This is a preview. Only you can see this page because your hackathon is not published yet.
          </AlertDescription>
        </Alert>
      )}

      <HackathonPreviewClient
        hackathon={hackathon}
        isEditable={isOrganizer}
        isRegistered={isRegistered}
        participantRole={participantRole}
        participantCount={participantCount}
        showActionBar={isOrganizer}
        hasJudgeAssignments={judgeAssignments.length > 0}
        submission={submission}
        submissions={gallerySubmissions}
        teamInfo={teamInfo}
        publicResults={publicResults}
        scheduleItems={scheduleItems}
        announcements={publishedAnnouncements}
        currentUserId={userId}
      />
    </div>
  )
}
