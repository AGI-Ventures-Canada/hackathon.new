import { Suspense } from "react"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getManageHackathon } from "@/lib/services/manage-hackathon"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { countJudges, getJudgingProgress, listPrizes } from "@/lib/services/judging"
import { countPendingJudgeInvitations } from "@/lib/services/judge-invitations"
import { countJudgeDisplayProfiles } from "@/lib/services/judge-display"
import { getManageOverviewStats } from "@/lib/services/manage-overview"
import { listAnnouncements } from "@/lib/services/announcements"
import { listScheduleItems, getSubmissionDeadline } from "@/lib/services/schedule-items"
import { getOrganizerActionItems } from "@/lib/utils/organizer-actions"
import { VALID_TABS, VALID_ETABS, DEFAULT_TAB, resolveTab } from "@/lib/utils/manage-tabs"
import { HackathonPreviewClient } from "@/components/hackathon/preview/hackathon-preview-client"
import { HackathonPageActions } from "@/components/hackathon/hackathon-page-actions"
import { SubmissionGallery } from "@/components/hackathon/submission-gallery"
import { LifecycleStepper } from "@/components/hackathon/lifecycle-stepper"
import { OrganizerOverview } from "@/components/hackathon/organizer-overview"
import { TimeRemainingBar } from "@/components/hackathon/time-remaining-bar"
import { ActionItemsProvider } from "@/components/hackathon/manage/action-items-context"
import { ActionItemsTab } from "@/components/hackathon/manage/action-items-tab"
import { ActionItemsLayout } from "@/components/hackathon/manage/action-items-layout"
import { ActionItemsTabBadge } from "@/components/hackathon/manage/action-items-tab-badge"
import { StatusBadgeMenu } from "@/components/hackathon/manage/status-badge-menu"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabCount } from "@/components/ui/tab-count"
import { TabsUrlSync } from "./_tabs-url-sync"
import { JudgingTabContent } from "./_judging-tab"
import { PostEventTabContent } from "./_post-event-tab"
import { EventTabContent } from "./_event-tab"
import { RoomsTab } from "./_rooms-tab"
import { TeamsTab } from "./_teams-tab"
import { ActivityTab } from "./_activity-tab"

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string; etab?: string }>
}

function TabLoadingSkeleton() {
  return <div className="h-64 rounded-lg bg-muted animate-pulse" />
}

