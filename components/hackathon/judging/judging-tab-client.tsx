"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/app/(public)/e/[slug]/manage/_tabs-url-sync"
import { JudgingSetupWizard } from "./judging-setup-wizard"
import type { ManageJtab } from "@/lib/utils/manage-tabs"
import {
  Plus,
  UserPlus,
  Trash2,
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
} from "lucide-react"
import { useActionItemsOptional } from "@/components/hackathon/manage/action-items-context"
import { AddJudgeDialog, type AddJudgeResult } from "./add-judge-dialog"
import { AddPrizeDialog } from "./add-prize-dialog"
import { AssignJudgesDialog } from "./assign-judges-dialog"
import { JudgePill } from "./judge-pill"
import { RoundsSection } from "./rounds-section"
import type { RoundData } from "./rounds-types"

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
}: JudgingTabClientProps) {
  const router = useRouter()
  const [showAddJudge, setShowAddJudge] = useState(false)
  const [showAddPrize, setShowAddPrize] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const results = initialResults
  const [isPublished, setIsPublished] = useState(initialIsPublished)
  const [error, setError] = useState<string | null>(null)

  const actionItems = useActionItemsOptional()

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

  const [hiddenJudges, setHiddenJudges] = useState<Set<string>>(new Set())
  const [hiddenPrizes, setHiddenPrizes] = useState<Set<string>>(new Set())
  const [hiddenInvitations, setHiddenInvitations] = useState<Set<string>>(new Set())
  const [hiddenPrizeJudges, setHiddenPrizeJudges] = useState<Set<string>>(new Set())
  const [pendingJudges, setPendingJudges] = useState<JudgeData[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<InvitationData[]>([])
  const [modeOverrides, setModeOverrides] = useState<Record<string, TeamMode[] | null>>({})

  useEffect(() => {
    setPendingJudges(prev => prev.filter(pj => !initialJudges.some(j => j.participantId === pj.participantId)))
  }, [initialJudges])

  useEffect(() => {
    setPendingInvitations(prev => prev.filter(pi => !initialInvitations.some(i => i.id === pi.id)))
  }, [initialInvitations])

  const judges = [
    ...initialJudges,
    ...pendingJudges.filter(pj => !initialJudges.some(j => j.participantId === pj.participantId)),
  ]
    .filter(j => !hiddenJudges.has(j.participantId))
    .map(j => ({
      ...j,
      prizeIds: j.prizeIds.filter(pid => !hiddenPrizeJudges.has(`${pid}:${j.participantId}`)),
    }))
  const prizes = initialPrizes
    .filter(p => !hiddenPrizes.has(p.id))
    .map(p => (p.id in modeOverrides ? { ...p, allowedTeamModes: modeOverrides[p.id] } : p))
  const invitations = [
    ...initialInvitations,
    ...pendingInvitations.filter(pi => !initialInvitations.some(i => i.id === pi.id)),
  ].filter(i => !hiddenInvitations.has(i.id))


  const base = `/api/dashboard/hackathons/${hackathonId}`

  const overallPercent = initialProgress.totalAssignments > 0
    ? Math.round((initialProgress.completedAssignments / initialProgress.totalAssignments) * 100)
    : 0

  async function handleUpdatePrizeModes(prizeId: string, modes: TeamMode[] | null) {
    const previous = initialPrizes.find(p => p.id === prizeId)?.allowedTeamModes ?? null
    setModeOverrides(prev => ({ ...prev, [prizeId]: modes }))
    try {
      const res = await fetch(`${base}/prizes/${prizeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedTeamModes: modes }),
      })
      if (!res.ok) throw new Error("Failed to update prize filter")
      router.refresh()
    } catch (err) {
      setModeOverrides(prev => ({ ...prev, [prizeId]: previous }))
      setError(err instanceof Error ? err.message : "Failed to update prize filter")
      throw err
    }
  }

  async function handleDeletePrize(prizeId: string) {
    setHiddenPrizes(prev => new Set(prev).add(prizeId))
    try {
      const res = await fetch(`${base}/prizes/${prizeId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      router.refresh()
    } catch {
      setHiddenPrizes(prev => { const next = new Set(prev); next.delete(prizeId); return next })
      setError("Failed to delete prize")
    }
  }

  async function handleRemoveJudge(participantId: string) {
    setHiddenJudges(prev => new Set(prev).add(participantId))
    try {
      const res = await fetch(`${base}/judging/judges/${participantId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to remove")
      router.refresh()
    } catch {
      setHiddenJudges(prev => { const next = new Set(prev); next.delete(participantId); return next })
      setError("Failed to remove judge")
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    setHiddenInvitations(prev => new Set(prev).add(invitationId))
    try {
      const res = await fetch(`${base}/judging/invitations/${invitationId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to cancel")
      router.refresh()
    } catch {
      setHiddenInvitations(prev => { const next = new Set(prev); next.delete(invitationId); return next })
      setError("Failed to cancel invitation")
    }
  }

  async function assignJudgeToPrize(prizeId: string, judgeParticipantId: string) {
    const res = await fetch(`${base}/prizes/${prizeId}/assign-judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeParticipantId }),
    })
    if (!res.ok) throw new Error("Failed to assign")
  }

  async function unassignJudgeFromPrize(prizeId: string, judgeParticipantId: string) {
    const key = `${prizeId}:${judgeParticipantId}`
    setHiddenPrizeJudges(prev => new Set(prev).add(key))
    try {
      const res = await fetch(`${base}/prizes/${prizeId}/judges/${judgeParticipantId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to unassign")
      router.refresh()
    } catch (err) {
      setHiddenPrizeJudges(prev => { const next = new Set(prev); next.delete(key); return next })
      throw err
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setError(null)
    try {
      await fetch(`${base}/results/calculate`, { method: "POST" })
      const res = await fetch(`${base}/results/publish`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to publish")
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
      const res = await fetch(`${base}/results/unpublish`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to unpublish")
      setIsPublished(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unpublish")
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

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
            Prizes
            {prizes.length > 0 && (
              <Badge variant="secondary" className="ml-1">{prizes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="results">
            <Calculator className="size-3.5" />
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-4">
          <JudgingSetupWizard
            hackathonId={hackathonId}
            slug={slug}
            prizes={initialPrizes}
            judges={initialJudges}
            rounds={rounds}
            pendingInvitations={initialInvitations}
          />
        </TabsContent>

        <TabsContent value="judges" className="mt-4">
          <JudgesSection
            judges={judges}
            invitations={invitations}
            hackathonId={hackathonId}
            onAddJudge={() => setShowAddJudge(true)}
            onRemoveJudge={handleRemoveJudge}
            onCancelInvitation={handleCancelInvitation}
          />
        </TabsContent>

        <TabsContent value="rounds" className="mt-4">
          <RoundsSection hackathonId={hackathonId} rounds={rounds} />
        </TabsContent>

        <TabsContent value="prizes" className="mt-4">
          <PrizesSection
            hackathonId={hackathonId}
            prizes={prizes}
            judges={judges}
            rounds={rounds}
            locationType={locationType}
            onAddPrize={() => setShowAddPrize(true)}
            onDeletePrize={handleDeletePrize}
            onAssignJudge={assignJudgeToPrize}
            onUnassignJudge={unassignJudgeFromPrize}
            onUpdateModes={handleUpdatePrizeModes}
            onRefresh={() => router.refresh()}
          />
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          {prizes.length > 0 || results.length > 0 ? (
            <ResultsSection
              hackathonId={hackathonId}
              results={results}
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
            setPendingJudges(prev => [...prev, {
              participantId: result.participantId,
              clerkUserId: result.clerkUserId,
              displayName: result.displayName,
              email: result.email,
              imageUrl: result.imageUrl,
              prizeIds: [],
            }])
          } else {
            setPendingInvitations(prev => [...prev, {
              id: result.id,
              email: result.email,
              status: "pending",
              createdAt: new Date().toISOString(),
            }])
          }
          router.refresh()
        }}
      />

      <AddPrizeDialog
        hackathonId={hackathonId}
        open={showAddPrize}
        onOpenChange={setShowAddPrize}
        onSuccess={() => router.refresh()}
        rounds={rounds}
      />
    </div>
  )
}

function JudgesSection({
  judges,
  invitations,
  hackathonId: _hackathonId,
  onAddJudge,
  onRemoveJudge,
  onCancelInvitation,
}: {
  judges: JudgeData[]
  invitations: InvitationData[]
  hackathonId: string
  onAddJudge: () => void
  onRemoveJudge: (id: string) => void
  onCancelInvitation: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Judges
          {judges.length > 0 && (
            <Badge variant="secondary">{judges.length}</Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onAddJudge}>
          <UserPlus className="mr-2 size-4" />
          <span className="hidden sm:inline">Add Judge</span>
        </Button>
      </CardHeader>
      <CardContent>
        {judges.length === 0 && invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No judges yet. Add judges to start assigning them to prizes.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {judges.map((judge) => (
                <JudgePill
                  key={judge.participantId}
                  imageUrl={judge.imageUrl}
                  displayName={judge.displayName}
                  badge={
                    judge.prizeIds.length > 0 ? (
                      <Badge variant="secondary" className="text-xs">{judge.prizeIds.length} prize{judge.prizeIds.length !== 1 ? "s" : ""}</Badge>
                    ) : undefined
                  }
                  action={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-6">
                          <MoreHorizontal className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => onRemoveJudge(judge.participantId)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Remove Judge
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              ))}
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground"
                >
                  <Mail className="size-3.5" />
                  <span>{inv.email}</span>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="mr-1 size-3" />
                    Invited
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => onCancelInvitation(inv.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
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
  onAssignJudgesClick,
  onRemoveJudgeFromPrize,
  onUpdateModes,
}: {
  prize: PrizeData
  judges: JudgeData[]
  locationType: "in_person" | "virtual" | "hybrid" | null
  onDeletePrize: (id: string) => void
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
  const isHybrid = locationType === "hybrid"
  const modeFilter = modesToFilter(prize.allowedTeamModes)

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{prize.name}</span>
              {prize.value && <Badge variant="secondary">{prize.value}</Badge>}
              {style && (
                <Badge variant="outline" className={style.color}>
                  <StyleIcon className="mr-1 size-3" />
                  {style.label}
                </Badge>
              )}
              {isHybrid && (
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

            <AlertDialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
            </AlertDialog>
          </div>
        </div>

        {!isCrowdVote && (
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
        )}
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
  results,
  isPublished,
  publishing,
  publishDialogOpen,
  onPublishDialogChange,
  onPublish,
  onUnpublish,
  incompleteAssignments,
}: {
  hackathonId: string
  results: ResultData[]
  isPublished: boolean
  publishing: boolean
  publishDialogOpen: boolean
  onPublishDialogChange: (open: boolean) => void
  onPublish: () => void
  onUnpublish: () => void
  incompleteAssignments: number
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Calculator className="size-4" />
          Results
          {isPublished ? (
            <Badge>Published</Badge>
          ) : results.length > 0 ? (
            <Badge variant="outline">Live</Badge>
          ) : null}
        </h3>
        <div className="flex items-center gap-2">
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
                <Button size="sm" disabled={publishing || results.length === 0}>
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

      {results.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No scored submissions yet. Results will appear here as judges submit their scores.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Rank</TableHead>
                <TableHead>Submission</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Judges</TableHead>
                <TableHead>Prizes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-bold text-lg">#{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.submissionTitle}</TableCell>
                  <TableCell className="text-muted-foreground">{r.teamName || "\u2014"}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.weightedScore !== null ? Number(r.weightedScore).toFixed(2) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">{r.judgeCount}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.prizes.map((p) => (
                        <Badge key={p.id} variant="secondary">{p.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
