import { Suspense } from "react"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getManageHackathon } from "@/lib/services/manage-hackathon"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { countJudges, getJudgingProgress, listPrizes, listRounds } from "@/lib/services/judging"
import { countPendingJudgeInvitations } from "@/lib/services/judge-invitations"
import { countJudgeDisplayProfiles } from "@/lib/services/judge-display"
import { getManageOverviewStats } from "@/lib/services/manage-overview"
import { listAnnouncements } from "@/lib/services/announcements"
import { listChallenges } from "@/lib/services/challenges"
import { listPerks } from "@/lib/services/perks"
import { listScheduleItems, getSubmissionDeadline } from "@/lib/services/schedule-items"
import { getOrganizerActionItems } from "@/lib/utils/organizer-actions"
import { VALID_TABS, VALID_ETABS, VALID_MTABS, VALID_JTABS, VALID_PTABS, DEFAULT_TAB, DEFAULT_MTAB, DEFAULT_JTAB, DEFAULT_PTAB, resolveTab } from "@/lib/utils/manage-tabs"
import { HackathonPreviewClient } from "@/components/hackathon/preview/hackathon-preview-client"
import { HackathonPageActions } from "@/components/hackathon/hackathon-page-actions"
import { LifecycleStepper } from "@/components/hackathon/lifecycle-stepper"
import { OrganizerOverview } from "@/components/hackathon/organizer-overview"
import { TimeRemainingBar } from "@/components/hackathon/time-remaining-bar"
import { ActionItemsProvider } from "@/components/hackathon/manage/action-items-context"
import { ActionItemsTab } from "@/components/hackathon/manage/action-items-tab"
import { ActionItemsLayout } from "@/components/hackathon/manage/action-items-layout"
import { ActionItemsTabBadge } from "@/components/hackathon/manage/action-items-tab-badge"
import { StatusBadgeMenu } from "@/components/hackathon/manage/status-badge-menu"
import { ChallengesTab } from "@/components/hackathon/manage/challenges-tab"
import { PerksTab } from "@/components/hackathon/manage/perks-tab"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabCount } from "@/components/ui/tab-count"
import { TabsUrlSync } from "./_tabs-url-sync"
import { JudgingTabContent } from "./_judging-tab"
import { PostEventTabContent } from "./_post-event-tab"
import { EventTabContent } from "./_event-tab"
import { MiscsTabContent } from "./_miscs-tab"
import { TeamsTab } from "./_teams-tab"

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string; etab?: string; mtab?: string; jtab?: string; ptab?: string }>
}

function TabLoadingSkeleton() {
  return <div className="h-64 rounded-lg bg-muted animate-pulse" />
}

