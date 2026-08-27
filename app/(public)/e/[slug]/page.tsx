import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import {
  getPublicHackathon,
  isPublicHackathonOrganizer,
  PUBLISHED_STATUSES,
  toPublicHackathonClientDto,
} from "@/lib/services/public-hackathons"
import { listScheduleItems } from "@/lib/services/schedule-items"
import {
  filterAnnouncementsForViewer,
  listPublishedAnnouncements,
} from "@/lib/services/announcements"
import { listChallenges } from "@/lib/services/challenges"
import { getSubmissionScreenshotUrls } from "@/lib/utils/submission-screenshots"
import { HackathonPreviewClient } from "@/components/hackathon/preview/hackathon-preview-client"
import { EventWebMcpTools } from "@/components/hackathon/event-webmcp-tools"
import { AttendeeMentorWebMcp } from "@/components/hackathon/mentors/attendee-mentor-webmcp"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, Clock, Handshake } from "lucide-react"
import type { Metadata } from "next"
import {
  applyHackathonTranslation,
  availableLocales,
  normalizeLocale,
} from "@/lib/utils/language"
import { publicSubmitterName } from "@/lib/utils/anonymous-judging"
import { getParticipantCount } from "@/lib/services/hackathons"
import { canRegisterNow } from "@/lib/utils/registration"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

export { canRegisterNow }

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const { lang } = await searchParams
  const hackathon = await getPublicHackathon(slug)

  if (!hackathon) {
    return {
      title: "Hackathon Not Found",
    }
  }

  const locales = availableLocales(hackathon)
  const requested = normalizeLocale(lang ?? null)
  const currentLocale = requested && locales.includes(requested) ? requested : locales[0]
  const translated = applyHackathonTranslation(hackathon, currentLocale)

  return {
    title: `${translated.name} | hackathon.new`,
    description: translated.description || `Join ${translated.name} hackathon`,
  }
}

