"use client"

import { useState, useEffect, useMemo } from "react"
import { useIsClient } from "@/hooks/use-is-client"
import { useRouter } from "next/navigation"
import { useOptimisticList } from "@/hooks/use-optimistic-list"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { usePrizeJudgeAssignments } from "@/hooks/use-prize-judge-assignments"
import { assertOk } from "@/lib/utils/fetch"
import { toCsv } from "@/lib/utils/csv"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PrizeResultsGroup } from "@/lib/services/results"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"
import { JudgingSetupWizard } from "./judging-setup-wizard"
import type { ManageJtab } from "@/lib/utils/manage-tabs"
import {
  Plus,
  UserPlus,
  Trash2,
  Pencil,
  MoreHorizontal,
  Trophy,
  Users,
  Calculator,
  Globe,
  GlobeLock,
  Loader2,
  Clock,
  Mail,
  Layers,
  Vote,
  ListChecks,
  ArrowUpDown,
  Award,
  X,
  MapPin,
  Bell,
  ExternalLink,
  Sliders,
  ClipboardList,
  Copy,
  Check,
  Download,
} from "lucide-react"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { AddJudgeDialog, type AddJudgeResult } from "./add-judge-dialog"
import { AddPrizeDialog } from "./add-prize-dialog"
import { EditPrizeDialog, type EditablePrize, type UpdatedPrize } from "./edit-prize-dialog"
import { CoreCriteriaEditor } from "./core-criteria-editor"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { AssignJudgesDialog } from "./assign-judges-dialog"
import { AssignmentsSection } from "./assignments-section"
import { JudgePill } from "./judge-pill"
import { RoundsSection } from "./rounds-section"
import type { RoundData } from "./rounds-types"
import type { Prize } from "@/lib/db/hackathon-types"

type TeamMode = "in_person" | "virtual"

type ModeFilter = "all" | "in_person" | "virtual"

function modesToFilter(modes: TeamMode[] | null): ModeFilter {
  if (!modes || modes.length === 0 || modes.length === 2) return "all"
  return modes[0]
}

function filterToModes(filter: ModeFilter): TeamMode[] | null {
  if (filter === "all") return null
  return [filter]
}

type PrizeCriterionData = {
  id: string
  name: string
  description: string | null
  weight?: number
  minScore?: number
  maxScore?: number
}

type PrizeBucketData = {
  id: string
  level: number
  label: string
  description: string | null
}

type PrizeData = {
  id: string
  name: string
  description: string | null
  value: string | null
  judgingStyle: string | null
  assignmentMode: string | null
  maxPicks: number | null
  roundId: string | null
  displayOrder: number
  totalAssignments: number
  completedAssignments: number
  judgeCount: number
  allowedTeamModes: TeamMode[] | null
  criteria: PrizeCriterionData[] | null
  buckets: PrizeBucketData[] | null
  sponsorName?: string | null
}

type JudgeData = {
  participantId: string
  clerkUserId: string
  displayName: string
  email: string | null
  imageUrl: string | null
  prizeIds: string[]
}

type InvitationData = {
  id: string
  email: string
  status: string
  createdAt: string
  remindedAt: string | null
  token: string | null
}

type ResultData = {
  id: string
  rank: number
  submissionId: string
  submissionTitle: string
  teamName: string | null
  totalScore: number | null
  weightedScore: number | null
  judgeCount: number
  publishedAt: string | null
  prizes: { id: string; name: string; value: string | null }[]
}

interface JudgingTabClientProps {
  hackathonId: string
  slug: string
  prizes: PrizeData[]
  judges: JudgeData[]
  progress: { totalAssignments: number; completedAssignments: number; judges: { participantId: string; clerkUserId: string; displayName: string; completed: number; total: number }[] }
  rounds: RoundData[]
  pendingInvitations: InvitationData[]
  results: ResultData[]
  submissions: Array<{ id: string; title: string }>
  isPublished: boolean
  locationType: "in_person" | "virtual" | "hybrid" | null
  activeJtab: ManageJtab
  coreCriteria?: { id: string; name: string; description: string | null; weight: number; minScore: number; maxScore: number; displayOrder: number }[]
  weightedAssignmentSummary?: {
    totalSubmissionCount: number
    rooms: { id: string; name: string; submissionCount: number }[]
    countsByJudge: Record<string, { all: number; byRoom: Record<string, number> }>
  }
  resultsByPrize?: PrizeResultsGroup[]
}

const getPrizeId = (p: PrizeData) => p.id
const getJudgeParticipantId = (j: JudgeData) => j.participantId
const getInvitationId = (i: InvitationData) => i.id

