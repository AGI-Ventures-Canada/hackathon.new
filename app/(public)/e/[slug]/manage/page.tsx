import { Suspense } from "react"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getManageHackathon } from "@/lib/services/manage-hackathon"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { countJudges, countUnassignedSubmissions, getJudgingProgress, getJudgingSetupStatus, listPrizes, listRounds } from "@/lib/services/judging"
import { countPendingJudgeInvitations } from "@/lib/services/judge-invitations"
import { countFailedReminderEmails, getUnsentInvitationEmailCounts } from "@/lib/services/invitation-email-health"
import { listOrganizerActionState } from "@/lib/services/organizer-action-items"
import { countJudgeDisplayProfiles } from "@/lib/services/judge-display"
import { getManageOverviewStats } from "@/lib/services/manage-overview"
import { listChallenges } from "@/lib/services/challenges"
import { listAnnouncements } from "@/lib/services/announcements"
import { isPerkReleased, listPerks } from "@/lib/services/perks"
import { listScheduleItems, getSubmissionDeadline } from "@/lib/services/schedule-items"
import { getOrganizerActionItems } from "@/lib/utils/organizer-actions"
import { getEventLifecycleAlerts } from "@/lib/utils/event-lifecycle-alerts"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"
import { getJudgingCompletionReadiness } from "@/lib/services/lifecycle"
import { hasRegistrationOpened } from "@/lib/utils/team-invite"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { VALID_TABS, VALID_ETABS, VALID_MTABS, VALID_JTABS, VALID_PTABS, DEFAULT_TAB, DEFAULT_MTAB, DEFAULT_JTAB, DEFAULT_PTAB, resolveTab } from "@/lib/utils/manage-tabs"
import { HackathonPreviewClient } from "@/components/hackathon/preview/hackathon-preview-client"
import { applyHackathonTranslation, availableLocales, normalizeLocale } from "@/lib/utils/language"
import { HackathonPageActions } from "@/components/hackathon/hackathon-page-actions"
import { LifecycleStepper } from "@/components/hackathon/lifecycle-stepper"
import { OrganizerOverview } from "@/components/hackathon/organizer-overview"
import { TimeRemainingBar } from "@/components/hackathon/time-remaining-bar"
import { ActionItemsProvider } from "@/components/hackathon/manage/action-items-context"
import { ActionItemsTab } from "@/components/hackathon/manage/action-items-tab"
import { ActionItemsLayout } from "@/components/hackathon/manage/action-items-layout"
import { ActionItemsTabBadge } from "@/components/hackathon/manage/action-items-tab-badge"
import { ManageHackathonWebMcpTools } from "@/components/hackathon/manage/manage-webmcp-tools"
import {
  ManageHackathonName,
  ManageHackathonTabCount,
} from "@/components/hackathon/manage/manage-hackathon-name"
import { StatusBadgeMenu } from "@/components/hackathon/manage/status-badge-menu"
import { EventHealthAlerts } from "@/components/hackathon/manage/event-health-alerts"
import { TestEventBanner } from "@/components/hackathon/manage/test-event-banner"
import { ChallengesTab } from "@/components/hackathon/manage/challenges-tab"
import { PerksTab } from "@/components/hackathon/manage/perks-tab"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabCount } from "@/components/ui/tab-count"
import { TabsPendingFallback, TabsUrlSync } from "@/components/ui/tabs-url-sync"
import { JudgingTabContent } from "./_judging-tab"
import { PostEventTabContent } from "./_post-event-tab"
import { EventTabContent } from "./_event-tab"
import { MiscsTabContent } from "./_miscs-tab"
import { TeamsTab } from "./_teams-tab"
import { PeopleTab } from "./_people-tab"

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function TabLoadingSkeleton() {
  return <div className="h-64 rounded-lg bg-muted animate-pulse" />
}

