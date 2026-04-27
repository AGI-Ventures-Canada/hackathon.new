"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseStack,
  ShowcaseRow,
} from "../_section-layout"
import type { ShowcaseData } from "../_mock-data"
import { useSandbox, useSandboxHandler } from "../_sandbox"

import { LifecycleStepper } from "@/components/hackathon/lifecycle-stepper"
import { StatusBadge } from "@/components/hackathon/status-badge"
import { PhaseBadge } from "@/components/hackathon/phase-badge"
import { NeedsAttentionCard } from "@/components/hackathon/needs-attention-card"
import { NameEditForm } from "@/components/hackathon/edit-drawer/name-edit-form"
import { AboutEditForm } from "@/components/hackathon/edit-drawer/about-edit-form"
import { TimelineEditForm } from "@/components/hackathon/edit-drawer/timeline-edit-form"
import { LocationEditForm } from "@/components/hackathon/edit-drawer/location-edit-form"
import { CommunityEditForm } from "@/components/hackathon/edit-drawer/community-edit-form"
import { AddPrizeDialog } from "@/components/hackathon/judging/add-prize-dialog"
import { EditPrizeDialog } from "@/components/hackathon/judging/edit-prize-dialog"
import { AddJudgeDialog } from "@/components/hackathon/judging/add-judge-dialog"
import { RoundFormDialog } from "@/components/hackathon/judging/round-form-dialog"
import { RoundsPresetDialog } from "@/components/hackathon/judging/rounds-preset-dialog"
import { LocationEditDialog } from "@/components/hackathon/manage/location-edit-dialog"
import { TeamSettingsDialog } from "@/components/hackathon/manage/team-settings-dialog"
import { ChallengeEditorDialog } from "@/components/hackathon/manage/challenge-editor-dialog"
import { PerkEditorDialog } from "@/components/hackathon/manage/perk-editor-dialog"

const SECTIONS = [
  { id: "lifecycle", label: "Lifecycle stepper" },
  { id: "status-badges", label: "Status & phase badges" },
  { id: "needs-attention", label: "Needs attention card" },
  { id: "name-form", label: "Name form" },
  { id: "about-form", label: "About form" },
  { id: "timeline-form", label: "Timeline form" },
  { id: "location-form", label: "Location form" },
  { id: "community-form", label: "Community form" },
  { id: "location-dialog", label: "Location dialog" },
  { id: "team-settings", label: "Team settings dialog" },
  { id: "add-prize", label: "Add prize dialog" },
  { id: "edit-prize", label: "Edit prize dialog" },
  { id: "add-judge", label: "Add judge dialog" },
  { id: "round-form", label: "Round form dialog" },
  { id: "rounds-preset", label: "Rounds preset dialog" },
  { id: "challenge-editor", label: "Challenge editor dialog" },
  { id: "perk-editor", label: "Perk editor dialog" },
]