export default async function EventPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { lang } = await searchParams
  const { orgId, userId } = await auth()

  const rawHackathon = await getPublicHackathon(
    slug,
    userId || orgId ? { includeUnpublished: true } : undefined,
  )

  if (!rawHackathon) {
    notFound()
  }

  const locales = availableLocales(rawHackathon)
  const requested = normalizeLocale(lang ?? null)
  const currentLocale = requested && locales.includes(requested) ? requested : locales[0]
  const hackathon = applyHackathonTranslation(rawHackathon, currentLocale)

  const isPublished = PUBLISHED_STATUSES.includes(hackathon.status)
  let isPreview = false
  const isOrganizer = isPublicHackathonOrganizer(hackathon, {
    orgId: orgId ?? null,
    userId: userId ?? null,
  })
  let sponsorRelationship: { organizationName: string; tier: string } | null = null
  if (!isOrganizer && orgId) {
    const { getTenantByClerkOrgId } = await import("@/lib/services/tenants")
    const viewerTenant = await getTenantByClerkOrgId(orgId)
    const sponsor = viewerTenant
      ? rawHackathon.sponsors.find((entry) => entry.sponsor_tenant_id === viewerTenant.id)
      : null
    if (sponsor) {
      sponsorRelationship = {
        organizationName: viewerTenant?.name ?? sponsor.name,
        tier: sponsor.custom_tier_label ?? sponsor.tier,
      }
    }
  }

  if (isOrganizer) {
    if (!isPublished) {
      isPreview = true
    }
  } else if (!isPublished) {
    if (userId) {
      const { getRegistrationInfo } = await import("@/lib/services/hackathons")
      const regInfo = await getRegistrationInfo(hackathon.id, userId)
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
    notFound()
  }

  let isRegistered = false
  let participantRole: string | null = null
  const participantCount = await getParticipantCount(hackathon.id)
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

  const isViewingAsParticipant = !isOrganizer

  if (userId && isViewingAsParticipant) {
    const { getRegistrationInfo, getParticipantTeamInfo } = await import("@/lib/services/hackathons")
    const registrationInfo = await getRegistrationInfo(hackathon.id, userId)
    isRegistered = registrationInfo.isRegistered
    participantRole = registrationInfo.participantRole

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
    isRegistered = registrationInfo.isRegistered
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
  const [rawSubmissions, scheduleItems, allPublishedAnnouncements, challenges] = await Promise.all([
    getHackathonSubmissions(hackathon.id),
    listScheduleItems(hackathon.id),
    listPublishedAnnouncements(hackathon.id),
    listChallenges(hackathon.id),
  ])
  const publishedAnnouncements = filterAnnouncementsForViewer(allPublishedAnnouncements, {
    role: isOrganizer
      ? "organizer"
      : participantRole === "judge" || participantRole === "mentor" || participantRole === "participant"
        ? participantRole
        : "public",
    ...(participantRole === "participant"
      ? { hasSubmitted: Boolean(submission && submission.status === "submitted") }
      : {}),
  })

  let viewerPerks: import("@/lib/services/perks").Perk[] = []
  const perksNone = hackathon.perks_none ?? false
  const isPendingTeam = teamInfo?.team.status === "pending_approval"
  const isDisbandedTeam = teamInfo?.team.status === "disbanded"
  const viewerChallenges = isPendingTeam || (!isOrganizer && !hackathon.challenge_released_at)
    ? []
    : challenges
  if (!perksNone && teamInfo && !isPendingTeam && !isDisbandedTeam) {
    const { listPerks, isPerkReleased } = await import("@/lib/services/perks")
    const all = await listPerks(hackathon.id)
    const now = new Date()
    viewerPerks = all.filter((p) => isPerkReleased(p, hackathon.starts_at, now))
  }
  const gallerySubmissions = rawSubmissions.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    githubUrl: s.github_url,
    liveAppUrl: s.live_app_url,
    demoVideoUrl: s.demo_video_url,
    screenshotUrl: s.screenshot_url,
    screenshotUrls: getSubmissionScreenshotUrls(s),
    submitter: isOrganizer
      ? s.submitter_name
      : publicSubmitterName(hackathon, s.submitter_name),
    createdAt: s.created_at,
  }))

  let publicResults: import("@/lib/services/results").PublicResultWithDetails[] = []

  if (hackathon.results_published_at) {
    const { getPublicResultsWithDetails } = await import("@/lib/services/results")
    publicResults = (await getPublicResultsWithDetails(hackathon.id)) ?? []
  }

  const isAttendee = isRegistered && participantRole === "participant"
  const isFormingCaptain = Boolean(
    teamInfo?.isCaptain &&
    (teamInfo.team.status === "forming" || teamInfo.team.status === "pending_approval"),
  )
  const atCapacity = Boolean(
    hackathon.max_participants && participantCount >= hackathon.max_participants,
  )
  const submissionDeadline = scheduleItems.find(
    (item) => item.trigger_type === "submission_deadline",
  )?.starts_at ?? hackathon.ends_at
  const viewerNextStep = isOrganizer
    ? "Open the manage workspace to run this event."
    : sponsorRelationship && !isRegistered
      ? "Open Sponsoring to manage this event relationship."
    : !userId
    ? "Sign in to register. You can prepare a project draft first."
    : !isAttendee
      ? participantRole
        ? `Open the ${participantRole} workspace for this event.`
        : "Register to join this event."
      : isDisbandedTeam
        ? "Your team is no longer active. Ask the organizer if you need help."
      : isPendingTeam
        ? "Wait for team approval. You can keep preparing your project."
        : hackathon.status === "active" && (
          !submissionDeadline || new Date(submissionDeadline).getTime() > Date.now()
        )
          ? "Build with your team and review your project draft before submitting."
          : hackathon.status === "active"
            ? "The project deadline has passed. Your saved project is locked."
            : "Check the schedule for what happens next."

  const eventGuide = {
    name: hackathon.name,
    slug: hackathon.slug,
    description: hackathon.description,
    status: hackathon.status,
    startsAt: hackathon.starts_at,
    endsAt: hackathon.ends_at,
    locationType: hackathon.location_type,
    locationName: hackathon.location_name,
    locationUrl: isOrganizer || isRegistered ? hackathon.location_url : null,
    organizerName: hackathon.organizer.name,
    schedule: scheduleItems.map((item) => ({
      title: item.title,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      location: item.location,
    })),
    announcements: publishedAnnouncements.map((announcement) => ({
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
    })),
    challenges: viewerChallenges.map((challenge) => ({
      title: challenge.title,
      description: challenge.description,
      resourceCount: challenge.resources.length,
    })),
    resultsPublished: Boolean(hackathon.results_published_at),
  }

  const eventViewer = {
    signedIn: Boolean(userId),
    registered: isRegistered,
    role: participantRole ?? (sponsorRelationship ? "sponsor" : null),
    participantCount,
    nextStep: viewerNextStep,
    sponsor: sponsorRelationship,
    team: teamInfo ? {
      name: teamInfo.team.name,
      status: teamInfo.team.status,
      isCaptain: teamInfo.isCaptain,
      memberNames: teamInfo.members.map((member) => member.displayName || "Teammate"),
      memberCount: teamInfo.members.length,
      pendingInviteCount: teamInfo.pendingInvitations.length,
      maxTeamSize: hackathon.max_team_size,
    } : null,
    project: submission ? {
      title: submission.title,
      status: submission.status,
      hasGithubUrl: Boolean(submission.github_url),
      hasLiveAppUrl: Boolean(submission.live_app_url),
      hasDemoVideoUrl: Boolean(submission.demo_video_url),
    } : null,
  }
  const clientHackathon = toPublicHackathonClientDto(hackathon, {
    includeEditorSponsorData: isOrganizer,
    includePrivateLocation: isOrganizer || isRegistered,
  })
  const notificationDisposition = getNotificationDisposition({
    status: hackathon.status as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
  })

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
      {sponsorRelationship && (
        <Alert className="rounded-none border-x-0 border-t-0">
          <Handshake className="size-4" />
          <AlertDescription>
            You&apos;re viewing this event as {sponsorRelationship.organizationName}, a {sponsorRelationship.tier} sponsor.
          </AlertDescription>
        </Alert>
      )}

      <EventWebMcpTools
        guide={eventGuide}
        viewer={eventViewer}
        canRegisterViewer={!isOrganizer && !isRegistered && !sponsorRelationship}
        registrationOpensAt={hackathon.registration_opens_at}
        isFormingCaptain={isFormingCaptain}
        registrationClosesAt={hackathon.registration_closes_at}
        allowLateRegistration={hackathon.allow_late_registration}
        atCapacity={atCapacity}
        isOrganizer={isOrganizer}
        viewerUserId={userId}
        submissionDeadline={submissionDeadline}
      />
      <AttendeeMentorWebMcp
        slug={hackathon.slug}
        status={hackathon.status}
        startsAt={hackathon.starts_at}
        endsAt={hackathon.ends_at}
        isParticipant={isAttendee}
        teamStatus={teamInfo?.team.status ?? null}
      />

      <HackathonPreviewClient
        hackathon={clientHackathon}
        isEditable={isOrganizer}
        isRegistered={isRegistered}
        participantRole={participantRole}
        participantCount={participantCount}
        showActionBar={isOrganizer}
        hasJudgeAssignments={judgeAssignments.length > 0}
        isPersonalWorkspace={!orgId}
        submission={submission}
        submissions={gallerySubmissions}
        teamInfo={teamInfo}
        notificationDisposition={notificationDisposition}
        publicResults={publicResults}
        scheduleItems={scheduleItems}
        announcements={publishedAnnouncements}
        challenges={viewerChallenges}
        viewerPerks={viewerPerks}
        currentUserId={userId}
        availableLocales={locales}
        currentLocale={currentLocale}
        isSponsor={Boolean(sponsorRelationship && !isRegistered)}
      />
    </div>
  )
}
