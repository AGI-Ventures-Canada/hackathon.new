"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useIsClient } from "@/hooks/use-is-client"
import { useRouter, useSearchParams } from "next/navigation"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { assertOk } from "@/lib/utils/fetch"
import { EditProvider, useEdit, SECTION_ORDER } from "./edit-context"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { EditableSection } from "./editable-section"
import { EventHero } from "@/components/hackathon/event-hero"
import { SponsorSection } from "@/components/hackathon/sponsor-section"
import { JudgeSection } from "@/components/hackathon/judge-section"
import { PrizeSection } from "@/components/hackathon/prize-section"
import { SubmissionGallery, type GallerySubmission } from "@/components/hackathon/submission-gallery"
import { ParticipantTeamHeader } from "@/components/hackathon/preview/participant-team-header"
import { useTeamRename } from "@/hooks/use-team-rename"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { CopyButton } from "@/components/ui/copy-button"
import { CheckCircle2, Crown, Clock, X, Scale, Mail, CalendarClock, MapPin, AlertTriangle, Users as UsersIcon, Bell, ExternalLink } from "lucide-react"
import type { PublicHackathon } from "@/lib/services/public-hackathons"
import type { HackathonJudgeDisplay } from "@/lib/db/hackathon-types"
import type { Submission } from "@/lib/db/hackathon-types"
import type { ParticipantTeamInfo } from "@/lib/services/hackathons"
import { getTeamSizeWarning } from "@/lib/utils/team-size"
import { PublicResults } from "@/components/hackathon/results/public-results"
import { MarkdownContent } from "@/components/ui/markdown-content"
import { TruncatableContent } from "./truncatable-content"
import { canInviteTeamMembers as getCanInviteTeamMembers } from "@/lib/utils/team-invite"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { PublicPrize } from "@/lib/services/public-hackathons"
import type { PrizeType } from "@/lib/db/hackathon-types"
import type { PublicResultWithDetails } from "@/lib/services/results"
import type { ScheduleItem } from "@/lib/services/schedule-items"
import type { Announcement } from "@/lib/services/announcements"
import type { Challenge } from "@/lib/services/challenges"
import { ChallengeSection } from "@/components/hackathon/challenge-section"
import type { Perk } from "@/lib/services/perks"
import { PerksSection } from "@/components/hackathon/perks-section"
import {
  InvitationDeliveryBadge,
  QueuedEmailNotice,
} from "@/components/hackathon/email-delivery-status"
import { getInvitationDeliveryState } from "@/lib/utils/notification-delivery"
import {
  formatPreviewScheduleTime,
  getPendingInvitationTiming,
} from "./preview-date-formatting"
import {
  PREPARE_SPONSOR_EVENT,
  type PrepareSponsorEvent,
} from "@/lib/webmcp/client-events"

const FloatingActionBar = dynamic(() =>
  import("./floating-action-bar").then((module) => module.FloatingActionBar),
)
const OrganizerLogoPrompt = dynamic(() =>
  import("@/components/hackathon/organizer-logo-prompt").then(
    (module) => module.OrganizerLogoPrompt,
  ),
)
const BannerUpload = dynamic(() =>
  import("@/components/hackathon/banner-upload").then((module) => module.BannerUpload),
)
const NameEditForm = dynamic(() =>
  import("@/components/hackathon/edit-drawer/name-edit-form").then(
    (module) => module.NameEditForm,
  ),
)
const AboutEditForm = dynamic(() =>
  import("@/components/hackathon/edit-drawer/about-edit-form").then(
    (module) => module.AboutEditForm,
  ),
)
const TimelineEditForm = dynamic(() =>
  import("@/components/hackathon/edit-drawer/timeline-edit-form").then(
    (module) => module.TimelineEditForm,
  ),
)
const LocationEditForm = dynamic(() =>
  import("@/components/hackathon/edit-drawer/location-edit-form").then(
    (module) => module.LocationEditForm,
  ),
)
const SponsorsEditForm = dynamic(() =>
  import("@/components/hackathon/edit-drawer/sponsors-edit-form").then(
    (module) => module.SponsorsEditForm,
  ),
)
const CommunityEditForm = dynamic(() =>
  import("@/components/hackathon/edit-drawer/community-edit-form").then(
    (module) => module.CommunityEditForm,
  ),
)
const JudgingSetupDialog = dynamic(() =>
  import("@/components/hackathon/judging/judging-setup-dialog").then(
    (module) => module.JudgingSetupDialog,
  ),
)

