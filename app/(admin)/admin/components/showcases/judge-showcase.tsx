"use client"

import {
  SectionLayout,
  ShowcaseSection,
} from "../_section-layout"
import type { ShowcaseData } from "../_mock-data"
import { useSandbox } from "../_sandbox"

import { RoundsSection } from "@/components/hackathon/judging/rounds-section"
import { JudgeAssignmentsCard } from "@/components/hackathon/judging/judge-assignments-card"
import { SubjectiveScoringView } from "@/components/hackathon/judging/subjective-scoring-view"
import { FocusScoringView } from "@/components/hackathon/judging/focus-scoring-view"
import type { RoundData } from "@/components/hackathon/judging/rounds-types"

const SECTIONS = [
  { id: "rounds-section", label: "Rounds section" },
  { id: "judge-assignments-card", label: "Judge assignments card" },
  { id: "focus-scoring-view", label: "Focus scoring view" },
  { id: "subjective-scoring-view", label: "Subjective scoring view" },
  { id: "live-mode", label: "Live-mode only" },
]

export function JudgeShowcase({ data }: { data: ShowcaseData }) {
  const { record: _record } = useSandbox()
  const { hackathon } = data

  const mockRounds: RoundData[] = [
    {
      id: "round-1",
      name: "Preliminaries",
      status: "planned",
      isActive: false,
      displayOrder: 0,
      advancement: "top_n",
      advancementConfig: { topN: 10 },
      prizeCount: 2,
      screeningPrizeId: null,
    },
    {
      id: "round-2",
      name: "Finals",
      status: "planned",
      isActive: false,
      displayOrder: 1,
      advancement: "manual",
      advancementConfig: {},
      prizeCount: 1,
      screeningPrizeId: null,
    },
  ]

  const mockAssignments = data.submissions.map((s, i) => ({
    id: `assignment-${i}`,
    submissionId: s.id,
    submissionTitle: s.title,
    submissionDescription: s.description,
    submissionGithubUrl: s.github_url,
    submissionLiveAppUrl: s.live_app_url,
    submissionScreenshotUrl: s.screenshot_url,
    teamName: `Team ${i + 1}`,
    teamMemberCount: 3,
    isComplete: i === 0,
    notes: "",
    viewedAt: i === 0 ? new Date().toISOString() : null,
  }))

  const focusAssignments = mockAssignments.map((a) => ({
    id: a.id,
    submissionTitle: a.submissionTitle,
    teamName: a.teamName,
    teamMemberCount: a.teamMemberCount,
    isComplete: a.isComplete,
  }))

  const subjectivePrizes = data.prizes.map((p) => ({ id: p.id, name: p.name }))
  const subjectiveSubmissions = data.submissions.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    githubUrl: s.github_url,
    liveAppUrl: s.live_app_url,
    screenshotUrl: s.screenshot_url,
    teamName: "Sandbox team",
    viewedAt: null,
  }))

  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection
        id="rounds-section"
        title="Rounds section"
        description="Organizer view of configured judging rounds with presets, add, edit, advance."
      >
        <RoundsSection hackathonId={hackathon.id} rounds={mockRounds} />
      </ShowcaseSection>

      <ShowcaseSection
        id="judge-assignments-card"
        title="Judge assignments card"
        description="What a judge sees: a paginated list of submissions with focus-mode and list-mode toggles."
      >
        <JudgeAssignmentsCard
          hackathonSlug={hackathon.slug}
          assignments={mockAssignments}
          teamSettings={{ minTeamSize: hackathon.min_team_size, allowSolo: hackathon.allow_solo }}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="focus-scoring-view"
        title="Focus scoring view"
        description="Single-submission focused scoring with keyboard navigation."
      >
        <FocusScoringView
          hackathonSlug={hackathon.slug}
          assignments={focusAssignments}
          initialCompletedIds={new Set(focusAssignments.filter((a) => a.isComplete).map((a) => a.id))}
          onScoreSubmitted={(id) => _record(`Score submitted for ${id}`)}
          teamSettings={{ minTeamSize: hackathon.min_team_size, allowSolo: hackathon.allow_solo }}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="subjective-scoring-view"
        title="Subjective scoring view"
        description="Judges pick a small number of winners per prize instead of scoring every submission."
      >
        <SubjectiveScoringView
          hackathonSlug={hackathon.slug}
          prizes={subjectivePrizes}
          submissions={subjectiveSubmissions}
          initialPicks={[]}
        />
      </ShowcaseSection>

      <ShowcaseSection
        id="live-mode"
        title="Live-mode only"
        description="These components fetch assignment details from the API and can't be stubbed cleanly."
      >
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">ScoringPanel</strong> — requires a real assignment ID;
            render it by opening a submission from JudgeAssignmentsCard in live mode.
          </li>
          <li>
            <strong className="text-foreground">BucketSortPanel</strong> /{" "}
            <strong className="text-foreground">GateCheckPanel</strong> — require a real round ID and
            fetched submission list.
          </li>
          <li>
            <strong className="text-foreground">JudgeAssignments</strong> (organizer-side) — requires
            judges, submissions, and assignments to be wired together; use{" "}
            <code>?hackathonId=&lt;uuid&gt;</code> with a seeded <code>judging</code> scenario.
          </li>
        </ul>
      </ShowcaseSection>
    </SectionLayout>
  )
}
