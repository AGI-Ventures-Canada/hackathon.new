"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { EditProvider, useEdit, SECTION_ORDER } from "./edit-context"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { EditableSection } from "./editable-section"
import { FloatingActionBar } from "./floating-action-bar"
import { OrganizerLogoPrompt } from "@/components/hackathon/organizer-logo-prompt"
import { EventHero } from "@/components/hackathon/event-hero"
import { BannerUpload } from "@/components/hackathon/banner-upload"
import { SponsorSection } from "@/components/hackathon/sponsor-section"
import { JudgeSection } from "@/components/hackathon/judge-section"
import { PrizeSection } from "@/components/hackathon/prize-section"
import { SubmissionGallery, type GallerySubmission } from "@/components/hackathon/submission-gallery"
import { TeamInviteDialog } from "@/components/hackathon/team-invite-dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { CheckCircle2, Crown, Clock, X, Lock, Scale, Mail, CalendarClock, MapPin } from "lucide-react"
import { formatDateTimeDisplay } from "@/lib/utils/format"
import type { PublicHackathon } from "@/lib/services/public-hackathons"
import type { HackathonJudgeDisplay } from "@/lib/db/hackathon-types"
import type { Submission } from "@/lib/db/hackathon-types"
import type { ParticipantTeamInfo } from "@/lib/services/hackathons"
import { PublicResults } from "@/components/hackathon/results/public-results"
import { MarkdownContent } from "@/components/ui/markdown-content"
import { TruncatableContent } from "./truncatable-content"
import { NameEditForm } from "@/components/hackathon/edit-drawer/name-edit-form"
import { AboutEditForm } from "@/components/hackathon/edit-drawer/about-edit-form"
import { TimelineEditForm } from "@/components/hackathon/edit-drawer/timeline-edit-form"
import { LocationEditForm } from "@/components/hackathon/edit-drawer/location-edit-form"
import { SponsorsEditForm } from "@/components/hackathon/edit-drawer/sponsors-edit-form"
import { JudgesEditForm } from "@/components/hackathon/edit-drawer/judges-edit-form"
import { PrizesEditForm } from "@/components/hackathon/edit-drawer/prizes-edit-form"
import type { PublicResultWithDetails } from "@/lib/services/results"
import type { ScheduleItem } from "@/lib/services/schedule-items"
import type { Announcement } from "@/lib/services/announcements"

interface HackathonPreviewClientProps {
  hackathon: PublicHackathon
  isEditable: boolean
  isRegistered?: boolean
  participantRole?: string | null
  participantCount?: number
  showActionBar?: boolean
  hasJudgeAssignments?: boolean
  submission?: Submission | null
  submissions?: GallerySubmission[]
  teamInfo?: ParticipantTeamInfo
  publicResults?: PublicResultWithDetails[]
  scheduleItems?: ScheduleItem[]
  announcements?: Announcement[]
  currentUserId?: string | null
  onFormSave?: (data: Record<string, unknown>) => Promise<boolean>
  onBannerChange?: (imageUrl: string | null) => void | Promise<void>
  onAuthRequired?: () => void
}