interface HackathonPreviewClientProps {
  hackathon: PublicHackathon
  isEditable: boolean
  attendeeNextStep?: string
  isRegistered?: boolean
  participantRole?: string | null
  participantCount?: number
  showActionBar?: boolean
  hasJudgeAssignments?: boolean
  isPersonalWorkspace?: boolean
  submission?: Submission | null
  submissions?: GallerySubmission[]
  teamInfo?: ParticipantTeamInfo
  publicResults?: PublicResultWithDetails[]
  scheduleItems?: ScheduleItem[]
  announcements?: Announcement[]
  challenges?: Challenge[]
  viewerPerks?: Perk[]
  currentUserId?: string | null
  availableLocales?: string[]
  currentLocale?: string
  isSponsor?: boolean
  onFormSave?: (data: Record<string, unknown>) => Promise<boolean>
  onBannerChange?: (imageUrl: string | null) => void | Promise<void>
  onAuthRequired?: () => void
  notificationDisposition?: "queue" | "send" | "reject"
}

function HackathonPreviewContent({
  hackathon,
  attendeeNextStep,
  isRegistered: initialIsRegistered = false,
  participantRole = null,
  participantCount = 0,
  showActionBar = false,
  hasJudgeAssignments = false,
  isPersonalWorkspace = false,
  submission = null,
  submissions = [],
  teamInfo = null,
  publicResults = [],
  scheduleItems = [],
  announcements = [],
  challenges = [],
  viewerPerks = [],
  currentUserId = null,
  availableLocales,
  currentLocale,
  isSponsor = false,
  onFormSave,
  onBannerChange,
  onAuthRequired,
  notificationDisposition,
}: Omit<HackathonPreviewClientProps, "isEditable">) {
  const { isEditable, editMode, activeSection, openSection, closeDrawer } = useEdit()
  const router = useRouter()
  const requestedSection = useSearchParams().get("section")
  useEffect(() => {
    if (!isEditable || !editMode) return
    const section = SECTION_ORDER.find((candidate) => candidate === requestedSection)
    if (section) openSection(section)
  }, [isEditable, editMode, requestedSection, openSection])
  const actionItemsCtx = useActionItemsOptional()
  const visibleSponsors = actionItemsCtx?.manageWebMcpView.sponsors ?? hackathon.sponsors
  const manageView = isEditable ? actionItemsCtx?.manageWebMcpView : undefined
  const visibleName = manageView?.details.name ?? hackathon.name
  const visibleDescription = manageView
    ? manageView.details.description
    : hackathon.description
  const visibleStartsAt = manageView
    ? manageView.timeline.startsAt
    : hackathon.starts_at
  const visibleEndsAt = manageView
    ? manageView.timeline.endsAt
    : hackathon.ends_at
  const visibleScheduleItems = manageView?.scheduleItems ?? scheduleItems
  const submissionDeadline = visibleScheduleItems.find(
    (item) => item.trigger_type === "submission_deadline",
  )?.starts_at ?? visibleEndsAt
  const visibleChallenges = manageView?.challenges ?? challenges
  const isClient = useIsClient()
  const origin = isClient ? window.location.origin : ""
  const primaryLocale = hackathon.default_locale ?? "en"
  const translationLocale =
    currentLocale && currentLocale !== primaryLocale ? currentLocale : null
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set())
  const [isRegistered, setIsRegistered] = useState(initialIsRegistered)
  const [justRegistered, setJustRegistered] = useState(false)
  const [bannerUrl, setBannerUrl] = useState(hackathon.banner_url)
  const [pendingJudges, setPendingJudges] = useState<HackathonJudgeDisplay[]>([])
  const [pendingPrizes, setPendingPrizes] = useState<PublicPrize[]>([])
  const [judgingDialogOpen, setJudgingDialogOpen] = useState(false)
  const [nowIso, setNowIso] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => setNowIso(new Date().toISOString())
    tick()
    const interval = setInterval(tick, 30_000)
    return () => clearInterval(interval)
  }, [])
  const [preparedSponsor, setPreparedSponsor] = useState<{
    name: string
    revision: number
  }>()
  const invitationHackathonStatus = hackathon.stored_status ?? hackathon.status
  const invitationQueueReason = notificationDisposition === "send" &&
    nowIso !== null &&
    hackathon.registration_opens_at !== null &&
    new Date(nowIso).getTime() < new Date(hackathon.registration_opens_at).getTime()
    ? "registration_not_open"
    : "event_draft"
  const queuedInvitationCount = teamInfo?.pendingInvitations.filter(
    (invitation) => getInvitationDeliveryState({
      emailedAt: invitation.emailedAt,
      hackathonStatus: invitationHackathonStatus,
      notificationDisposition,
      queueReason: invitationQueueReason,
    }) === "queued",
  ).length ?? 0

  const judgeDisplayKey = useCallback(
    (judge: Pick<HackathonJudgeDisplay, "name" | "headshot_url">) =>
      `${judge.name}\u0000${judge.headshot_url ?? ""}`,
    [],
  )

  useEffect(() => {
    setBannerUrl(hackathon.banner_url)
  }, [hackathon.banner_url])

  useEffect(() => {
    const prepareSponsor = (rawEvent: Event) => {
      const event = rawEvent as PrepareSponsorEvent
      if (!isEditable) {
        event.detail.acknowledge({
          ok: false,
          error: {
            code: "preparation_unavailable",
            message: "Open this event as an organizer, then try again.",
            retryable: false,
          },
        })
        return
      }
      setPreparedSponsor((current) => ({
        name: event.detail.name,
        revision: (current?.revision ?? 0) + 1,
      }))
      openSection("sponsors")
      event.detail.acknowledge({ ok: true })
    }
    window.addEventListener(PREPARE_SPONSOR_EVENT, prepareSponsor)
    return () => window.removeEventListener(PREPARE_SPONSOR_EVENT, prepareSponsor)
  }, [isEditable, openSection])

  useEffect(() => {
    const serverIds = new Set(hackathon.prizes.map((p) => p.id))
    setPendingPrizes((prev) => prev.filter((p) => !serverIds.has(p.id)))
  }, [hackathon.prizes])

  useEffect(() => {
    const serverJudges = new Set(hackathon.judges.map(judgeDisplayKey))
    setPendingJudges((previous) =>
      previous.filter((judge) => !serverJudges.has(judgeDisplayKey(judge))),
    )
  }, [hackathon.judges, judgeDisplayKey])

  const displayJudges = useMemo(() => {
    const serverJudges = new Set(hackathon.judges.map(judgeDisplayKey))
    return [
      ...hackathon.judges,
      ...pendingJudges.filter((judge) => !serverJudges.has(judgeDisplayKey(judge))),
    ]
  }, [hackathon.judges, judgeDisplayKey, pendingJudges])
  const displayPrizes = useMemo(() => {
    const serverIds = new Set(hackathon.prizes.map((p) => p.id))
    const pendingIds = new Set(pendingPrizes.map((p) => p.id))
    return [
      ...hackathon.prizes,
      ...pendingPrizes.filter((p) => !serverIds.has(p.id)),
      ...(manageView?.prizes ?? []).filter(
        (prize) => !serverIds.has(prize.id) && !pendingIds.has(prize.id),
      ),
    ]
  }, [hackathon.prizes, manageView?.prizes, pendingPrizes])

  const isChallengesFreshlyReleased = useMemo(() => {
    if (!isClient) return false
    if (!hackathon.challenge_released_at) return false
    if (!nowIso) return false
    const releasedAt = new Date(hackathon.challenge_released_at).getTime()
    const now = new Date(nowIso).getTime()
    return now - releasedAt < 24 * 60 * 60 * 1000
  }, [isClient, hackathon.challenge_released_at, nowIso])

  const rename = useTeamRename(hackathon.id, teamInfo?.team.id ?? "", teamInfo?.team.name ?? "")
  const isPendingTeam = teamInfo?.team.status === "pending_approval"
  const canManageTeam = teamInfo?.isCaptain && (teamInfo.team.status === "forming" || teamInfo.team.status === "pending_approval")
  const canInviteTeamMembers = getCanInviteTeamMembers({
    isFormingCaptain: canManageTeam,
    hackathonStatus: hackathon.status,
    startsAt: visibleStartsAt,
    endsAt: visibleEndsAt,
    registrationClosesAt: hackathon.registration_closes_at,
    allowLateRegistration: hackathon.allow_late_registration,
    nowIso,
  })
  const showCommunityTab =
    (isEditable && editMode) ||
    (isRegistered && !isPendingTeam && Boolean(hackathon.community_url))

  const handleRegistrationSuccess = () => {
    setIsRegistered(true)
    setJustRegistered(true)
  }

  function handleSaveAndNext(currentSection: string) {
    const idx = SECTION_ORDER.indexOf(currentSection as typeof SECTION_ORDER[number])
    if (idx >= 0 && idx < SECTION_ORDER.length - 1) {
      openSection(SECTION_ORDER[idx + 1])
    } else {
      closeDrawer()
    }
  }

  useEffect(() => {
    if (!actionItemsCtx || !isEditable) return
    const { registerTabAction, unregisterTabAction } = actionItemsCtx
    registerTabAction("no-dates", () => openSection("dates"))
    registerTabAction("no-description", () => openSection("about"))
    registerTabAction("no-location", () => openSection("location"))
    registerTabAction("no-banner", () => {
      document.querySelector("[data-banner-upload]")?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    return () => {
      unregisterTabAction("no-dates")
      unregisterTabAction("no-description")
      unregisterTabAction("no-location")
      unregisterTabAction("no-banner")
    }
  }, [actionItemsCtx, isEditable, openSection])

  const autoOpenedName = useRef(false)
  useEffect(() => {
    if (isEditable && editMode && !visibleName.trim() && !activeSection && !autoOpenedName.current) {
      autoOpenedName.current = true
      openSection("name")
    }
  }, [isEditable, editMode, visibleName, activeSection, openSection])

  async function handleCancelInvitation(invitationId: string) {
    if (!teamInfo) return
    setCancellingId(invitationId)
    try {
      const res = await fetch(
        `/api/dashboard/teams/${teamInfo.team.id}/invitations/${invitationId}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setCancellingId(null)
    }
  }

  const { execute: handleRemindInvitation, error: remindError } = useOptimisticMutation({
    fn: (invitationId: string) =>
      fetch(
        `/api/dashboard/teams/${teamInfo!.team.id}/invitations/${invitationId}/remind`,
        { method: "POST" }
      ).then(assertOk),
    onOptimistic: (invitationId) =>
      setRemindedIds((prev) => new Set(prev).add(invitationId)),
    onRevert: (invitationId) =>
      setRemindedIds((prev) => {
        const next = new Set(prev)
        next.delete(invitationId)
        return next
      }),
  })

  const isJudge = participantRole === "judge"

  const judgeStatus = isJudge && (
    <div className="flex items-center gap-3">
      {hasJudgeAssignments && (
        <Button
          onClick={() => router.push(`/e/${hackathon.slug}/judge`)}
        >
          <Scale className="size-4" />
          Enter Judge Mode
        </Button>
      )}
      <span className="text-xs text-muted-foreground">You&apos;re assigned as a judge</span>
    </div>
  )

  const registrationStatus = isRegistered && participantRole === "participant" && (
    <div className={`space-y-2.5 ${justRegistered ? "animate-in fade-in duration-500" : ""}`}>
      {attendeeNextStep && (
        <div className="space-y-1" role="status">
          <p className="text-sm font-semibold">What’s next?</p>
          <p className="text-sm text-muted-foreground">{attendeeNextStep}</p>
        </div>
      )}
      <ParticipantTeamHeader
        teamInfo={teamInfo}
        hackathonId={hackathon.id}
        maxTeamSize={hackathon.max_team_size ?? 5}
        canRenameTeam={Boolean(canManageTeam)}
        canInviteTeamMembers={canInviteTeamMembers}
        rename={rename}
      />
      {isPendingTeam && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Your team is waiting for approval. You can invite teammates, but you can&apos;t submit yet.
        </div>
      )}
      {rename.error && (
        <p className="text-xs text-destructive px-3">{rename.error}</p>
      )}
      {teamInfo?.isCaptain && (
        <p className="text-xs text-muted-foreground px-1">
          {canInviteTeamMembers
            ? "You’re the team captain — you can invite members and rename your team."
            : canManageTeam
              ? "You’re the team captain — you can rename your team."
              : "You’re the team captain."}
        </p>
      )}
      {teamInfo && (
        <div className="space-y-1 pl-1">
          <QueuedEmailNotice count={queuedInvitationCount} reason={invitationQueueReason} />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {teamInfo.members.length} / {hackathon.max_team_size} members
              {teamInfo.pendingInvitations.length > 0 && (
                <> &middot; {teamInfo.pendingInvitations.length} pending</>
              )}
            </span>
          </div>
          {(() => {
            const warning = getTeamSizeWarning({
              memberCount: teamInfo.members.length,
              minTeamSize: hackathon.min_team_size,
              allowSolo: hackathon.allow_solo,
              pendingInviteCount: teamInfo.pendingInvitations.length,
            })
            if (!warning) return null
            return (
              <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2">
                <AlertTriangle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                <span className="text-xs text-destructive">{warning.message}</span>
              </div>
            )
          })()}
          <div className="space-y-0.5">
            {teamInfo.members.map((member) => {
              const isCurrentUser = member.clerkUserId === currentUserId
              const displayName = isCurrentUser
                ? (member.displayName || "You")
                : (member.displayName || "Teammate")
              const initials = displayName[0]?.toUpperCase() ?? "?"
              return (
                <div key={member.clerkUserId} className="flex items-center gap-2">
                  <Avatar className="size-5 shrink-0">
                    <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs truncate">{displayName}{isCurrentUser && " (you)"}</span>
                  {member.email && <span className="text-xs text-muted-foreground truncate">{member.email}</span>}
                  {member.isCaptain && <Crown className="size-3 text-primary shrink-0" />}
                  <Badge variant="secondary" className="shrink-0">
                    <CheckCircle2 />
                    Joined
                  </Badge>
                </div>
              )
            })}
            {teamInfo.pendingInvitations.map((invitation) => {
              const invitationTiming = getPendingInvitationTiming({
                createdAt: invitation.createdAt,
                expiresAt: invitation.expiresAt,
                isClient,
                nowIso,
              })
              const deliveryState = getInvitationDeliveryState({
                emailedAt: invitation.emailedAt,
                hackathonStatus: invitationHackathonStatus,
                notificationDisposition,
                queueReason: invitationQueueReason,
              })

              return (
                <Popover key={invitation.id}>
                  <div className="group/row flex items-center gap-2">
                    <Avatar className="size-5 shrink-0">
                      <AvatarFallback className="text-[9px]">
                        <Mail className="size-2.5" />
                      </AvatarFallback>
                    </Avatar>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground truncate">{invitation.email}</span>
                        <InvitationDeliveryBadge
                          emailedAt={invitation.emailedAt}
                          remindedAt={invitation.remindedAt}
                          hackathonStatus={invitationHackathonStatus}
                          notificationDisposition={notificationDisposition}
                          queueReason={invitationQueueReason}
                        />
                      </button>
                    </PopoverTrigger>
                    {teamInfo.isCaptain && (
                      <div className="flex items-center gap-0.5">
                        {invitation.token && (
                          <>
                            <a
                              href={`${origin}/invite/${invitation.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity max-sm:opacity-100"
                            >
                              <ExternalLink className="size-3" />
                              <span className="sr-only">Open invite link</span>
                            </a>
                            <CopyButton
                              value={`${origin}/invite/${invitation.token}`}
                              size="icon"
                              className="size-7 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity max-sm:opacity-100"
                            />
                          </>
                        )}
                        {(notificationDisposition === undefined
                          ? deliveryState !== "queued"
                          : notificationDisposition === "send") && !invitationTiming.isExpired && !(invitation.remindedAt || remindedIds.has(invitation.id)) && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity max-sm:opacity-100"
                            onClick={() => handleRemindInvitation(invitation.id)}
                          >
                            <Bell className="size-3" />
                            <span className="sr-only">Remind</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity max-sm:opacity-100"
                          onClick={() => handleCancelInvitation(invitation.id)}
                          disabled={cancellingId === invitation.id}
                        >
                          <X className="size-3" />
                          <span className="sr-only">Cancel</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  <PopoverContent side="top" align="start" className="w-56">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Mail className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-xs break-all">{invitation.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="size-3.5 shrink-0" />
                        <span className="text-xs">
                          {deliveryState === "queued"
                            ? "Not sent yet — this event is a draft"
                            : deliveryState === "not_sent"
                              ? "This email wasn't sent"
                              : invitationTiming.sentLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className={`size-3.5 shrink-0 ${invitationTiming.isExpired ? "text-destructive" : "text-muted-foreground"}`} />
                        <span className={`text-xs ${invitationTiming.isExpired ? "text-destructive" : "text-muted-foreground"}`}>
                          {invitationTiming.expiryLabel}
                        </span>
                      </div>
                      {(invitation.remindedAt || remindedIds.has(invitation.id)) && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Bell className="size-3.5 shrink-0" />
                          <span className="text-xs">Reminder sent</span>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )
            })}
          </div>
          {remindError && <p className="text-sm text-destructive">{remindError}</p>}
        </div>
      )}
    </div>
  )

  const statusSlot = judgeStatus || registrationStatus || null

  const bannerEditSlot = isEditable && editMode ? (
    <div data-banner-upload>
      <BannerUpload
        hackathonId={hackathon.id}
        currentBannerUrl={bannerUrl}
        variant="hero"
        mode={hackathon.id === "draft" ? "draft" : "persisted"}
        onUploadComplete={(url) => {
          const nextUrl = url ?? null
          setBannerUrl(nextUrl)
          void onBannerChange?.(nextUrl)
        }}
        onAuthRequired={onAuthRequired}
      />
    </div>
  ) : null

  const sponsorsBlock = isEditable && editMode && activeSection === "sponsors" ? (
    <div data-edit-section="sponsors" className="scroll-mt-24">
      <SponsorsEditForm
        hackathonId={hackathon.id}
        initialSponsors={visibleSponsors}
        onSaveAndNext={() => handleSaveAndNext("sponsors")}
        onSave={onFormSave ? (data) => onFormSave(data) : undefined}
        preparedName={preparedSponsor?.name}
        preparedNameRevision={preparedSponsor?.revision}
      />
    </div>
  ) : (
    <EditableSection
      section="sponsors"
      isEmpty={visibleSponsors.length === 0}
      emptyLabel="Click to add sponsors"
    >
      <SponsorSection sponsors={visibleSponsors} />
    </EditableSection>
  )

  const judgingBlock = (
    <EditableSection
      section="judging"
      isEmpty={displayJudges.length === 0 && displayPrizes.length === 0}
      emptyLabel="Click to setup judges and prizes"
      onClick={() => {
        if (!judgingDialogOpen) setJudgingDialogOpen(true)
      }}
    >
      <JudgeSection judges={displayJudges} />
      <PrizeSection
        prizes={displayPrizes}
        hackathonSlug={hackathon.slug}
        hackathonStatus={hackathon.status}
      />
    </EditableSection>
  )

  const communityBlock = isEditable && editMode && activeSection === "community" ? (
    <div data-edit-section="community" className="scroll-mt-24">
      <CommunityEditForm
        hackathonId={hackathon.id}
        initialUrl={hackathon.community_url}
        initialLabel={hackathon.community_label}
        onSaveAndNext={() => handleSaveAndNext("community")}
        onSave={onFormSave ? (data) => onFormSave(data) : undefined}
        locale={translationLocale}
      />
    </div>
  ) : (() => {
    const hasLink = !!hackathon.community_url
    if (!isEditable && !hasLink) return null
    if (!isEditable && !isRegistered) return null
    return (
      <EditableSection
        section="community"
        isEmpty={!hasLink}
        emptyLabel="Click to add a community/help link for attendees"
      >
        {hasLink && (
          <div className="rounded-lg border p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-full bg-primary/10 p-2 shrink-0">
                <UsersIcon className="size-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Community & help</p>
                <p className="text-xs text-muted-foreground truncate">
                  Join other attendees and get support from the organizers.
                </p>
              </div>
            </div>
            <Button asChild size="sm">
              <a href={hackathon.community_url!} target="_blank" rel="noopener noreferrer">
                {hackathon.community_label || "Join community"}
              </a>
            </Button>
          </div>
        )}
      </EditableSection>
    )
  })()

  const eventContent = (
    <>
      {isEditable && (
        <JudgingSetupDialog
          hackathonId={hackathon.id}
          slug={hackathon.slug}
          open={judgingDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setJudgingDialogOpen(false)
              router.refresh()
            }
          }}
          onJudgeAdded={(judge) => {
            setPendingJudges((prev) => [
              ...prev,
              {
                id: `pending-${Date.now()}`,
                hackathon_id: hackathon.id,
                name: judge.displayName,
                title: null,
                organization: null,
                headshot_url: judge.imageUrl,
                clerk_user_id: null,
                participant_id: null,
                display_order: 9999,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ])
          }}
          onPrizeAdded={(prize) => {
            setPendingPrizes((prev) => [
              ...prev,
              {
                id: prize.id,
                hackathon_id: hackathon.id,
                name: prize.name,
                description: prize.description,
                value: prize.value,
                type: (["score", "favorite", "crowd", "criteria"] as PrizeType[]).includes(prize.type as PrizeType)
                  ? (prize.type as PublicPrize["type"])
                  : "score",
                rank: null,
                kind: "prize",
                criteria_id: null,
                prize_track_id: null,
                judging_style: prize.judgingStyle,
                round_id: null,
                assignment_mode: null,
                max_picks: null,
                is_screening: false,
                display_order: 9999,
                display_value: null,
                allowed_team_modes: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ])
          }}
        />
      )}

      <section className="py-12 border-t">
        <div className="mx-auto max-w-4xl px-4">
          <Tabs
            key={isChallengesFreshlyReleased ? "tabs-fresh" : "tabs-default"}
            defaultValue={!isPendingTeam && isChallengesFreshlyReleased ? "challenges" : "overview"}
            className="w-full"
          >
            <div className="overflow-x-auto overflow-y-hidden">
              <TabsList variant="line">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                {!isPendingTeam && visibleChallenges.length > 0 && (
                  <TabsTrigger value="challenges">
                    <span className="flex items-center gap-1.5">
                      Challenges
                      {isChallengesFreshlyReleased && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">
                          New
                        </Badge>
                      )}
                    </span>
                  </TabsTrigger>
                )}
                {!isPendingTeam && viewerPerks.length > 0 && (
                  <TabsTrigger value="perks">Perks</TabsTrigger>
                )}
                {showCommunityTab && (
                  <TabsTrigger value="community">Community</TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-6 space-y-8">
              {publicResults.length > 0 && (
                <PublicResults results={publicResults} />
              )}

              {announcements.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold mb-4">Announcements</h2>
                  <div className="space-y-3">
                    {announcements.map((a) => (
                      <div key={a.id}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{a.title}</p>
                          {a.priority === "urgent" && <Badge variant="destructive">urgent</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{a.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isEditable && editMode && activeSection === "about" ? (
                <div data-edit-section="about" className="scroll-mt-24">
                  <h2 className="text-xl font-bold mb-4">About</h2>
                  <AboutEditForm
                    hackathonId={hackathon.id}
                    initialData={{ description: visibleDescription }}
                    onSaveAndNext={() => handleSaveAndNext("about")}
                    onSave={onFormSave ? (data) => onFormSave(data) : undefined}
                    locale={translationLocale}
                  />
                </div>
              ) : (
                <EditableSection
                  section="about"
                  isEmpty={!visibleDescription}
                  emptyLabel="Click to add description"
                >
                  {visibleDescription && (
                    <div>
                      <h2 className="text-xl font-bold mb-4">About</h2>
                      <TruncatableContent>
                        <MarkdownContent>{visibleDescription}</MarkdownContent>
                      </TruncatableContent>
                    </div>
                  )}
                </EditableSection>
              )}

              {sponsorsBlock}
              {judgingBlock}
            </TabsContent>

            <TabsContent value="schedule" className="mt-6">
              {visibleScheduleItems.length > 0 ? (
                <div className="space-y-3">
                  {visibleScheduleItems.map((item) => {
                    const isCurrent = Boolean(
                      nowIso && item.ends_at && item.starts_at <= nowIso && item.ends_at > nowIso,
                    )
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 ${isCurrent ? "rounded-md bg-primary/5 -mx-2 px-2 py-1" : ""}`}
                      >
                        <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-16 pt-0.5 text-right">
                          {formatPreviewScheduleTime(item.starts_at, isClient)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{item.title}</p>
                            {isCurrent && <Badge variant="secondary">Now</Badge>}
                          </div>
                          {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                          {item.location && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <MapPin className="size-3" />
                              {item.location}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No schedule items yet.</p>
              )}
            </TabsContent>

            {!isPendingTeam && visibleChallenges.length > 0 && (
              <TabsContent value="challenges" className="mt-6">
                <ChallengeSection
                  challenges={visibleChallenges}
                  releasedAt={hackathon.challenge_released_at}
                  showResources
                />
              </TabsContent>
            )}

            {!isPendingTeam && viewerPerks.length > 0 && (
              <TabsContent value="perks" className="mt-6">
                <PerksSection
                  perks={viewerPerks}
                  sponsors={hackathon.sponsors.map((s) => ({ id: s.id, name: s.name }))}
                />
              </TabsContent>
            )}

            {showCommunityTab && (
              <TabsContent value="community" className="mt-6">
                {communityBlock}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </section>

      <SubmissionGallery submissions={submissions} />
    </>
  )

  const heroContent = (
    <EventHero
      name={visibleName}
      bannerUrl={bannerUrl}
      status={hackathon.status}
      startsAt={visibleStartsAt}
      endsAt={visibleEndsAt}
      registrationOpensAt={hackathon.registration_opens_at}
      registrationClosesAt={hackathon.registration_closes_at}
      organizer={hackathon.organizer}
      locationType={hackathon.location_type}
      locationName={hackathon.location_name}
      locationUrl={hackathon.location_url}
      onNameClick={isEditable && editMode && activeSection !== "name" ? () => openSection("name") : undefined}
      onDatesClick={isEditable && editMode && activeSection !== "dates" ? () => openSection("dates") : undefined}
      onLocationClick={isEditable && editMode && activeSection !== "location" ? () => openSection("location") : undefined}
      nameEditSlot={isEditable && editMode && activeSection === "name" ? (
        <NameEditForm
          hackathonId={hackathon.id}
          initialName={visibleName}
          onSaveAndNext={() => handleSaveAndNext("name")}
          onSave={onFormSave ? (data) => onFormSave(data) : undefined}
          locale={translationLocale}
        />
      ) : undefined}
      datesEditSlot={isEditable && editMode && activeSection === "dates" ? (
        <TimelineEditForm
          hackathonId={hackathon.id}
          initialData={{
            startsAt: visibleStartsAt,
            endsAt: visibleEndsAt,
            allowLateRegistration: hackathon.allow_late_registration,
          }}
          onSaveAndNext={() => handleSaveAndNext("dates")}
          onSave={onFormSave ? (data) => onFormSave({
            startsAt: data.startsAt?.toISOString() ?? null,
            endsAt: data.endsAt?.toISOString() ?? null,
            allowLateRegistration: data.allowLateRegistration,
          }) : undefined}
        />
      ) : undefined}
      locationEditSlot={isEditable && editMode && activeSection === "location" ? (
        <LocationEditForm
          hackathonId={hackathon.id}
          initialData={{
            locationType: hackathon.location_type,
            locationName: hackathon.location_name,
            locationUrl: hackathon.location_url,
          }}
          onSaveAndNext={() => handleSaveAndNext("location")}
          onSave={onFormSave ? (data) => onFormSave(data) : undefined}
          locale={translationLocale}
        />
      ) : undefined}
      isRegistered={isRegistered}
      hideRegistrationButton={isJudge || isSponsor}
      isOrganizer={isEditable && !editMode}
      isJudge={isJudge}
      isPersonalWorkspace={isPersonalWorkspace}
      hackathonSlug={hackathon.slug}
      statusSlot={(isEditable && editMode) ? undefined : statusSlot}
      bannerSlot={bannerEditSlot}
      orgNameWrapper={(isEditable && editMode) && !hackathon.organizer.logo_url
        ? (name) => <OrganizerLogoPrompt>{name}</OrganizerLogoPrompt>
        : undefined
      }
      availableLocales={availableLocales}
      currentLocale={currentLocale}
      registrationProps={(isEditable && editMode) ? undefined : isJudge || isSponsor ? undefined : {
        hackathonSlug: hackathon.slug,
        status: hackathon.status,
        startsAt: visibleStartsAt,
        endsAt: visibleEndsAt,
        registrationOpensAt: hackathon.registration_opens_at,
        registrationClosesAt: hackathon.registration_closes_at,
        allowLateRegistration: hackathon.allow_late_registration,
        maxParticipants: hackathon.max_participants,
        participantCount,
        isRegistered,
        requireLocationVerification: hackathon.require_location_verification,
        requireTermsAcceptance: hackathon.require_terms_acceptance ?? false,
        termsContent: hackathon.terms_content ?? null,
        termsHash: hackathon.terms_hash ?? null,
        submission,
        onRegistrationSuccess: handleRegistrationSuccess,
        canSubmit: !isPendingTeam,
        teamStatus: teamInfo?.team.status ?? null,
        submissionDeadline,
        teamSizeWarning: teamInfo ? (getTeamSizeWarning({
          memberCount: teamInfo.members.length,
          minTeamSize: hackathon.min_team_size,
          allowSolo: hackathon.allow_solo,
          pendingInviteCount: teamInfo.pendingInvitations.length,
        })?.message ?? null) : (!hackathon.allow_solo ? `Solo participants are not allowed — this event requires teams of at least ${hackathon.min_team_size}.` : null),
      }}
    />
  )

  return (
    <>
      {showActionBar && isEditable && (
        <FloatingActionBar isOrganizer={isEditable} />
      )}
      <div className="pb-16">
        {heroContent}
        {eventContent}
      </div>
    </>
  )
}

export function HackathonPreviewClient({
  hackathon,
  isEditable,
  isRegistered,
  attendeeNextStep,
  notificationDisposition,
  participantRole,
  participantCount,
  showActionBar = false,
  hasJudgeAssignments = false,
  isPersonalWorkspace = false,
  submission,
  submissions,
  teamInfo,
  publicResults,
  scheduleItems,
  announcements,
  challenges,
  viewerPerks,
  currentUserId,
  availableLocales,
  currentLocale,
  isSponsor,
  onFormSave,
  onBannerChange,
  onAuthRequired,
}: HackathonPreviewClientProps) {
  return (
    <EditProvider isEditable={isEditable} defaultEditMode={!showActionBar}>
      <HackathonPreviewContent
        hackathon={hackathon}
        isRegistered={isRegistered}
        attendeeNextStep={attendeeNextStep}
        notificationDisposition={notificationDisposition}
        participantRole={participantRole}
        participantCount={participantCount}
        showActionBar={showActionBar}
        hasJudgeAssignments={hasJudgeAssignments}
        isPersonalWorkspace={isPersonalWorkspace}
        submission={submission}
        submissions={submissions}
        teamInfo={teamInfo}
        publicResults={publicResults}
        scheduleItems={scheduleItems}
        announcements={announcements}
        challenges={challenges}
        viewerPerks={viewerPerks}
        currentUserId={currentUserId}
        availableLocales={availableLocales}
        currentLocale={currentLocale}
        isSponsor={isSponsor}
        onFormSave={onFormSave}
        onBannerChange={onBannerChange}
        onAuthRequired={onAuthRequired}
      />
    </EditProvider>
  )
}
