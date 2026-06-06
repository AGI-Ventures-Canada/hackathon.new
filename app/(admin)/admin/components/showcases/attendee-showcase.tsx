"use client"

import { Suspense, useState } from "react"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseRow,
} from "../_section-layout"
import type { ShowcaseData } from "../_mock-data"
import { useSandbox } from "../_sandbox"

import { EventHero } from "@/components/hackathon/event-hero"
import { SponsorSection } from "@/components/hackathon/sponsor-section"
import { JudgeSection } from "@/components/hackathon/judge-section"
import { PrizeSection } from "@/components/hackathon/prize-section"
import { ChallengeSection } from "@/components/hackathon/challenge-section"
import { PerksSection } from "@/components/hackathon/perks-section"
import { RegistrationButton } from "@/components/hackathon/registration-button"
import { SubmissionButton } from "@/components/hackathon/submission-button"
import { SubmissionGallery, type GallerySubmission } from "@/components/hackathon/submission-gallery"
import { SubmissionLinks } from "@/components/hackathon/submission-links"
import { VoteCard } from "@/components/hackathon/voting/vote-card"

const SECTIONS = [
  { id: "event-hero", label: "Event hero" },
  { id: "sponsor-section", label: "Sponsor section" },
  { id: "judge-section", label: "Judge section" },
  { id: "prize-section", label: "Prize section" },
  { id: "challenge-section", label: "Challenge section" },
  { id: "perks-section", label: "Perks section" },
  { id: "registration-button", label: "Registration button" },
  { id: "submission-button", label: "Submission button" },
  { id: "submission-gallery", label: "Submission gallery" },
  { id: "submission-links", label: "Submission links" },
  { id: "vote-card", label: "Vote card" },
  { id: "live-mode", label: "Live-mode only" },
]