function HackathonPreviewContent({
  hackathon,
  isRegistered: initialIsRegistered = false,
  participantRole = null,
  participantCount = 0,
  showActionBar = false,
  hasJudgeAssignments = false,
  submission = null,
  submissions = [],
  teamInfo = null,
  publicResults = [],
  scheduleItems = [],
  announcements = [],
  currentUserId = null,
  onFormSave,
  onBannerChange,
  onAuthRequired,
}: Omit<HackathonPreviewClientProps, "isEditable">) {
  const { isEditable, editMode, activeSection, openSection, closeDrawer } = useEdit()
  const router = useRouter()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState(initialIsRegistered)
  const [justRegistered, setJustRegistered] = useState(false)
  const [bannerUrl, setBannerUrl] = useState(hackathon.banner_url)
  const [optimisticJudges, setOptimisticJudges] = useState<HackathonJudgeDisplay[] | null>(null)

  useEffect(() => {
    setOptimisticJudges(null)
  }, [hackathon.judges])

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

  const actionItemsCtx = useActionItemsOptional()
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
    if (isEditable && editMode && !hackathon.name.trim() && !activeSection && !autoOpenedName.current) {
      autoOpenedName.current = true
      openSection("name")
    }
  }, [isEditable, editMode, hackathon.name, activeSection, openSection])

  const hasTimeline = hackathon.registration_opens_at || hackathon.registration_closes_at || hackathon.starts_at || hackathon.ends_at

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
      <div className="flex items-center gap-2.5 rounded-lg border bg-muted/50 px-3 py-2.5">
        <CheckCircle2 className="size-4 text-primary shrink-0" />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium">Registered</span>
          {teamInfo && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground truncate">{teamInfo.team.name}</span>
              {teamInfo.team.status === "locked" && (
                <Lock className="size-3 text-muted-foreground shrink-0" />
              )}
            </>
          )}
        </div>
        {teamInfo && teamInfo.isCaptain && teamInfo.team.status === "forming" &&
          (!hackathon.registration_closes_at || new Date(hackathon.registration_closes_at) > new Date()) && (
          <TeamInviteDialog
            teamId={teamInfo.team.id}
            hackathonId={hackathon.id}
            teamName={teamInfo.team.name}
            maxTeamSize={hackathon.max_team_size ?? 5}
          />
        )}
      </div>
      {teamInfo && (
        <div className="space-y-1 pl-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {teamInfo.members.length + teamInfo.pendingInvitations.length} / {hackathon.max_team_size} members
            </span>
          </div>
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
                  <Badge variant="secondary" className="ml-auto">
                    <CheckCircle2 />
                    Joined
                  </Badge>
                </div>
              )
            })}
            {teamInfo.pendingInvitations.map((invitation) => {
              const sentAt = new Date(invitation.createdAt)
              const expiresAt = new Date(invitation.expiresAt)
              const now = new Date()
              const isExpired = expiresAt < now
              const hoursLeft = Math.max(0, (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))

              return (
                <Popover key={invitation.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-5 shrink-0">
                      <AvatarFallback className="text-[9px]">
                        <Mail className="size-2.5" />
                      </AvatarFallback>
                    </Avatar>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs text-muted-foreground truncate">{invitation.email}</span>
                        <Badge variant="outline" className="ml-auto shrink-0">
                          <Clock />
                          Pending
                        </Badge>
                      </button>
                    </PopoverTrigger>
                    {teamInfo.isCaptain && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-4 shrink-0"
                        onClick={() => handleCancelInvitation(invitation.id)}
                        disabled={cancellingId === invitation.id}
                      >
                        <X className="size-3" />
                        <span className="sr-only">Cancel</span>
                      </Button>
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
                          Sent {sentAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className={`size-3.5 shrink-0 ${isExpired ? "text-destructive" : "text-muted-foreground"}`} />
                        <span className={`text-xs ${isExpired ? "text-destructive" : "text-muted-foreground"}`}>
                          {isExpired
                            ? "Expired"
                            : hoursLeft < 48
                              ? `Expires in ${Math.ceil(hoursLeft)}h`
                              : `Expires ${expiresAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                          }
                        </span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )
            })}
          </div>
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

  const eventContent = (
    <>
      {isEditable && editMode && activeSection === "sponsors" ? (
        <div data-edit-section="sponsors" className="py-12 scroll-mt-24">
          <div className="mx-auto max-w-4xl px-4">
            <SponsorsEditForm
              hackathonId={hackathon.id}
              initialSponsors={hackathon.sponsors}
              onSaveAndNext={() => handleSaveAndNext("sponsors")}
              onSave={onFormSave ? (data) => onFormSave(data) : undefined}
            />
          </div>
        </div>
      ) : (
        <EditableSection
          section="sponsors"
          isEmpty={hackathon.sponsors.length === 0}
          emptyLabel="Click to add sponsors"
          className="py-12"
        >
          <SponsorSection sponsors={hackathon.sponsors} />
        </EditableSection>
      )}

      {isEditable && editMode && activeSection === "judges" ? (
        <div data-edit-section="judges" className="py-12 scroll-mt-24">
          <div className="mx-auto max-w-4xl px-4">
            <JudgesEditForm
              hackathonId={hackathon.id}
              initialJudges={hackathon.judges}
              onSaveAndNext={() => handleSaveAndNext("judges")}
              onJudgesChange={setOptimisticJudges}
            />
          </div>
        </div>
      ) : (
        <EditableSection
          section="judges"
          isEmpty={(optimisticJudges ?? hackathon.judges).length === 0}
          emptyLabel="Click to add judges"
          className="py-12"
        >
          <JudgeSection judges={optimisticJudges ?? hackathon.judges} />
        </EditableSection>
      )}

      {isEditable && editMode && activeSection === "prizes" ? (
        <div data-edit-section="prizes" className="py-12 scroll-mt-24">
          <div className="mx-auto max-w-4xl px-4">
            <PrizesEditForm
              hackathonId={hackathon.id}
              initialPrizes={hackathon.prizes}
              onSaveAndNext={() => handleSaveAndNext("prizes")}
              onSave={onFormSave ? (data) => onFormSave(data) : undefined}
            />
          </div>
        </div>
      ) : (
        <EditableSection
          section="prizes"
          isEmpty={hackathon.prizes.length === 0}
          emptyLabel="Click to add prizes"
          className="py-12"
        >
          <PrizeSection
            prizes={hackathon.prizes}
            hackathonSlug={hackathon.slug}
            hackathonStatus={hackathon.status}
          />
        </EditableSection>
      )}

      <section className="py-12 border-t">
        <div className="mx-auto max-w-4xl px-4">
          <div className="space-y-8">
            {publicResults.length > 0 && (
              <PublicResults results={publicResults} />
            )}

            {isEditable && editMode && activeSection === "timeline" ? (
              <div data-edit-section="timeline" className="scroll-mt-24">
                <h2 className="text-xl font-bold mb-4">Timeline</h2>
                <TimelineEditForm
                  hackathonId={hackathon.id}
                  initialData={{
                    startsAt: hackathon.starts_at,
                    endsAt: hackathon.ends_at,
                  }}
                  onSaveAndNext={() => handleSaveAndNext("timeline")}
                  onSave={onFormSave ? (data) => onFormSave({
                    startsAt: data.startsAt?.toISOString() ?? null,
                    endsAt: data.endsAt?.toISOString() ?? null,
                  }) : undefined}
                />
              </div>
            ) : (
              <EditableSection
                section="timeline"
                isEmpty={!hasTimeline}
                emptyLabel="Click to add timeline"
              >
                {hasTimeline && (
                  <div>
                    <h2 className="text-xl font-bold mb-4">Timeline</h2>
                    <div className="space-y-2 text-sm">
                      {hackathon.starts_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Hackathon Starts</span>
                          <span>{formatDateTimeDisplay(hackathon.starts_at)}</span>
                        </div>
                      )}
                      {hackathon.ends_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Hackathon Ends</span>
                          <span>{formatDateTimeDisplay(hackathon.ends_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </EditableSection>
            )}

            {scheduleItems.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4">Schedule</h2>
                <div className="space-y-3">
                  {scheduleItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-16 pt-0.5 text-right">
                        {new Date(item.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.title}</p>
                        {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                        {item.location && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <MapPin className="size-3" />
                            {item.location}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                  initialData={{ description: hackathon.description }}
                  onSaveAndNext={() => handleSaveAndNext("about")}
                  onSave={onFormSave ? (data) => onFormSave(data) : undefined}
                />
              </div>
            ) : (
              <EditableSection
                section="about"
                isEmpty={!hackathon.description}
                emptyLabel="Click to add description"
              >
                {hackathon.description && (
                  <div>
                    <h2 className="text-xl font-bold mb-4">About</h2>
                    <TruncatableContent>
                      <MarkdownContent>{hackathon.description}</MarkdownContent>
                    </TruncatableContent>
                  </div>
                )}
              </EditableSection>
            )}

          </div>
        </div>
      </section>

      <SubmissionGallery submissions={submissions} />
    </>
  )

  const heroContent = (
    <EventHero
      name={hackathon.name}
      bannerUrl={bannerUrl}
      status={hackathon.status}
      startsAt={hackathon.starts_at}
      endsAt={hackathon.ends_at}
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
          initialName={hackathon.name}
          onSaveAndNext={() => handleSaveAndNext("name")}
          onSave={onFormSave ? (data) => onFormSave(data) : undefined}
        />
      ) : undefined}
      datesEditSlot={isEditable && editMode && activeSection === "dates" ? (
        <TimelineEditForm
          hackathonId={hackathon.id}
          initialData={{
            startsAt: hackathon.starts_at,
            endsAt: hackathon.ends_at,
          }}
          onSaveAndNext={() => handleSaveAndNext("dates")}
          onSave={onFormSave ? (data) => onFormSave({
            startsAt: data.startsAt?.toISOString() ?? null,
            endsAt: data.endsAt?.toISOString() ?? null,
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
        />
      ) : undefined}
      isRegistered={isRegistered}
      hideRegistrationButton={isJudge}
      isOrganizer={isEditable && !editMode}
      isJudge={isJudge}
      hackathonSlug={hackathon.slug}
      statusSlot={(isEditable && editMode) ? undefined : statusSlot}
      bannerSlot={bannerEditSlot}
      orgNameWrapper={(isEditable && editMode) && !hackathon.organizer.logo_url
        ? (name) => <OrganizerLogoPrompt>{name}</OrganizerLogoPrompt>
        : undefined
      }
      registrationProps={(isEditable && editMode) ? undefined : isJudge ? undefined : {
        hackathonSlug: hackathon.slug,
        status: hackathon.status,
        endsAt: hackathon.ends_at,
        registrationOpensAt: hackathon.registration_opens_at,
        registrationClosesAt: hackathon.registration_closes_at,
        maxParticipants: hackathon.max_participants,
        participantCount,
        isRegistered,
        requireLocationVerification: hackathon.require_location_verification,
        submission,
        onRegistrationSuccess: handleRegistrationSuccess,
      }}
    />
  )

  return (
    <>
      {showActionBar && (
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
  participantRole,
  participantCount,
  showActionBar = false,
  hasJudgeAssignments = false,
  submission,
  submissions,
  teamInfo,
  publicResults,
  scheduleItems,
  announcements,
  currentUserId,
  onFormSave,
  onBannerChange,
  onAuthRequired,
}: HackathonPreviewClientProps) {
  return (
    <EditProvider isEditable={isEditable} defaultEditMode={!showActionBar}>
      <HackathonPreviewContent
        hackathon={hackathon}
        isRegistered={isRegistered}
        participantRole={participantRole}
        participantCount={participantCount}
        showActionBar={showActionBar}
        hasJudgeAssignments={hasJudgeAssignments}
        submission={submission}
        submissions={submissions}
        teamInfo={teamInfo}
        publicResults={publicResults}
        scheduleItems={scheduleItems}
        announcements={announcements}
        currentUserId={currentUserId}
        onFormSave={onFormSave}
        onBannerChange={onBannerChange}
        onAuthRequired={onAuthRequired}
      />
    </EditProvider>
  )
}