export default async function ManagePage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { tab, etab } = await searchParams
  const [{ userId }, result] = await Promise.all([auth(), getManageHackathon(slug)])

  if (!result.ok) {
    notFound()
  }

  const { hackathon } = result

  const [
    submissions,
    judgingProgress,
    prizes,
    judgeDisplayCount,
    judgeCount,
    overviewStats,
    announcements,
    scheduleItems,
    submissionDeadline,
    pendingJudgeInvitationCount,
  ] = await Promise.all([
    getHackathonSubmissions(hackathon.id),
    getJudgingProgress(hackathon.id),
    listPrizes(hackathon.id),
    countJudgeDisplayProfiles(hackathon.id),
    countJudges(hackathon.id),
    getManageOverviewStats(hackathon.id),
    listAnnouncements(hackathon.id),
    listScheduleItems(hackathon.id),
    getSubmissionDeadline(hackathon.id),
    countPendingJudgeInvitations(hackathon.id),
  ])

  const submissionCount = submissions.length
  const challengeReleaseItem = scheduleItems.find((s) => s.trigger_type === "challenge_release")
  const actionItems = getOrganizerActionItems({
    status: hackathon.status,
    phase: hackathon.phase,
    submissionCount,
    participantCount: overviewStats.participantCount,
    teamCount: overviewStats.teamCount,
    judgingProgress,
    judgeCount,
    prizeCount: prizes.length,
    judgeDisplayCount,
    mentorQueue: overviewStats.mentorQueue,
    challengeReleased: overviewStats.challengeReleased,
    challengeExists: !!hackathon.challenge_title,
    challengeReleaseTime: challengeReleaseItem?.starts_at ?? null,
    resultsPublishedAt: hackathon.results_published_at,
    description: hackathon.description,
    bannerUrl: hackathon.banner_url,
    startsAt: hackathon.starts_at,
    endsAt: hackathon.ends_at,
    locationType: hackathon.location_type ?? null,
    feedbackSurveyUrl: hackathon.feedback_survey_url ?? null,
    feedbackSurveySentAt: hackathon.feedback_survey_sent_at ?? null,
    pendingJudgeInvitationCount,
    scheduleItemCount: scheduleItems.length,
  })

  const activeTab = resolveTab(tab, VALID_TABS, DEFAULT_TAB)
  const activeEtab = resolveTab(etab, VALID_ETABS, "challenge")

  const submissionsForSelect = submissions.map((s) => ({ id: s.id, title: s.title }))

  const submissionsForGallery = submissions.map((s) => ({
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

  return (
    <div className="space-y-6">
      <ActionItemsProvider
        actionItems={actionItems}
        hackathonId={hackathon.id}
        slug={hackathon.slug}
        status={hackathon.status}
        phase={hackathon.phase}
        challengeExists={!!hackathon.challenge_title}
        challengeReleasedAt={hackathon.challenge_released_at}
        scheduleItems={scheduleItems}
        startsAt={hackathon.starts_at}
        endsAt={hackathon.ends_at}
      >
        <TabsUrlSync paramKey="tab" value={activeTab}>
          <ActionItemsLayout>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-semibold">{hackathon.name}</h1>
              <StatusBadgeMenu />
              <HackathonPageActions
                slug={hackathon.slug}
                hackathonName={hackathon.name}
                isOrganizer={true}
              />
            </div>
            <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
            <TabsList variant="line">
              <TabsTrigger value="action-items">Action Items<ActionItemsTabBadge /></TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="edit">Event Page</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="rooms">Rooms</TabsTrigger>
              <TabsTrigger value="submissions">Submissions{submissionCount > 0 && <TabCount>{submissionCount}</TabCount>}</TabsTrigger>
              <TabsTrigger value="judging">Judging &amp; Prizes{prizes.length > 0 && <TabCount>{prizes.length}</TabCount>}</TabsTrigger>
              <TabsTrigger value="post-event">Post-Event</TabsTrigger>
              <TabsTrigger value="event">Engage</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
          </div>

            <TabsContent value="action-items" forceMount className="data-[state=inactive]:hidden">
              <ActionItemsTab />
            </TabsContent>

            <TabsContent value="overview" forceMount className="data-[state=inactive]:hidden">
              <div className="space-y-4">
                <LifecycleStepper
                  hackathonId={hackathon.id}
                  hackathonSlug={hackathon.slug}
                  status={hackathon.status}
                  submissionCount={submissionCount}
                  judgingProgress={judgingProgress}
                  startsAt={hackathon.starts_at}
                  endsAt={hackathon.ends_at}
                  registrationOpensAt={hackathon.registration_opens_at}
                  registrationClosesAt={hackathon.registration_closes_at}
                  description={hackathon.description}
                  bannerUrl={hackathon.banner_url}
                  locationType={hackathon.location_type}
                  locationName={hackathon.location_name}
                  locationUrl={hackathon.location_url}
                  sponsorCount={hackathon.sponsors.length}
                  prizeCount={prizes.length}
                  judgeDisplayCount={judgeDisplayCount}
                  phase={hackathon.phase}
                />
                <TimeRemainingBar
                  status={hackathon.status}
                  registrationOpensAt={hackathon.registration_opens_at}
                  registrationClosesAt={hackathon.registration_closes_at}
                  startsAt={hackathon.starts_at}
                  endsAt={hackathon.ends_at}
                  submissionDeadline={submissionDeadline}
                />
                <OrganizerOverview
                  slug={hackathon.slug}
                  hackathonId={hackathon.id}
                  stats={{
                    participantCount: overviewStats.participantCount,
                    teamCount: overviewStats.teamCount,
                    submissionCount,
                    judgingProgress,
                    mentorQueue: overviewStats.mentorQueue,
                  }}
                  announcements={announcements}
                  scheduleItems={scheduleItems}
                  challengeReleasedAt={hackathon.challenge_released_at}
                  challengeExists={!!hackathon.challenge_title}
                />
              </div>
            </TabsContent>

            <TabsContent value="edit" forceMount className="data-[state=inactive]:hidden">
              <div className="rounded-lg border overflow-hidden">
                <HackathonPreviewClient hackathon={hackathon} isEditable={true} currentUserId={userId} />
              </div>
            </TabsContent>

            <TabsContent value="judging" forceMount className="data-[state=inactive]:hidden">
              <Suspense fallback={<TabLoadingSkeleton />}>
                <JudgingTabContent
                  hackathonId={hackathon.id}
                  submissions={submissionsForSelect}
                  resultsPublishedAt={hackathon.results_published_at}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="post-event" forceMount className="data-[state=inactive]:hidden">
              <Suspense fallback={<TabLoadingSkeleton />}>
                <PostEventTabContent
                  hackathonId={hackathon.id}
                  resultsPublishedAt={hackathon.results_published_at}
                  feedbackSurveySentAt={hackathon.feedback_survey_sent_at ?? null}
                  feedbackSurveyUrl={hackathon.feedback_survey_url ?? null}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="teams" forceMount className="data-[state=inactive]:hidden">
              <TeamsTab hackathonId={hackathon.id} />
            </TabsContent>

            <TabsContent value="rooms" forceMount className="data-[state=inactive]:hidden">
              <RoomsTab hackathonId={hackathon.id} />
            </TabsContent>

            <TabsContent value="submissions" forceMount className="data-[state=inactive]:hidden">
              {submissionsForGallery.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-lg font-semibold mb-1">No submissions yet</p>
                  <p className="text-sm text-muted-foreground">Submissions will appear here once participants submit their projects.</p>
                </div>
              ) : (
                <SubmissionGallery submissions={submissionsForGallery} />
              )}
            </TabsContent>

            <TabsContent value="event" forceMount className="data-[state=inactive]:hidden">
              <EventTabContent hackathonId={hackathon.id} activeEtab={activeEtab} hackathonStatus={hackathon.status} hackathonPhase={hackathon.phase} />
            </TabsContent>

            <TabsContent value="activity" forceMount className="data-[state=inactive]:hidden">
              <ActivityTab hackathonId={hackathon.id} />
            </TabsContent>
          </ActionItemsLayout>
        </TabsUrlSync>
      </ActionItemsProvider>
    </div>
  )
}