export function OrganizerShowcase({ data }: { data: ShowcaseData }) {
  const { record } = useSandbox()
  const { hackathon } = data

  const saveName = useSandboxHandler<[{ name: string }]>("Saved name")
  const saveAbout = useSandboxHandler<[{ description: string | null }]>("Saved description")
  const saveTimeline = useSandboxHandler<[{ startsAt: Date | null; endsAt: Date | null }]>("Saved timeline")
  const saveLocation = useSandboxHandler<[unknown]>("Saved location")
  const saveCommunity = useSandboxHandler<[{ communityUrl: string | null; communityLabel: string | null }]>("Saved community")

  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [teamSettingsOpen, setTeamSettingsOpen] = useState(false)
  const [addPrizeOpen, setAddPrizeOpen] = useState(false)
  const [editPrize, setEditPrize] = useState<(typeof data.prizes)[number] | null>(null)
  const [addJudgeOpen, setAddJudgeOpen] = useState(false)
  const [roundFormOpen, setRoundFormOpen] = useState(false)
  const [roundsPresetOpen, setRoundsPresetOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [perkOpen, setPerkOpen] = useState(false)

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection
        id="lifecycle"
        title="Lifecycle stepper"
        description="Visual timeline of event phases. Click a node to hover-check requirements."
      >
        <LifecycleStepper
          hackathonId={hackathon.id}
          hackathonSlug={hackathon.slug}
          status={hackathon.status}
          submissionCount={data.submissions.length}
          judgingProgress={{ totalAssignments: 10, completedAssignments: 3 }}
          judgingSetupStatus={{ judgeCount: data.judges.length, hasUnassignedSubmissions: true }}
          startsAt={hackathon.starts_at}
          endsAt={hackathon.ends_at}
          registrationOpensAt={hackathon.registration_opens_at}
          registrationClosesAt={hackathon.registration_closes_at}
          description={hackathon.description}
          bannerUrl={hackathon.banner_url}
          locationType={hackathon.location_type}
          locationName={hackathon.location_name}
          locationUrl={hackathon.location_url}
          sponsorCount={data.sponsors.length}
          prizeCount={data.prizes.length}
          judgeDisplayCount={data.judges.length}
          criteriaCount={data.criteria.length}
          phase={hackathon.phase}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="status-badges"
        title="Status & phase badges"
        description="StatusBadge is a quick-switch dropdown. PhaseBadge is read-only."
      >
        <ShowcaseRow>
          <StatusBadge hackathonId={hackathon.id} status={hackathon.status} />
          <PhaseBadge phase={hackathon.phase} />
          <PhaseBadge phase="build" />
          <PhaseBadge phase="preliminaries" />
          <PhaseBadge phase="finals" />
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection
        id="needs-attention"
        title="Needs attention card"
        description="Dashboard tile for incomplete organizer work."
      >
        <div className="max-w-md">
          <NeedsAttentionCard
            hackathon={{
              id: hackathon.id,
              slug: hackathon.slug,
              name: hackathon.name,
              description: hackathon.description,
              status: hackathon.status,
              registration_opens_at: hackathon.registration_opens_at,
              registration_closes_at: hackathon.registration_closes_at,
              starts_at: hackathon.starts_at,
              ends_at: hackathon.ends_at,
            }}
            stats={{
              hackathonId: hackathon.id,
              participantCount: 42,
              teamCount: 12,
              submissionCount: data.submissions.length,
              openMentorRequests: 2,
              judgingTotal: 10,
              judgingComplete: 3,
            }}
            urgent
            role="organizer"
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="name-form" title="Name form" description="Edit the event name.">
        <div className="max-w-lg">
          <NameEditForm
            initialName={hackathon.name}
            onSave={async (d) => {
              await saveName(d)
              return true
            }}
            onCancel={() => record("Cancelled name form")}
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="about-form" title="About form" description="Edit the description via markdown.">
        <div className="max-w-2xl">
          <AboutEditForm
            initialData={{ description: hackathon.description }}
            onSave={async (d) => {
              await saveAbout(d)
              return true
            }}
            onCancel={() => record("Cancelled about form")}
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="timeline-form" title="Timeline form" description="Date range for the event.">
        <div className="max-w-2xl">
          <TimelineEditForm
            initialData={{ startsAt: hackathon.starts_at, endsAt: hackathon.ends_at }}
            onSave={async (d) => {
              await saveTimeline(d)
              return true
            }}
            onCancel={() => record("Cancelled timeline form")}
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="location-form" title="Location form" description="In-person, virtual, or hybrid.">
        <div className="max-w-2xl">
          <LocationEditForm
            initialData={{
              locationType: hackathon.location_type,
              locationName: hackathon.location_name,
              locationUrl: hackathon.location_url,
              locationLatitude: hackathon.location_latitude,
              locationLongitude: hackathon.location_longitude,
              requireLocationVerification: hackathon.require_location_verification,
            }}
            onSave={async (d) => {
              await saveLocation(d)
              return true
            }}
            onCancel={() => record("Cancelled location form")}
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="community-form" title="Community form" description="Discord/Slack link for the event.">
        <div className="max-w-lg">
          <CommunityEditForm
            initialUrl={hackathon.community_url}
            initialLabel={hackathon.community_label}
            onSave={async (d) => {
              await saveCommunity(d)
              return true
            }}
            onCancel={() => record("Cancelled community form")}
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="location-dialog" title="Location dialog" description="The location form wrapped in a dialog.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setLocationDialogOpen(true)}>
            Open location dialog
          </Button>
          <LocationEditDialog
            open={locationDialogOpen}
            onOpenChange={setLocationDialogOpen}
            hackathonId={hackathon.id}
            initialData={{
              locationType: hackathon.location_type,
              locationName: hackathon.location_name,
              locationUrl: hackathon.location_url,
              locationLatitude: hackathon.location_latitude,
              locationLongitude: hackathon.location_longitude,
              requireLocationVerification: hackathon.require_location_verification,
            }}
            onSaved={() => record("Saved location (dialog)")}
          />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="team-settings" title="Team settings dialog" description="Min/max team size + allow solo.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setTeamSettingsOpen(true)}>
            Open team settings
          </Button>
          <TeamSettingsDialog
            open={teamSettingsOpen}
            onOpenChange={setTeamSettingsOpen}
            hackathonId={hackathon.id}
            initialData={{
              minTeamSize: hackathon.min_team_size,
              maxTeamSize: hackathon.max_team_size,
              allowSolo: hackathon.allow_solo,
            }}
            onSaved={() => record("Saved team settings")}
          />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="add-prize" title="Add prize dialog" description="Two-step flow: pick a style, fill details.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setAddPrizeOpen(true)}>
            Open add prize
          </Button>
          <AddPrizeDialog
            open={addPrizeOpen}
            onOpenChange={setAddPrizeOpen}
            hackathonId={hackathon.id}
            onSuccess={(prize) => record(`Added prize: ${prize?.name ?? "(no payload)"}`)}
          />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="edit-prize" title="Edit prize dialog" description="Edit an existing prize's name, value, criteria, buckets.">
        <ShowcaseStack>
          <ShowcaseRow>
            {data.prizes.map((p) => (
              <Button key={p.id} variant="outline" onClick={() => setEditPrize(p)}>
                Edit &ldquo;{p.name}&rdquo;
              </Button>
            ))}
          </ShowcaseRow>
          {editPrize && (
            <EditPrizeDialog
              hackathonId={hackathon.id}
              prize={{
                id: editPrize.id,
                name: editPrize.name,
                description: editPrize.description,
                value: editPrize.value,
                judgingStyle: editPrize.judging_style,
                maxPicks: editPrize.max_picks,
                criteria: null,
                buckets: null,
              }}
              onClose={() => setEditPrize(null)}
              onSuccess={(updated) => record(`Updated prize: ${updated.name}`)}
            />
          )}
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="add-judge" title="Add judge dialog" description="Search for a user or invite by email.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setAddJudgeOpen(true)}>
            Open add judge
          </Button>
          <AddJudgeDialog
            hackathonId={hackathon.id}
            open={addJudgeOpen}
            onOpenChange={setAddJudgeOpen}
            onSuccess={(r) => record(`Added judge via ${r.type}`)}
          />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="round-form" title="Round form dialog" description="Create or edit an individual judging round.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setRoundFormOpen(true)}>
            Open round form (create)
          </Button>
          <RoundFormDialog
            hackathonId={hackathon.id}
            mode="create"
            open={roundFormOpen}
            onOpenChange={setRoundFormOpen}
            onSuccess={(created) => record(`Created round: ${created?.name ?? "(unnamed)"}`)}
          />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="rounds-preset" title="Rounds preset dialog" description="Create pre-configured round structures.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setRoundsPresetOpen(true)}>
            Open rounds preset (shortlist)
          </Button>
          <RoundsPresetDialog
            hackathonId={hackathon.id}
            preset="shortlist"
            open={roundsPresetOpen}
            onOpenChange={setRoundsPresetOpen}
            onSuccess={() => record("Applied rounds preset")}
          />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="challenge-editor" title="Challenge editor dialog" description="Title + description + resource links.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setChallengeOpen(true)}>
            Open challenge editor
          </Button>
          <ChallengeEditorDialog
            open={challengeOpen}
            onOpenChange={setChallengeOpen}
            hackathonId={hackathon.id}
            challenge={data.challenges[0] ?? null}
            onSaved={(c) => record(`Saved challenge: ${c.title}`)}
            releaseScheduleItem={null}
            hackathonStartsAt={hackathon.starts_at}
            hackathonEndsAt={hackathon.ends_at}
            alreadyReleased={!!hackathon.challenge_released_at}
          />
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="perk-editor" title="Perk editor dialog" description="Attach perks to sponsors with scheduled release.">
        <ShowcaseStack>
          <Button variant="outline" onClick={() => setPerkOpen(true)}>
            Open perk editor
          </Button>
          <PerkEditorDialog
            open={perkOpen}
            onOpenChange={setPerkOpen}
            hackathonId={hackathon.id}
            perk={data.perks[0] ?? null}
            sponsors={data.sponsors.map((s) => ({ id: s.id, name: s.name }))}
            onSaved={(p) => record(`Saved perk: ${p.name}`)}
          />
        </ShowcaseStack>
      </ShowcaseSection>
    </SectionLayout>
  )
}