function toPrizeData(prize: Prize): PrizeData {
  return {
    id: prize.id,
    name: prize.name,
    description: prize.description,
    value: prize.value,
    judgingStyle: prize.judging_style,
    assignmentMode: prize.assignment_mode,
    maxPicks: prize.max_picks,
    roundId: prize.round_id,
    displayOrder: prize.display_order,
    totalAssignments: 0,
    completedAssignments: 0,
    judgeCount: 0,
    allowedTeamModes: prize.allowed_team_modes,
    criteria: null,
    buckets: null,
    sponsorName: null,
  }
}

const STYLE_META: Record<string, { label: string; icon: typeof Trophy; color: string }> = {
  bucket_sort: { label: "Bucket Sort", icon: ArrowUpDown, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  gate_check: { label: "Gate Check", icon: ListChecks, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  crowd_vote: { label: "Crowd Vote", icon: Vote, color: "bg-green-500/10 text-green-700 dark:text-green-400" },
  judges_pick: { label: "Judge's Pick", icon: Award, color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
}

export function JudgingTabClient({
  hackathonId,
  slug,
  prizes: initialPrizes,
  judges: initialJudges,
  progress: initialProgress,
  rounds,
  pendingInvitations: initialInvitations,
  results: initialResults,
  submissions: _submissions,
  isPublished: initialIsPublished,
  locationType,
  activeJtab,
  coreCriteria = [],
  weightedAssignmentSummary,
  resultsByPrize = [],
}: JudgingTabClientProps) {
  const router = useRouter()
  const actionItems = useActionItemsOptional()
  const sharedPrizes = useMemo(() => {
    const serverIds = new Set(initialPrizes.map((prize) => prize.id))
    const webMcpPrizes = actionItems?.manageWebMcpView.prizes ?? []
    return [
      ...initialPrizes,
      ...webMcpPrizes
        .filter((prize) => !serverIds.has(prize.id))
        .map(toPrizeData),
    ]
  }, [actionItems?.manageWebMcpView.prizes, initialPrizes])
  const [showAddJudge, setShowAddJudge] = useState(false)
  const [showAddPrize, setShowAddPrize] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const weightedScoringLocked =
    coreCriteria.length > 0 ||
    sharedPrizes.some((p) => p.judgingStyle === "weighted_score")
  const [weightedScoringEnabled, setWeightedScoringEnabled] = useState(weightedScoringLocked)
  useEffect(() => {
    if (weightedScoringLocked) setWeightedScoringEnabled(true)
  }, [weightedScoringLocked])
  const results = initialResults
  const [isPublished, setIsPublished] = useState(initialIsPublished)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!actionItems) return
    const { registerTabAction, unregisterTabAction } = actionItems
    registerTabAction("no-prizes", () => setShowAddPrize(true))
    registerTabAction("no-judges", () => setShowAddJudge(true))
    registerTabAction("no-judges-active", () => setShowAddJudge(true))
    registerTabAction("results-not-published", () => setPublishDialogOpen(true))
    return () => {
      unregisterTabAction("no-prizes")
      unregisterTabAction("no-judges")
      unregisterTabAction("no-judges-active")
      unregisterTabAction("results-not-published")
    }
  }, [actionItems])

  const [editingPrize, setEditingPrize] = useState<EditablePrize | null>(null)

  const base = `/api/dashboard/hackathons/${hackathonId}`

  const prizesList = useOptimisticList({ items: sharedPrizes, getId: getPrizeId })
  const judgesList = useOptimisticList({ items: initialJudges, getId: getJudgeParticipantId })
  const invitationsList = useOptimisticList({ items: initialInvitations, getId: getInvitationId })

  const {
    optimisticJudges: judges,
    assignJudgeToPrize,
    unassignJudgeFromPrize,
  } = usePrizeJudgeAssignments({ hackathonId, judges: judgesList.visibleItems })
  const prizes = prizesList.visibleItems
  const invitations = invitationsList.visibleItems

  const coreWeightSum = coreCriteria.reduce((acc, c) => acc + c.weight, 0)
  const weightWarnings = prizes
    .filter((p) => p.judgingStyle === "weighted_score")
    .map((p) => ({
      id: p.id,
      name: p.name,
      sum:
        coreWeightSum +
        (p.criteria ?? []).reduce((acc, c) => acc + (c.weight ?? 0), 0),
    }))
    .filter((w) => Math.abs(w.sum - 100) > 0.01)

  const overallPercent = initialProgress.totalAssignments > 0
    ? Math.round((initialProgress.completedAssignments / initialProgress.totalAssignments) * 100)
    : 0

  const { execute: handleDeletePrize, error: deletePrizeError } = useOptimisticMutation({
    fn: (prizeId: string) =>
      fetch(`${base}/prizes/${prizeId}`, { method: "DELETE" }).then(assertOk),
    onOptimistic: (prizeId) => prizesList.hideItem(prizeId),
    onRevert: (prizeId) => prizesList.unhideItem(prizeId),
  })

  const { execute: handleRemoveJudge, error: removeJudgeError } = useOptimisticMutation({
    fn: (participantId: string) =>
      fetch(`${base}/judging/judges/${participantId}`, { method: "DELETE" }).then(assertOk),
    onOptimistic: (participantId) => judgesList.hideItem(participantId),
    onRevert: (participantId) => judgesList.unhideItem(participantId),
  })

  async function handleUpdatePrizeModes(prizeId: string, modes: TeamMode[] | null) {
    const previous = prizesList.visibleItems.find((p) => p.id === prizeId)?.allowedTeamModes ?? null
    prizesList.setLocalEdit(prizeId, { allowedTeamModes: modes })
    try {
      await fetch(`${base}/prizes/${prizeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedTeamModes: modes }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      prizesList.setLocalEdit(prizeId, { allowedTeamModes: previous })
      setError(err instanceof Error ? err.message : "Failed to update prize filter")
    }
  }

  function handleEditPrize(prize: PrizeData) {
    setEditingPrize({
      id: prize.id,
      name: prize.name,
      description: prize.description,
      value: prize.value,
      judgingStyle: prize.judgingStyle as EditablePrize["judgingStyle"],
      maxPicks: prize.maxPicks,
      criteria: prize.criteria,
      buckets: prize.buckets,
    })
  }

  function handlePrizeUpdated(updated: UpdatedPrize) {
    prizesList.setLocalEdit(updated.id, {
      name: updated.name,
      description: updated.description,
      value: updated.value,
      maxPicks: updated.maxPicks,
      criteria: updated.criteria,
      buckets: updated.buckets,
    })
  }

  const { execute: handleCancelInvitation, error: cancelInvitationError } = useOptimisticMutation({
    fn: (invitationId: string) =>
      fetch(`${base}/judging/invitations/${invitationId}`, { method: "DELETE" }).then(assertOk),
    onOptimistic: (invitationId) => invitationsList.hideItem(invitationId),
    onRevert: (invitationId) => invitationsList.unhideItem(invitationId),
  })

  const { execute: handleRemindInvitation, error: remindInvitationError } = useOptimisticMutation({
    fn: (invitationId: string) =>
      fetch(`${base}/judging/invitations/${invitationId}/remind`, { method: "POST" }).then(assertOk),
    onOptimistic: (invitationId) =>
      invitationsList.setLocalEdit(invitationId, { remindedAt: new Date().toISOString() }),
    onRevert: (invitationId) =>
      invitationsList.clearLocalEdit(invitationId),
  })

  async function handlePublish() {
    setPublishing(true)
    setError(null)
    try {
      await fetch(`${base}/results/calculate`, { method: "POST" }).then(assertOk)
      await fetch(`${base}/results/publish`, { method: "POST" }).then(assertOk)
      setIsPublished(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish")
    } finally {
      setPublishing(false)
    }
  }

  async function handleUnpublish() {
    setPublishing(true)
    setError(null)
    try {
      await fetch(`${base}/results/unpublish`, { method: "POST" }).then(assertOk)
      setIsPublished(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unpublish")
    } finally {
      setPublishing(false)
    }
  }

  const mutationError = deletePrizeError || removeJudgeError || cancelInvitationError || remindInvitationError

  return (
    <div className="space-y-6">
      {(error || mutationError) && <p className="text-sm text-destructive">{error || mutationError}</p>}

      {initialProgress.totalAssignments > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {initialProgress.completedAssignments} of {initialProgress.totalAssignments} assignments scored
            </span>
            <span className="font-medium">{overallPercent}%</span>
          </div>
          <Progress value={overallPercent} />
        </div>
      )}

      <TabsUrlSync paramKey="jtab" value={activeJtab}>
        <TabsList variant="line">
          <TabsTrigger value="setup">
            <ListChecks className="size-3.5" />
            Setup Guide
          </TabsTrigger>
          <TabsTrigger value="judges">
            <Users className="size-3.5" />
            Judges
            {judges.length > 0 && (
              <Badge variant="secondary" className="ml-1">{judges.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rounds">
            <Layers className="size-3.5" />
            Rounds
            {rounds.length > 0 && (
              <Badge variant="secondary" className="ml-1">{rounds.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="prizes">
            <Trophy className="size-3.5" />
            Prizes & Scoring
            {prizes.length > 0 && (
              <Badge variant="secondary" className="ml-1">{prizes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <ClipboardList className="size-3.5" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="results">
            <Calculator className="size-3.5" />
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-4" data-webmcp-section="judging_setup">
          <JudgingSetupWizard
            hackathonId={hackathonId}
            slug={slug}
            prizes={prizes.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              value: p.value,
              judgingStyle: p.judgingStyle,
              assignmentMode: p.assignmentMode,
              maxPicks: p.maxPicks,
              roundId: p.roundId,
              displayOrder: p.displayOrder,
              totalAssignments: p.totalAssignments,
              completedAssignments: p.completedAssignments,
              judgeCount: p.judgeCount,
              sponsorName: p.sponsorName ?? null,
              bonusCriteriaCount:
                p.judgingStyle === "weighted_score"
                  ? (p.criteria?.length ?? 0)
                  : 0,
              bonusWeightSum:
                p.judgingStyle === "weighted_score"
                  ? (p.criteria ?? []).reduce((acc, c) => acc + (c.weight ?? 0), 0)
                  : 0,
            }))}
            judges={initialJudges}
            rounds={rounds}
            pendingInvitations={initialInvitations}
            coreCriteria={coreCriteria}
            onEditPrize={(prizeId) => {
              const prize = prizes.find((p) => p.id === prizeId)
              if (prize) handleEditPrize(prize)
            }}
          />
        </TabsContent>

        <TabsContent value="judges" className="mt-4" data-webmcp-section="judges">
          <JudgesSection
            judges={judges}
            invitations={invitations}
            hackathonId={hackathonId}
            onAddJudge={() => setShowAddJudge(true)}
            onRemoveJudge={handleRemoveJudge}
            onCancelInvitation={handleCancelInvitation}
            onRemindInvitation={handleRemindInvitation}
          />
        </TabsContent>

        <TabsContent value="rounds" className="mt-4" data-webmcp-section="rounds">
          <RoundsSection hackathonId={hackathonId} rounds={rounds} />
        </TabsContent>

        <TabsContent value="prizes" className="mt-4 space-y-6" data-webmcp-section="prizes">
          {weightWarnings.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">Some prize weights don&apos;t add up to 100%.</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                {weightWarnings.map((w) => (
                  <li key={w.id}>
                    {w.name}: {w.sum}%
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">
                You can save and come back to this. Judges will still score on what you set.
              </p>
            </div>
          )}
          <div className="space-y-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Sliders className="size-4" />
              Scoring
            </h3>
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="weighted-scoring-toggle" className="text-base font-semibold">
                      Weight-based scoring
                    </Label>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Judges evaluate submissions on numerical sliders. You define
                      the weight of each criterion.
                    </p>
                    {weightedScoringLocked && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Remove your shared criteria and any weighted-score prizes to turn this off.
                      </p>
                    )}
                  </div>
                  <Switch
                    id="weighted-scoring-toggle"
                    checked={weightedScoringEnabled}
                    onCheckedChange={setWeightedScoringEnabled}
                    disabled={weightedScoringLocked}
                  />
                </div>
                {weightedScoringEnabled && (
                  <CoreCriteriaEditor hackathonId={hackathonId} criteria={coreCriteria} />
                )}
              </CardContent>
            </Card>
          </div>
          <PrizesSection
            hackathonId={hackathonId}
            prizes={prizes}
            judges={judges}
            rounds={rounds}
            locationType={locationType}
            onAddPrize={() => setShowAddPrize(true)}
            onDeletePrize={handleDeletePrize}
            onEditPrize={handleEditPrize}
            onAssignJudge={assignJudgeToPrize}
            onUnassignJudge={unassignJudgeFromPrize}
            onUpdateModes={handleUpdatePrizeModes}
            onRefresh={() => router.refresh()}
          />
        </TabsContent>

        <TabsContent value="assignments" className="mt-4" data-webmcp-section="assignments">
          <AssignmentsSection
            hackathonId={hackathonId}
            judges={judges.map((j) => ({
              participantId: j.participantId,
              displayName: j.displayName,
              imageUrl: j.imageUrl,
            }))}
            totalSubmissionCount={weightedAssignmentSummary?.totalSubmissionCount ?? _submissions.length}
            rooms={weightedAssignmentSummary?.rooms ?? []}
            countsByJudge={weightedAssignmentSummary?.countsByJudge ?? {}}
            hasWeightedScoring={
              coreCriteria.length > 0 ||
              prizes.some((p) => p.judgingStyle === "weighted_score")
            }
          />
        </TabsContent>

        <TabsContent value="results" className="mt-4" data-webmcp-section="results">
          {prizes.length > 0 || results.length > 0 ? (
            <ResultsSection
              hackathonId={hackathonId}
              slug={slug}
              results={results}
              resultsByPrize={resultsByPrize}
              isPublished={isPublished}
              publishing={publishing}
              publishDialogOpen={publishDialogOpen}
              onPublishDialogChange={setPublishDialogOpen}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              incompleteAssignments={initialProgress.totalAssignments - initialProgress.completedAssignments}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Add prizes and judges to see results here.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </TabsUrlSync>

      <AddJudgeDialog
        hackathonId={hackathonId}
        open={showAddJudge}
        onOpenChange={setShowAddJudge}
        onSuccess={(result: AddJudgeResult) => {
          if (result.type === "judge") {
            judgesList.addPendingItem({
              participantId: result.participantId,
              clerkUserId: result.clerkUserId,
              displayName: result.displayName,
              email: result.email,
              imageUrl: result.imageUrl,
              prizeIds: [],
            })
          } else {
            invitationsList.addPendingItem({
              id: result.id,
              email: result.email,
              status: "pending",
              createdAt: new Date().toISOString(),
              remindedAt: null,
              token: result.token,
            })
          }
          router.refresh()
        }}
      />

      <EditPrizeDialog
        hackathonId={hackathonId}
        prize={editingPrize}
        onClose={() => setEditingPrize(null)}
        onSuccess={handlePrizeUpdated}
        coreWeightSum={coreCriteria.reduce((acc, c) => acc + c.weight, 0)}
      />

      <AddPrizeDialog
        hackathonId={hackathonId}
        open={showAddPrize}
        onOpenChange={setShowAddPrize}
        rounds={rounds}
        coreWeightSum={coreCriteria.reduce((acc, c) => acc + c.weight, 0)}
        existingPrizes={prizes.map((p) => ({ id: p.id, name: p.name }))}
        onEditExisting={(prizeId) => {
          const prize = prizes.find((p) => p.id === prizeId)
          if (prize) handleEditPrize(prize)
        }}
      />
    </div>
  )
}

export function JudgesSection({
  judges,
  invitations,
  hackathonId: _hackathonId,
  onAddJudge,
  onRemoveJudge,
  onCancelInvitation,
  onRemindInvitation,
}: {
  judges: JudgeData[]
  invitations: InvitationData[]
  hackathonId: string
  onAddJudge: () => void
  onRemoveJudge: (id: string) => void
  onCancelInvitation: (id: string) => void
  onRemindInvitation: (id: string) => void
}) {
  const isClient = useIsClient()
  const origin = isClient ? window.location.origin : ""
  const totalCount = judges.length + invitations.length
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)

  const handleCopyInvite = async (id: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedInviteId(id)
      setTimeout(
        () => setCopiedInviteId((prev) => (prev === id ? null : prev)),
        2000,
      )
    } catch {
      // Clipboard write can fail in restricted contexts (insecure origin,
      // permissions denied); the copy simply doesn't happen.
    }
  }

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Judges
          {totalCount > 0 && (
            <Badge variant="secondary">{totalCount}</Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onAddJudge}>
          <UserPlus className="mr-2 size-4" />
          <span className="hidden sm:inline">Add Judge</span>
        </Button>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No judges yet. Add judges to start assigning them to prizes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Judge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prizes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {judges.map((judge) => (
                  <TableRow key={`judge-${judge.participantId}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          {judge.imageUrl && (
                            <AvatarImage src={judge.imageUrl} alt={judge.displayName} />
                          )}
                          <AvatarFallback className="text-[10px]">
                            {getInitials(judge.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{judge.displayName}</div>
                          {judge.email && (
                            <div className="text-xs text-muted-foreground truncate">
                              {judge.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Active</Badge>
                    </TableCell>
                    <TableCell>
                      {judge.prizeIds.length > 0 ? (
                        <span className="text-sm">
                          {judge.prizeIds.length} prize{judge.prizeIds.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Open judge actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onRemoveJudge(judge.participantId)}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Remove judge
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {invitations.map((inv) => (
                  <TableRow key={`inv-${inv.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarFallback className="text-muted-foreground">
                            <Mail className="size-3" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{inv.email}</div>
                          <div className="text-xs text-muted-foreground">
                            Awaiting acceptance
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {inv.remindedAt ? (
                        <Badge variant="secondary">
                          <Bell className="mr-1 size-3" />
                          Reminded
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Clock className="mr-1 size-3" />
                          Invited
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Open invite actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {inv.token && (
                            <>
                              <DropdownMenuItem asChild>
                                <a
                                  href={`${origin}/judge-invite/${inv.token}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="mr-2 size-4" />
                                  Open invite link
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  void handleCopyInvite(
                                    inv.id,
                                    `${origin}/judge-invite/${inv.token}`,
                                  )
                                }}
                              >
                                {copiedInviteId === inv.id ? (
                                  <>
                                    <Check className="mr-2 size-4" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="mr-2 size-4" />
                                    Copy invite link
                                  </>
                                )}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => onRemindInvitation(inv.id)}>
                            <Bell className="mr-2 size-4" />
                            Send reminder
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onCancelInvitation(inv.id)}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Cancel invite
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PrizesSection({
  hackathonId,
  prizes,
  judges,
  rounds,
  locationType,
  onAddPrize,
  onDeletePrize,
  onEditPrize,
  onAssignJudge,
  onUnassignJudge,
  onUpdateModes,
  onRefresh,
}: {
  hackathonId: string
  prizes: PrizeData[]
  judges: JudgeData[]
  rounds: RoundData[]
  locationType: "in_person" | "virtual" | "hybrid" | null
  onAddPrize: () => void
  onDeletePrize: (id: string) => void
  onEditPrize: (prize: PrizeData) => void
  onAssignJudge: (prizeId: string, judgeParticipantId: string) => Promise<void>
  onUnassignJudge: (prizeId: string, judgeParticipantId: string) => Promise<void>
  onUpdateModes: (prizeId: string, modes: TeamMode[] | null) => Promise<void>
  onRefresh: () => void
}) {
  const [assignDialogPrize, setAssignDialogPrize] = useState<{ id: string; name: string } | null>(null)
  const [removingFromPrize, setRemovingFromPrize] = useState<{ prizeId: string; prizeName: string; judge: JudgeData } | null>(null)

  function handleConfirmRemoveFromPrize() {
    if (!removingFromPrize) return
    const { prizeId, judge } = removingFromPrize
    setRemovingFromPrize(null)
    onUnassignJudge(prizeId, judge.participantId)
  }


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Trophy className="size-4" />
          Prizes
        </h3>
        <Button size="sm" onClick={onAddPrize}>
          <Plus className="mr-2 size-4" />
          <span className="hidden sm:inline">Add Prize</span>
        </Button>
      </div>

      {prizes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground text-center">
              No prizes yet. Add a prize to set up judging.
            </p>
            <Button size="sm" variant="outline" className="mt-4" onClick={onAddPrize}>
              <Plus className="mr-2 size-4" />
              Add First Prize
            </Button>
          </CardContent>
        </Card>
      ) : rounds.length > 1 ? (
        <div className="space-y-4">
          {groupPrizesByRound(prizes, rounds).map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Layers className="size-3" />
                {group.label}
              </div>
              <div className="grid gap-3">
                {group.prizes.map((prize) => (
                  <PrizeCard
                    key={prize.id}
                    prize={prize}
                    judges={judges}
                    locationType={locationType}
                    onDeletePrize={onDeletePrize}
                    onEditPrize={onEditPrize}
                    onAssignJudgesClick={setAssignDialogPrize}
                    onRemoveJudgeFromPrize={setRemovingFromPrize}
                    onUpdateModes={onUpdateModes}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {prizes.map((prize) => (
            <PrizeCard
              key={prize.id}
              prize={prize}
              judges={judges}
              locationType={locationType}
              onDeletePrize={onDeletePrize}
              onEditPrize={onEditPrize}
              onAssignJudgesClick={setAssignDialogPrize}
              onRemoveJudgeFromPrize={setRemovingFromPrize}
              onUpdateModes={onUpdateModes}
            />
          ))}
        </div>
      )}

      {assignDialogPrize && (
        <AssignJudgesDialog
          hackathonId={hackathonId}
          prizeId={assignDialogPrize.id}
          prizeName={assignDialogPrize.name}
          judges={judges}
          open={!!assignDialogPrize}
          onOpenChange={(open) => { if (!open) setAssignDialogPrize(null) }}
          onAssignJudge={onAssignJudge}
          onUnassignJudge={onUnassignJudge}
          onRefresh={onRefresh}
        />
      )}

      <AlertDialog open={!!removingFromPrize} onOpenChange={(open) => { if (!open) setRemovingFromPrize(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove judge from prize?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removingFromPrize?.judge.displayName} from &ldquo;{removingFromPrize?.prizeName}&rdquo;.
              This will also delete any scores they&apos;ve submitted for this prize.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemoveFromPrize}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type RemovingFromPrize = { prizeId: string; prizeName: string; judge: JudgeData }

function PrizeCard({
  prize,
  judges,
  locationType,
  onDeletePrize,
  onEditPrize,
  onAssignJudgesClick,
  onRemoveJudgeFromPrize,
  onUpdateModes,
}: {
  prize: PrizeData
  judges: JudgeData[]
  locationType: "in_person" | "virtual" | "hybrid" | null
  onDeletePrize: (id: string) => void
  onEditPrize: (prize: PrizeData) => void
  onAssignJudgesClick: (args: { id: string; name: string }) => void
  onRemoveJudgeFromPrize: (args: RemovingFromPrize) => void
  onUpdateModes: (prizeId: string, modes: TeamMode[] | null) => Promise<void>
}) {
  const style = prize.judgingStyle ? STYLE_META[prize.judgingStyle] : null
  const StyleIcon = style?.icon ?? Trophy
  const pct = prize.totalAssignments > 0
    ? Math.round((prize.completedAssignments / prize.totalAssignments) * 100)
    : 0
  const assignedJudges = judges.filter((j) => j.prizeIds.includes(prize.id))
  const isCrowdVote = prize.judgingStyle === "crowd_vote"
  const isWeightedScore = prize.judgingStyle === "weighted_score"
  const isHybrid = locationType === "hybrid"
  const isSaving = prize.id.startsWith("webmcp-prize-")
  const modeFilter = modesToFilter(prize.allowedTeamModes)

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{prize.name}</span>
              {prize.value && <Badge variant="secondary">{prize.value}</Badge>}
              {isSaving && <Badge variant="secondary">Saving</Badge>}
              {style && (
                <Badge variant="outline" className={style.color}>
                  <StyleIcon className="mr-1 size-3" />
                  {style.label}
                </Badge>
              )}
              {isHybrid && !isSaving && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs font-normal"
                    >
                      <MapPin className="size-3" />
                      {modeFilter === "all"
                        ? "All teams"
                        : modeFilter === "in_person"
                          ? "In-person teams only"
                          : "Virtual teams only"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Who can win this prize?
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={modeFilter}
                      onValueChange={(v) => {
                        void onUpdateModes(prize.id, filterToModes(v as ModeFilter))
                      }}
                    >
                      <DropdownMenuRadioItem value="all">All teams</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="in_person">In-person teams only</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="virtual">Virtual teams only</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {prize.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">{prize.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {prize.totalAssignments > 0 && (
              <div className="flex items-center gap-2 w-24">
                <Progress value={pct} className="h-1.5" />
                <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
              </div>
            )}

            {!isSaving && <AlertDialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEditPrize(prize)}>
                    <Pencil className="mr-2 size-4" />
                    Edit prize
                  </DropdownMenuItem>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="mr-2 size-4" />
                      Delete Prize
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &ldquo;{prize.name}&rdquo;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete the prize and all its judge assignments, bucket definitions, and results. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDeletePrize(prize.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
          </div>
        </div>

        {!prize.judgingStyle && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">
              Pick how judges should score this prize.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditPrize(prize)}
            >
              Pick a style
            </Button>
          </div>
        )}

        {prize.judgingStyle === "gate_check" && prize.criteria && prize.criteria.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pass-or-fail rules ({prize.criteria.length})
            </p>
            <ul className="space-y-1">
              {prize.criteria.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.description && (
                    <span className="text-muted-foreground"> — {c.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {prize.judgingStyle === "bucket_sort" && prize.buckets && prize.buckets.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Sort groups ({prize.buckets.length})
            </p>
            <ul className="space-y-1">
              {prize.buckets.map((b) => (
                <li key={b.id} className="text-sm">
                  <span className="font-medium">{b.label}</span>
                  {b.description && (
                    <span className="text-muted-foreground"> — {b.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {prize.judgingStyle === "judges_pick" && prize.maxPicks != null && (
          <p className="text-xs text-muted-foreground">
            Each judge picks up to <span className="font-medium text-foreground">{prize.maxPicks}</span>.
          </p>
        )}

        {!isSaving && (isWeightedScore ? (
          <p className="text-xs text-muted-foreground">
            Judges for this prize are managed in the Assignments tab.
          </p>
        ) : !isCrowdVote && (
          <div className="flex items-center gap-2 flex-wrap">
            {assignedJudges.map((j) => (
              <JudgePill
                key={j.participantId}
                imageUrl={j.imageUrl}
                displayName={j.displayName}
                action={
                  <button
                    type="button"
                    onClick={() =>
                      onRemoveJudgeFromPrize({ prizeId: prize.id, prizeName: prize.name, judge: j })
                    }
                    className="flex items-center justify-center size-4 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                }
              />
            ))}

            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-full gap-1.5"
              onClick={() => onAssignJudgesClick({ id: prize.id, name: prize.name })}
            >
              <Plus className="size-3" />
              <span className="hidden sm:inline">
                {assignedJudges.length === 0 ? "Assign Judges" : "Edit"}
              </span>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function groupPrizesByRound(
  prizes: PrizeData[],
  rounds: RoundData[]
): { key: string; label: string; prizes: PrizeData[] }[] {
  const sorted = [...rounds].sort((a, b) => a.displayOrder - b.displayOrder)
  const byRound = new Map<string | null, PrizeData[]>()
  for (const p of prizes) {
    const key = p.roundId ?? null
    if (!byRound.has(key)) byRound.set(key, [])
    byRound.get(key)!.push(p)
  }
  const groups: { key: string; label: string; prizes: PrizeData[] }[] = []
  for (const r of sorted) {
    const inRound = byRound.get(r.id)
    if (inRound && inRound.length > 0) {
      groups.push({ key: r.id, label: r.name, prizes: inRound })
    }
  }
  const unassigned = byRound.get(null)
  if (unassigned && unassigned.length > 0) {
    groups.push({ key: "__none__", label: "No round", prizes: unassigned })
  }
  return groups
}

function ResultsSection({
  hackathonId: _hackathonId,
  slug,
  results,
  resultsByPrize,
  isPublished,
  publishing,
  publishDialogOpen,
  onPublishDialogChange,
  onPublish,
  onUnpublish,
  incompleteAssignments,
}: {
  hackathonId: string
  slug: string
  results: ResultData[]
  resultsByPrize: PrizeResultsGroup[]
  isPublished: boolean
  publishing: boolean
  publishDialogOpen: boolean
  onPublishDialogChange: (open: boolean) => void
  onPublish: () => void
  onUnpublish: () => void
  incompleteAssignments: number
}) {
  const [activePrizeTab, setActivePrizeTab] = useState<string>(
    resultsByPrize[0]?.prizeId ?? ""
  )
  const selectedPrizeTab = resultsByPrize.some((g) => g.prizeId === activePrizeTab)
    ? activePrizeTab
    : (resultsByPrize[0]?.prizeId ?? "")

  const hasAnyScored = results.length > 0

  const exportableRows = resultsByPrize.flatMap((group) =>
    group.results.map((r) => ({
      Prize: group.prizeName,
      Mode: group.mode,
      Style: group.judgingStyle ?? "",
      Rank: r.rank !== null ? r.rank : "",
      Project: r.submissionTitle,
      Team: r.teamName ?? "",
      "Weighted score": r.weightedScore !== null ? Number(r.weightedScore).toFixed(2) : "",
      "Total score": r.totalScore !== null ? Number(r.totalScore).toFixed(2) : "",
      Judges: r.judgeCount,
      "Assigned winner": r.isAssignedWinner ? "yes" : "",
    }))
  )

  const handleExportCsv = () => {
    const csv = toCsv(exportableRows, [
      { key: "Prize", header: "Prize" },
      { key: "Mode", header: "Mode" },
      { key: "Style", header: "Style" },
      { key: "Rank", header: "Rank" },
      { key: "Project", header: "Project" },
      { key: "Team", header: "Team" },
      { key: "Weighted score", header: "Weighted score" },
      { key: "Total score", header: "Total score" },
      { key: "Judges", header: "Judges" },
      { key: "Assigned winner", header: "Assigned winner" },
    ])
    const safeSlug = (slug || "hackathon").replace(/[^a-z0-9-]/gi, "") || "hackathon"
    const today = new Date().toISOString().slice(0, 10)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${safeSlug}-results-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Calculator className="size-4" />
          Results
          {isPublished ? (
            <Badge>Published</Badge>
          ) : hasAnyScored ? (
            <Badge variant="outline">Live</Badge>
          ) : null}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            disabled={exportableRows.length === 0}
          >
            <Download className="mr-2 size-4" />
            <span className="hidden sm:inline">Download CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          {isPublished ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={publishing}>
                  {publishing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GlobeLock className="mr-2 size-4" />}
                  Unpublish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unpublish Results?</AlertDialogTitle>
                  <AlertDialogDescription>Results will no longer be visible to participants.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onUnpublish}>Unpublish</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog open={publishDialogOpen} onOpenChange={onPublishDialogChange}>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={publishing || !hasAnyScored}>
                  {publishing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Globe className="mr-2 size-4" />}
                  Publish
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Publish Results?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Results will be visible to all participants. Winner notification emails will be sent.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onPublish}>Publish</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {incompleteAssignments > 0 && (
        <p className="text-sm text-muted-foreground">
          {incompleteAssignments} assignment{incompleteAssignments !== 1 ? "s" : ""} not yet completed.
        </p>
      )}

      {resultsByPrize.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No scored submissions yet. Results will appear here as judges submit their scores.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={selectedPrizeTab} onValueChange={setActivePrizeTab}>
          <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
            <TabsList variant="line">
              {resultsByPrize.map((group) => (
                <TabsTrigger key={group.prizeId} value={group.prizeId}>
                  {group.prizeName}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {resultsByPrize.map((group) => (
            <TabsContent key={group.prizeId} value={group.prizeId} className="mt-4">
              <PrizeResultsTable group={group} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

function PrizeResultsTable({ group }: { group: PrizeResultsGroup }) {
  if (group.results.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {group.mode === "manual"
              ? "No winners picked for this prize yet."
              : "No scores for this prize yet."}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (group.mode === "manual") {
    const hint =
      group.judgingStyle === "crowd_vote"
        ? "Picked by the crowd"
        : "Picked by judges"
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{hint}</p>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Team</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.results.map((r) => (
                <TableRow key={r.submissionId}>
                  <TableCell className="font-medium">{r.submissionTitle}</TableCell>
                  <TableCell className="text-muted-foreground">{r.teamName || "\u2014"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Rank</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Team</TableHead>
            <TableHead className="text-right">Weighted score</TableHead>
            <TableHead className="text-right">Total score</TableHead>
            <TableHead className="text-right">Judges</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.results.map((r) => (
            <TableRow key={r.submissionId}>
              <TableCell className="font-bold text-lg">
                {r.rank !== null ? `#${r.rank}` : "\u2014"}
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {r.submissionTitle}
                  {r.isAssignedWinner && <Badge variant="secondary">Winner</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{r.teamName || "\u2014"}</TableCell>
              <TableCell className="text-right font-mono">
                {r.weightedScore !== null ? Number(r.weightedScore).toFixed(2) : "\u2014"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {r.totalScore !== null ? Number(r.totalScore).toFixed(2) : "\u2014"}
              </TableCell>
              <TableCell className="text-right">{r.judgeCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