export function AttendeeShowcase({ data }: { data: ShowcaseData }) {
  const { record } = useSandbox()
  const { hackathon } = data
  const [voted, setVoted] = useState<string | null>(null)

  const gallerySubmissions: GallerySubmission[] = data.submissions.map((s, i) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    githubUrl: s.github_url,
    liveAppUrl: s.live_app_url,
    demoVideoUrl: s.demo_video_url,
    screenshotUrl: s.screenshot_url,
    submitter: `Team ${i + 1}`,
    createdAt: s.created_at,
  }))

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection
        id="event-hero"
        title="Event hero"
        description="Top-of-page banner on a public event page. Shows title, dates, location, and the registration button."
      >
        <div className="overflow-hidden rounded-none border">
          <EventHero
            name={hackathon.name}
            bannerUrl={hackathon.banner_url}
            status={hackathon.status}
            startsAt={hackathon.starts_at}
            endsAt={hackathon.ends_at}
            registrationOpensAt={hackathon.registration_opens_at}
            registrationClosesAt={hackathon.registration_closes_at}
            organizer={data.organizer}
            locationType={hackathon.location_type}
            locationName={hackathon.location_name}
            locationUrl={hackathon.location_url}
            registrationProps={{
              hackathonSlug: hackathon.slug,
              status: hackathon.status,
              startsAt: hackathon.starts_at,
              endsAt: hackathon.ends_at,
              registrationOpensAt: hackathon.registration_opens_at,
              registrationClosesAt: hackathon.registration_closes_at,
              allowLateRegistration: hackathon.allow_late_registration,
              maxParticipants: hackathon.max_participants,
              participantCount: 42,
              isRegistered: false,
              onRegistrationSuccess: () => record("Registered (hero button)"),
            }}
            hackathonSlug={hackathon.slug}
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="sponsor-section"
        title="Sponsor section"
        description="Grouped sponsor logos, tiered."
      >
        <SponsorSection sponsors={data.sponsors} />
      </ShowcaseSection>

      <ShowcaseSection id="judge-section" title="Judge section" description="Judge cards with name, title, org.">
        <JudgeSection judges={data.judges} />
      </ShowcaseSection>

      <ShowcaseSection
        id="prize-section"
        title="Prize section"
        description="Prize cards with judging style and crowd-vote CTA."
      >
        <PrizeSection
          prizes={data.publicPrizes}
          hackathonSlug={hackathon.slug}
          hackathonStatus={hackathon.status}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="challenge-section"
        title="Challenge section"
        description="Released challenges with optional resource links."
      >
        <ChallengeSection
          challenges={data.challenges}
          releasedAt={hackathon.challenge_released_at ?? new Date().toISOString()}
          showResources
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="perks-section"
        title="Perks section"
        description="Sponsor perks, grouped by sponsor."
      >
        <PerksSection
          perks={data.perks}
          sponsors={data.sponsors.map((s) => ({ id: s.id, name: s.name }))}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="registration-button"
        title="Registration button"
        description="Standalone CTA. Changes copy based on event status and whether you're signed in / registered."
      >
        <ShowcaseRow>
          <Suspense>
            <RegistrationButton
              hackathonSlug={hackathon.slug}
              status={hackathon.status}
              startsAt={hackathon.starts_at}
              endsAt={hackathon.ends_at}
              registrationOpensAt={hackathon.registration_opens_at}
              registrationClosesAt={hackathon.registration_closes_at}
              allowLateRegistration={hackathon.allow_late_registration}
              maxParticipants={hackathon.max_participants}
              participantCount={42}
              isRegistered={false}
              onRegistrationSuccess={() => record("Registered (standalone)")}
            />
          </Suspense>
          <Suspense>
            <RegistrationButton
              hackathonSlug={hackathon.slug}
              status={hackathon.status}
              startsAt={hackathon.starts_at}
              endsAt={hackathon.ends_at}
              registrationOpensAt={hackathon.registration_opens_at}
              registrationClosesAt={hackathon.registration_closes_at}
              allowLateRegistration={hackathon.allow_late_registration}
              maxParticipants={hackathon.max_participants}
              participantCount={42}
              isRegistered
            />
          </Suspense>
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection
        id="submission-button"
        title="Submission button"
        description="Multi-step submission form: title → GitHub → live URL → description → screenshot."
      >
        <ShowcaseRow>
          <SubmissionButton
            hackathonSlug={hackathon.slug}
            status="active"
            isRegistered
            submission={null}
          />
          <SubmissionButton
            hackathonSlug={hackathon.slug}
            status="active"
            isRegistered
            submission={data.submissions[0] ?? null}
          />
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection
        id="submission-gallery"
        title="Submission gallery"
        description="Paginated grid of submitted projects with search."
      >
        <SubmissionGallery submissions={gallerySubmissions} />
      </ShowcaseSection>

      <ShowcaseSection
        id="submission-links"
        title="Submission links"
        description="Compact row of GitHub / live app / demo video links."
      >
        <SubmissionLinks
          githubUrl="https://github.com/example/loopback"
          liveAppUrl="https://loopback.example"
          demoVideoUrl="https://demo.example/video"
          hasEmbeddedVideo={false}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="vote-card"
        title="Vote card"
        description="Individual project vote card. Click heart to toggle vote."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {gallerySubmissions.map((s) => (
            <VoteCard
              key={s.id}
              title={s.title}
              description={s.description}
              screenshotUrl={s.screenshotUrl}
              submitterName={s.submitter}
              voteCount={voted === s.id ? 8 : 7}
              isVoted={voted === s.id}
              disabled={false}
              onVote={() => {
                const next = voted === s.id ? null : s.id
                setVoted(next)
                record(next ? `Voted for ${s.title}` : `Removed vote from ${s.title}`)
              }}
            />
          ))}
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="live-mode"
        title="Live-mode only"
        description="These attendee components need full hackathon state we don't mock in sandbox."
      >
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">HackathonPreviewClient</strong> — full event page preview
            with editable sections; use <code>?hackathonId=&lt;uuid&gt;</code>.
          </li>
          <li>
            <strong className="text-foreground">TeamManagementTab</strong>,{" "}
            <strong className="text-foreground">TeamInviteDialog</strong> — require a real team
            membership; hit the live event page to test.
          </li>
          <li>
            <strong className="text-foreground">LiveDashboard</strong> — polls realtime endpoints.
          </li>
          <li>
            <strong className="text-foreground">VoteGallery</strong> — depends on server vote counts.
          </li>
        </ul>
      </ShowcaseSection>
    </SectionLayout>
  )
}