export default async function ManagePage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const query = await searchParams
  const tab = firstQueryValue(query.tab)
  const etab = firstQueryValue(query.etab)
  const mtab = firstQueryValue(query.mtab)
  const jtab = firstQueryValue(query.jtab)
  const ptab = firstQueryValue(query.ptab)
  const lang = firstQueryValue(query.lang)
  const [{ userId }, result] = await Promise.all([auth(), getManageHackathon(slug)])

  if (!result.ok) {
    notFound()
  }

  const { hackathon: rawHackathon } = result
  const locales = availableLocales(rawHackathon)
  const requestedLocale = normalizeLocale(lang ?? null)
  const currentLocale = requestedLocale && locales.includes(requestedLocale) ? requestedLocale : locales[0]
  const hackathon = applyHackathonTranslation(rawHackathon, currentLocale)
  const notificationDisposition = getNotificationDisposition({
    status: (hackathon.stored_status ?? hackathon.status) as HackathonStatus,
    starts_at: hackathon.starts_at,
    ends_at: hackathon.ends_at,
    is_test_event: hackathon.is_test_event,
  })
  const teamInvitationQueueReason = hackathon.is_test_event
    ? "test_event"
    : notificationDisposition === "send" &&
    !hasRegistrationOpened(hackathon.registration_opens_at, new Date().toISOString())
    ? "registration_not_open"
    : "event_draft"

  const [
    submissions,
    judgingProgress,
    prizes,
    judgeDisplayCount,
    judgeCount,
    overviewStats,
    scheduleItems,
    submissionDeadline,
    pendingJudgeInvitationCount,
    challenges,
    rounds,
    perks,
    unassignedSubmissionCount,
    judgingSetupStatus,
    judgingCompletionReadiness,
    announcements,
    invitationEmailCounts,
    failedReminderCount,
  ] = await Promise.all([
    getHackathonSubmissions(hackathon.id),
    getJudgingProgress(hackathon.id),
    listPrizes(hackathon.id),
    countJudgeDisplayProfiles(hackathon.id),
    countJudges(hackathon.id),
    getManageOverviewStats(hackathon.id),
    listScheduleItems(hackathon.id),
    getSubmissionDeadline(hackathon.id),
    countPendingJudgeInvitations(hackathon.id),
    listChallenges(hackathon.id),
    listRounds(hackathon.id),
    listPerks(hackathon.id),
    countUnassignedSubmissions(hackathon.id),
    getJudgingSetupStatus(hackathon.id),
    getJudgingCompletionReadiness(hackathon.id),
    listAnnouncements(hackathon.id),
    getUnsentInvitationEmailCounts(hackathon.id),
    countFailedReminderEmails(hackathon.id),
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
    id: hackathon.id,
    slug: hackathon.slug,
    name: hackathon.name,
    status: hackathon.status,
    storedStatus: (hackathon.stored_status ?? hackathon.status) as HackathonStatus,
    phase: hackathon.phase,
    submissionCount,
    unassignedSubmissionCount,
    participantCount: overviewStats.participantCount,
    teamCount: overviewStats.teamCount,
    pendingTeamApprovalCount: overviewStats.pendingTeamApprovalCount,
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
    registrationClosesAt: hackathon.registration_closes_at,
    registrationOpensAt: hackathon.registration_opens_at,
    requireLocationVerification: hackathon.require_location_verification,
    allowLateRegistration: hackathon.allow_late_registration,
    locationType: hackathon.location_type ?? null,
    feedbackSurveyUrl: hackathon.feedback_survey_url ?? null,
    feedbackSurveySentAt: hackathon.feedback_survey_sent_at ?? null,
    pendingJudgeInvitationCount,
    unsentInvitationEmailCount: invitationEmailCounts.total,
    unsentTeamInvitationEmailCount: invitationEmailCounts.teams,
    unsentJudgeInvitationEmailCount: invitationEmailCounts.judges,
    failedReminderCount,
    perkCount: perks.length,
    perksNone: hackathon.perks_none ?? false,
    rounds: roundsSummary,
    communityUrl: hackathon.community_url ?? null,
    termsContent: hackathon.terms_content ?? null,
    judgingSetupReady: judgingSetupStatus.isReady,
    requiresJudgeScoring: judgingSetupStatus.requiresJudgeScoring,
    judgingCompletionReadiness,
  })
  const persistedActionState = await listOrganizerActionState(hackathon.id, actionItems)
  const lifecycleAlerts = getEventLifecycleAlerts({
    storedStatus: (hackathon.stored_status ?? hackathon.status) as HackathonStatus,
    startsAt: hackathon.starts_at,
    endsAt: hackathon.ends_at,
    registrationOpensAt: hackathon.registration_opens_at,
    registrationClosesAt: hackathon.registration_closes_at,
    requireLocationVerification: hackathon.require_location_verification,
  })

  const activeTab = resolveTab(tab, VALID_TABS, DEFAULT_TAB)
  const activeEtab = resolveTab(etab, VALID_ETABS, "announcements")
  const mtabFallback = tab === "rooms" ? "rooms" : tab === "activity" ? "activity" : undefined
  const activeMtab = resolveTab(mtab ?? mtabFallback, VALID_MTABS, DEFAULT_MTAB)
  const hasJudgingSetup = prizes.length > 0 || judgeCount > 0 || rounds.length > 0
  const jtabFallback = hasJudgingSetup ? DEFAULT_JTAB : "setup"
  const activeJtab = resolveTab(jtab, VALID_JTABS, jtabFallback) as "setup" | "judges" | "rounds" | "prizes" | "assignments" | "results"
  const ptabFallback = tab === "fulfillment" ? "fulfillment" : tab === "feedback" ? "feedback" : tab === "exports" ? "exports" : undefined
  const activePtab = resolveTab(ptab ?? ptabFallback, VALID_PTABS, DEFAULT_PTAB)

  const submissionsForSelect = submissions.map((s) => ({ id: s.id, title: s.title }))
  const teamsTabTooltip = `${overviewStats.teamCount} team${overviewStats.teamCount === 1 ? "" : "s"} · ${submissionCount} submission${submissionCount === 1 ? "" : "s"}`
  const descriptionLocale = currentLocale !== (hackathon.default_locale ?? "en") ? currentLocale : null
  const roundsForDialogs = rounds.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    isActive: r.status === "active",
    displayOrder: r.displayOrder,
    advancement: r.advancement,
    advancementConfig: r.advancementConfig,
    prizeCount: r.prizeCount,
    submissionCount: r.submissionCount,
    screeningPrizeId: r.screeningPrizeId,
  }))
  const webMcpContext = {
    hackathon: {
      id: hackathon.id,
      slug: hackathon.slug,
      name: hackathon.name,
      description: hackathon.description,
      locale: descriptionLocale,
      status: hackathon.status,
      storedStatus: hackathon.stored_status ?? hackathon.status,
      phase: hackathon.phase,
      eventVersion: hackathon.updated_at,
      startsAt: hackathon.starts_at,
      endsAt: hackathon.ends_at,
      registrationOpensAt: hackathon.registration_opens_at,
      registrationClosesAt: hackathon.registration_closes_at,
      rules: hackathon.rules,
      bannerUrl: hackathon.banner_url,
      allowLateRegistration: hackathon.allow_late_registration,
      maxParticipants: hackathon.max_participants,
      locationType: hackathon.location_type,
      locationName: hackathon.location_name,
      locationUrl: hackathon.location_url,
      minTeamSize: hackathon.min_team_size ?? 1,
      maxTeamSize: hackathon.max_team_size ?? 5,
      allowSolo: hackathon.allow_solo ?? true,
      requireTeamApproval: hackathon.require_team_approval ?? false,
      anonymousJudging: hackathon.anonymous_judging ?? false,
      judgingMode: hackathon.judging_mode ?? "points",
      locationLatitude: hackathon.location_latitude,
      locationLongitude: hackathon.location_longitude,
      requireLocationVerification: hackathon.require_location_verification,
      communityUrl: hackathon.community_url,
      communityLabel: hackathon.community_label,
      requireTermsAcceptance: hackathon.require_terms_acceptance ?? false,
      termsContent: hackathon.terms_content,
      isTestEvent: hackathon.is_test_event,
    },
    stats: {
      attendeeCount: overviewStats.participantCount,
      teamCount: overviewStats.teamCount,
      pendingTeamApprovalCount: overviewStats.pendingTeamApprovalCount,
      projectCount: submissionCount,
      judgeCount,
      prizeCount: prizes.length,
      judgingAssignments: judgingProgress.totalAssignments,
      completedJudgingAssignments: judgingProgress.completedAssignments,
    },
    actionItems: actionItems.map((item) => ({
      label: item.label,
      hint: item.hint ?? null,
      severity: item.severity,
    })),
    scheduleItems: scheduleItems.map((item) => ({
      title: item.title,
      description: item.description,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      location: item.location,
    })),
    challenges: challenges.map((challenge) => ({
      title: challenge.title,
      description: challenge.description,
      resourceCount: challenge.resources.length,
    })),
    prizes: prizes.map((prize) => ({
      id: prize.id,
      name: prize.name,
      description: prize.description,
      value: prize.value,
      judgingStyle: prize.judging_style,
      judgeCount: prize.judgeCount,
      totalAssignments: prize.totalAssignments,
      completedAssignments: prize.completedAssignments,
    })),
    projects: submissions.map((submission) => ({
      title: submission.title,
      description: submission.description,
      submitterName: submission.submitter_name,
    })),
    sponsorRecords: hackathon.sponsors,
    sponsors: hackathon.sponsors.map((sponsor) => ({
      name: sponsor.name,
      tier: sponsor.tier,
    })),
    perks: perks.map((perk) => ({
      name: perk.name,
      type: perk.type,
      released: isPerkReleased(perk, hackathon.starts_at),
    })),
    announcements: announcements.map((announcement) => ({
      title: announcement.title,
      audience: announcement.audience,
      priority: announcement.priority,
      publishedAt: announcement.published_at,
    })),
  }

  return (
    <div className="space-y-6">
      <ActionItemsProvider
        actionItems={actionItems}
        persistedActionState={persistedActionState}
        hackathonId={hackathon.id}
        slug={hackathon.slug}
        name={hackathon.name}
        status={hackathon.status}
        storedStatus={(hackathon.stored_status ?? hackathon.status) as HackathonStatus}
        phase={hackathon.phase}
        challengeExists={challengeExists}
        challengeReleasedAt={hackathon.challenge_released_at}
        challenges={challenges}
        prizes={prizes}
        announcements={announcements}
        challengeReleaseItem={challengeReleaseItem ?? null}
        scheduleItems={scheduleItems}
        startsAt={hackathon.starts_at}
        endsAt={hackathon.ends_at}
        registrationOpensAt={hackathon.registration_opens_at}
        registrationClosesAt={hackathon.registration_closes_at}
        allowLateRegistration={hackathon.allow_late_registration}
        description={hackathon.description}
        descriptionLocale={descriptionLocale}
        bannerUrl={hackathon.banner_url}
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
          requireTeamApproval: hackathon.require_team_approval ?? false,
        }}
        communityInitialData={{
          url: hackathon.community_url ?? null,
          label: hackathon.community_label ?? null,
        }}
        webMcpSponsors={hackathon.sponsors}
        sponsors={hackathon.sponsors.map((s) => ({ id: s.id, name: s.name }))}
        rounds={roundsForDialogs}
        judgingSetupIssues={judgingSetupStatus.issues}
        requiresJudgeScoring={judgingSetupStatus.requiresJudgeScoring}
        judgingCompletionReadiness={judgingCompletionReadiness}
      >
        <ManageHackathonWebMcpTools context={webMcpContext} />
        {hackathon.is_test_event && <TestEventBanner hackathonId={hackathon.id} />}
        <EventHealthAlerts
          slug={hackathon.slug}
          alerts={lifecycleAlerts}
          invitationEmailCounts={invitationEmailCounts}
          failedReminderCount={failedReminderCount}
          queuedUntilPublish={(hackathon.stored_status ?? hackathon.status) === "draft"}
        />
        <TabsUrlSync paramKey="tab" value={activeTab}>
          <ActionItemsLayout>
            <div className="flex items-center gap-1.5">
              <ManageHackathonName />
              <StatusBadgeMenu />
              <HackathonPageActions
                slug={hackathon.slug}
                isOrganizer={true}
              />
            </div>
            <TabsList
              variant="line"
              className="group-data-horizontal/tabs:h-auto max-w-full flex-wrap justify-start gap-y-2"
            >
              <TabsTrigger value="action-items">Action Items<ActionItemsTabBadge /></TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="challenges">Challenges<ManageHackathonTabCount kind="challenges" /></TabsTrigger>
              <TabsTrigger value="perks">Perks{perks.length > 0 && <TabCount>{perks.length}</TabCount>}</TabsTrigger>
              <TabsTrigger value="edit">Event Page</TabsTrigger>
              <TabsTrigger value="teams" title={teamsTabTooltip}>Teams</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="judging">Judging &amp; Prizes<ManageHackathonTabCount kind="prizes" /></TabsTrigger>
              <TabsTrigger value="post-event">Post-Event</TabsTrigger>
              <TabsTrigger value="event">Communications</TabsTrigger>
              <TabsTrigger value="miscs">More</TabsTrigger>
            </TabsList>

            {activeTab === "action-items" && (
              <TabsContent value="action-items" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="action_items">
                <ActionItemsTab />
              </TabsContent>
            )}

            {activeTab === "overview" && (
              <TabsContent value="overview" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="overview schedule">
                <div className="space-y-4">
                  <LifecycleStepper
                  hackathonId={hackathon.id}
                  hackathonSlug={hackathon.slug}
                  status={hackathon.status}
                  submissionCount={submissionCount}
                  judgingProgress={judgingProgress}
                  judgingSetupIssues={judgingSetupStatus.issues}
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
                  <div data-webmcp-section="schedule">
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
                    scheduleItems={scheduleItems}
                    challengeReleasedAt={hackathon.challenge_released_at}
                    challengeExists={challengeExists}
                    hackathonStartsAt={hackathon.starts_at}
                    hackathonEndsAt={hackathon.ends_at}
                    hackathonStatus={hackathon.status}
                    />
                  </div>
                </div>
              </TabsContent>
            )}

            {activeTab === "challenges" && (
              <TabsContent value="challenges" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="challenges">
                <ChallengesTab
                hackathonId={hackathon.id}
                initialChallenges={challenges}
                releasedAt={hackathon.challenge_released_at}
                releaseScheduleItem={challengeReleaseItem ?? null}
                hackathonStartsAt={hackathon.starts_at}
                hackathonEndsAt={hackathon.ends_at}
                hackathonStatus={hackathon.status}
                />
              </TabsContent>
            )}

            {activeTab === "perks" && (
              <TabsContent value="perks" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="perks">
                <PerksTab
                hackathonId={hackathon.id}
                initialPerks={perks}
                sponsors={hackathon.sponsors.map((s) => ({ id: s.id, name: s.name }))}
                startsAt={hackathon.starts_at}
                perksNone={hackathon.perks_none ?? false}
                />
              </TabsContent>
            )}

            {activeTab === "edit" && (
              <TabsContent value="edit" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="event_page sponsors">
                <div className="rounded-lg border overflow-hidden">
                  <HackathonPreviewClient
                  hackathon={hackathon}
                  isEditable={true}
                  currentUserId={userId}
                  availableLocales={locales}
                  currentLocale={currentLocale}
                  notificationDisposition={notificationDisposition}
                  />
                </div>
              </TabsContent>
            )}

            <TabsContent value="judging" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="judging">
              <Suspense fallback={<TabLoadingSkeleton />}>
                <JudgingTabContent
                  hackathonId={hackathon.id}
                  slug={hackathon.slug}
                  submissions={submissionsForSelect}
                  resultsPublishedAt={hackathon.results_published_at}
                  activeJtab={activeJtab}
                  locationType={hackathon.location_type ?? null}
                  hackathonStatus={hackathon.stored_status ?? hackathon.status}
                  notificationDisposition={notificationDisposition}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="post-event" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="post_event">
              <Suspense fallback={<TabLoadingSkeleton />}>
                <PostEventTabContent
                  hackathonId={hackathon.id}
                  resultsPublishedAt={hackathon.results_published_at}
                  feedbackSurveySentAt={hackathon.feedback_survey_sent_at ?? null}
                  feedbackSurveyUrl={hackathon.feedback_survey_url ?? null}
                  hackathonStatus={hackathon.status}
                  activePtab={activePtab}
                />
              </Suspense>
            </TabsContent>

            {activeTab === "teams" && (
              <TabsContent value="teams" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="teams projects">
                <TeamsTab
                hackathonId={hackathon.id}
                maxTeamSize={hackathon.max_team_size ?? 5}
                minTeamSize={hackathon.min_team_size ?? 1}
                allowSolo={hackathon.allow_solo ?? true}
                requireTeamApproval={hackathon.require_team_approval ?? false}
                hackathonStatus={hackathon.stored_status ?? hackathon.status}
                notificationDisposition={notificationDisposition}
                queueReason={teamInvitationQueueReason}
                />
              </TabsContent>
            )}

            {activeTab === "people" && (
              <TabsContent value="people" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="people">
                <Suspense fallback={<TabLoadingSkeleton />}>
                  <PeopleTab
                  hackathonId={hackathon.id}
                  hackathonStatus={hackathon.stored_status ?? hackathon.status}
                  notificationDisposition={notificationDisposition}
                  />
                </Suspense>
              </TabsContent>
            )}

            {activeTab === "miscs" && (
              <TabsContent value="miscs" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="miscs">
                <MiscsTabContent
                hackathonId={hackathon.id}
                activeMtab={activeMtab}
                requireTermsAcceptance={hackathon.require_terms_acceptance ?? false}
                termsContent={hackathon.terms_content ?? null}
                />
              </TabsContent>
            )}

            {activeTab === "event" && (
              <TabsContent value="event" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="communications">
                <EventTabContent hackathonId={hackathon.id} activeEtab={activeEtab} hackathonStatus={hackathon.status} hackathonPhase={hackathon.phase} />
              </TabsContent>
            )}
            <TabsPendingFallback serverValue={activeTab}>
              <TabLoadingSkeleton />
            </TabsPendingFallback>
          </ActionItemsLayout>
        </TabsUrlSync>
      </ActionItemsProvider>
    </div>
  )
}