export default async function ManagePage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { tab, etab, mtab, jtab, ptab } = await searchParams
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
    challenges,
    rounds,
    perks,
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
    listChallenges(hackathon.id),
    listRounds(hackathon.id),
    listPerks(hackathon.id),
  ])

  const submissionCount = submissions.length
  const challengeExists = challenges.length > 0
  const challengeReleaseItem = scheduleItems.find((s) => s.trigger_type === "challenge_release")
  const roundsSummary = rounds.reduce(
    (acc, r) => {
      if (r.status === "planned") acc.plannedCount += 1
      else if (r.status === "active") acc.activeCount += 1
      else if (r.status === "complete" || r.status === "advanced") acc.completeCount += 1
      return acc
    },
    { plannedCount: 0, activeCount: 0, completeCount: 0 },
  )
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
    challengeExists,
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
    perkCount: perks.length,
    perksNone: hackathon.perks_none ?? false,
    rounds: roundsSummary,
  })

  const activeTab = resolveTab(tab, VALID_TABS, DEFAULT_TAB)
  const activeEtab = resolveTab(etab, VALID_ETABS, "announcements")
  const mtabFallback = tab === "rooms" ? "rooms" : tab === "activity" ? "activity" : undefined
  const activeMtab = resolveTab(mtab ?? mtabFallback, VALID_MTABS, DEFAULT_MTAB)
  const hasJudgingSetup = prizes.length > 0 || judgeCount > 0 || rounds.length > 0
  const jtabFallback = hasJudgingSetup ? DEFAULT_JTAB : "setup"
  const activeJtab = resolveTab(jtab, VALID_JTABS, jtabFallback) as "setup" | "judges" | "rounds" | "prizes" | "results"
  const ptabFallback = tab === "fulfillment" ? "fulfillment" : tab === "feedback" ? "feedback" : undefined
  const activePtab = resolveTab(ptab ?? ptabFallback, VALID_PTABS, DEFAULT_PTAB)

  const submissionsForSelect = submissions.map((s) => ({ id: s.id, title: s.title }))
  const teamsTabTooltip = `${overviewStats.teamCount} team${overviewStats.teamCount === 1 ? "" : "s"} · ${submissionCount} submission${submissionCount === 1 ? "" : "s"}`

  return (
    <div className="space-y-6">
      <ActionItemsProvider
        actionItems={actionItems}
        hackathonId={hackathon.id}
        slug={hackathon.slug}
        status={hackathon.status}
        phase={hackathon.phase}
        challengeExists={challengeExists}
        challengeReleasedAt={hackathon.challenge_released_at}
        scheduleItems={scheduleItems}
        endsAt={hackathon.ends_at}
        locationInitialData={{
          locationType: hackathon.location_type,
          locationName: hackathon.location_name,
          locationUrl: hackathon.location_url,
          locationLatitude: hackathon.location_latitude,
          locationLongitude: hackathon.location_longitude,
          requireLocationVerification: hackathon.require_location_verification,
        }}
        teamSettingsInitialData={{
          minTeamSize: hackathon.min_team_size ?? 1,
          maxTeamSize: hackathon.max_team_size ?? 5,
          allowSolo: hackathon.allow_solo ?? true,
        }}
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
              <TabsTrigger value="challenges">Challenges{challenges.length > 0 && <TabCount>{challenges.length}</TabCount>}</TabsTrigger>
              <TabsTrigger value="perks">Perks{perks.length > 0 && <TabCount>{perks.length}</TabCount>}</TabsTrigger>
              <TabsTrigger value="edit">Event Page</TabsTrigger>
              <TabsTrigger value="teams" title={teamsTabTooltip}>Teams</TabsTrigger>
              <TabsTrigger value="judging">Judging &amp; Prizes{prizes.length > 0 && <TabCount>{prizes.length}</TabCount>}</TabsTrigger>
              <TabsTrigger value="post-event">Post-Event</TabsTrigger>
              <TabsTrigger value="event">Communications</TabsTrigger>
              <TabsTrigger value="miscs">Miscs</TabsTrigger>
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
                  challengeExists={challengeExists}
                />
              </div>
            </TabsContent>

            <TabsContent value="challenges" forceMount className="data-[state=inactive]:hidden">
              <ChallengesTab
                hackathonId={hackathon.id}
                initialChallenges={challenges}
                releasedAt={hackathon.challenge_released_at}
              />
            </TabsContent>

            <TabsContent value="perks" forceMount className="data-[state=inactive]:hidden">
              <PerksTab
                hackathonId={hackathon.id}
                initialPerks={perks}
                sponsors={hackathon.sponsors.map((s) => ({ id: s.id, name: s.name }))}
                startsAt={hackathon.starts_at}
                perksNone={hackathon.perks_none ?? false}
              />
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
                  slug={hackathon.slug}
                  submissions={submissionsForSelect}
                  resultsPublishedAt={hackathon.results_published_at}
                  activeJtab={activeJtab}
                  locationType={hackathon.location_type ?? null}
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
                  activePtab={activePtab}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="teams" forceMount className="data-[state=inactive]:hidden">
              <TeamsTab
                hackathonId={hackathon.id}
                maxTeamSize={hackathon.max_team_size ?? 5}
                minTeamSize={hackathon.min_team_size ?? 1}
                allowSolo={hackathon.allow_solo ?? true}
              />
            </TabsContent>

            <TabsContent value="miscs" forceMount className="data-[state=inactive]:hidden">
              <MiscsTabContent hackathonId={hackathon.id} activeMtab={activeMtab} />
            </TabsContent>

            <TabsContent value="event" forceMount className="data-[state=inactive]:hidden">
              <EventTabContent hackathonId={hackathon.id} activeEtab={activeEtab} hackathonStatus={hackathon.status} hackathonPhase={hackathon.phase} />
            </TabsContent>
          </ActionItemsLayout>
        </TabsUrlSync>
      </ActionItemsProvider>
    </div>
  )
}
