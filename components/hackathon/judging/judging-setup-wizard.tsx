"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Trophy,
  Users,
  Layers,
  CheckCircle2,
  Plus,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Mail,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { AddPrizeDialog, type CreatedPrize } from "./add-prize-dialog"
import { AddJudgeDialog, type AddJudgeResult } from "./add-judge-dialog"
import { AssignJudgesDialog } from "./assign-judges-dialog"
import { RoundFormDialog, type CreatedRound } from "./round-form-dialog"
import { JudgePill } from "./judge-pill"
import type { RoundData } from "./rounds-types"

type WizardPrize = {
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
}

type WizardJudge = {
  participantId: string
  clerkUserId: string
  displayName: string
  email: string | null
  imageUrl: string | null
  prizeIds: string[]
}

type WizardInvitation = {
  id: string
  email: string
  status: string
  createdAt: string
}

type Props = {
  hackathonId: string
  slug: string
  prizes: WizardPrize[]
  judges: WizardJudge[]
  rounds: RoundData[]
  pendingInvitations: WizardInvitation[]
}

const STEPS = [
  { id: 1, label: "Rounds", icon: Layers },
  { id: 2, label: "Prizes", icon: Trophy },
  { id: 3, label: "Judges", icon: Users },
  { id: 4, label: "Assignments", icon: CheckCircle2 },
] as const

type StepId = (typeof STEPS)[number]["id"]

function firstIncompleteStep(
  prizes: WizardPrize[],
  judges: WizardJudge[],
  rounds: RoundData[],
  roundsAcknowledged: boolean,
): StepId {
  if (rounds.length === 0 && !roundsAcknowledged) return 1
  if (prizes.length === 0) return 2
  if (judges.length === 0) return 3
  return 4
}

export function JudgingSetupWizard({
  hackathonId,
  slug,
  prizes,
  judges,
  rounds,
  pendingInvitations,
}: Props) {
  const router = useRouter()
  const [roundsAcknowledged, setRoundsAcknowledged] = useState(false)
  const [hiddenPrizeIds, setHiddenPrizeIds] = useState<Set<string>>(new Set())
  const [hiddenRoundIds, setHiddenRoundIds] = useState<Set<string>>(new Set())
  const [hiddenJudgeIds, setHiddenJudgeIds] = useState<Set<string>>(new Set())
  const [hiddenInvitationIds, setHiddenInvitationIds] = useState<Set<string>>(new Set())
  const [hiddenPrizeJudges, setHiddenPrizeJudges] = useState<Set<string>>(new Set())

  const [pendingPrizes, setPendingPrizes] = useState<WizardPrize[]>([])
  const [pendingRounds, setPendingRounds] = useState<RoundData[]>([])
  const [pendingJudges, setPendingJudges] = useState<WizardJudge[]>([])
  const [pendingInvites, setPendingInvites] = useState<WizardInvitation[]>([])

  useEffect(() => {
    const ids = new Set(prizes.map((p) => p.id))
    setPendingPrizes((prev) => prev.filter((p) => !ids.has(p.id)))
  }, [prizes])
  useEffect(() => {
    const ids = new Set(rounds.map((r) => r.id))
    setPendingRounds((prev) => prev.filter((r) => !ids.has(r.id)))
  }, [rounds])
  useEffect(() => {
    const ids = new Set(judges.map((j) => j.participantId))
    setPendingJudges((prev) => prev.filter((j) => !ids.has(j.participantId)))
  }, [judges])
  useEffect(() => {
    const ids = new Set(pendingInvitations.map((i) => i.id))
    setPendingInvites((prev) => prev.filter((i) => !ids.has(i.id)))
  }, [pendingInvitations])

  const visiblePrizes = useMemo(
    () =>
      [...prizes, ...pendingPrizes].filter(
        (p, idx, arr) =>
          !hiddenPrizeIds.has(p.id) && arr.findIndex((x) => x.id === p.id) === idx,
      ),
    [prizes, pendingPrizes, hiddenPrizeIds],
  )
  const visibleRounds = useMemo(
    () =>
      [...rounds, ...pendingRounds].filter(
        (r, idx, arr) =>
          !hiddenRoundIds.has(r.id) && arr.findIndex((x) => x.id === r.id) === idx,
      ),
    [rounds, pendingRounds, hiddenRoundIds],
  )
  const visibleJudges = useMemo(
    () =>
      [...judges, ...pendingJudges]
        .filter(
          (j, idx, arr) =>
            !hiddenJudgeIds.has(j.participantId) &&
            arr.findIndex((x) => x.participantId === j.participantId) === idx,
        )
        .map((j) => ({
          ...j,
          prizeIds: j.prizeIds.filter(
            (pid) => !hiddenPrizeJudges.has(`${pid}:${j.participantId}`),
          ),
        })),
    [judges, pendingJudges, hiddenJudgeIds, hiddenPrizeJudges],
  )
  const visibleInvitations = useMemo(
    () =>
      [...pendingInvitations, ...pendingInvites].filter(
        (i, idx, arr) =>
          !hiddenInvitationIds.has(i.id) && arr.findIndex((x) => x.id === i.id) === idx,
      ),
    [pendingInvitations, pendingInvites, hiddenInvitationIds],
  )

  const storageKey = `wizard-step-${hackathonId}`
  const initialStep = useMemo(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        const parsed = Number(saved) as StepId
        if (parsed >= 1 && parsed <= 4) return parsed
      }
    }
    return firstIncompleteStep(visiblePrizes, visibleJudges, visibleRounds, roundsAcknowledged)
    // Seed once on mount; after that the user drives navigation explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [currentStep, setCurrentStepRaw] = useState<StepId>(initialStep)
  const setCurrentStep = (step: StepId) => {
    setCurrentStepRaw(step)
    sessionStorage.setItem(storageKey, String(step))
  }
  const [showPrizeDialog, setShowPrizeDialog] = useState(false)
  const [showJudgeDialog, setShowJudgeDialog] = useState(false)
  const [showRoundDialog, setShowRoundDialog] = useState(false)
  const [assignDialogPrize, setAssignDialogPrize] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => router.refresh()

  function handlePrizeCreated(created?: CreatedPrize) {
    if (created?.id) {
      setPendingPrizes((prev) => [
        ...prev.filter((p) => p.id !== created.id),
        {
          id: created.id,
          name: created.name,
          description: created.description,
          value: created.value,
          judgingStyle: created.judgingStyle,
          assignmentMode: null,
          maxPicks: null,
          roundId: created.roundId,
          displayOrder: 9999,
          totalAssignments: 0,
          completedAssignments: 0,
          judgeCount: 0,
        },
      ])
    }
    refresh()
  }

  function handleRoundCreated(created?: CreatedRound) {
    if (created?.id) {
      setPendingRounds((prev) => [
        ...prev.filter((r) => r.id !== created.id),
        created,
      ])
    }
    refresh()
  }

  function handleJudgeCreated(result: AddJudgeResult) {
    if (result.type === "judge") {
      setPendingJudges((prev) => [
        ...prev.filter((j) => j.participantId !== result.participantId),
        {
          participantId: result.participantId,
          clerkUserId: result.clerkUserId,
          displayName: result.displayName,
          email: result.email,
          imageUrl: result.imageUrl,
          prizeIds: [],
        },
      ])
    } else {
      setPendingInvites((prev) => [
        ...prev.filter((i) => i.id !== result.id),
        {
          id: result.id,
          email: result.email,
          status: "pending",
          createdAt: new Date().toISOString(),
        },
      ])
    }
    refresh()
  }

  const canAdvance = (() => {
    if (currentStep === 1) return visibleRounds.length > 0 || roundsAcknowledged
    if (currentStep === 2) return visiblePrizes.length > 0
    if (currentStep === 3) return visibleJudges.length > 0 || visibleInvitations.length > 0
    return true
  })()

  function goNext() {
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as StepId)
    } else {
      router.push(`/e/${slug}/manage?tab=judging&jtab=judges`)
      router.refresh()
    }
  }

  function goBack() {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as StepId)
    }
  }

  async function handleDeletePrize(prizeId: string) {
    setError(null)
    setHiddenPrizeIds((prev) => new Set(prev).add(prizeId))
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete prize")
      refresh()
    } catch (err) {
      setHiddenPrizeIds((prev) => {
        const next = new Set(prev)
        next.delete(prizeId)
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to delete prize")
    }
  }

  async function handleDeleteRound(roundId: string) {
    setError(null)
    setHiddenRoundIds((prev) => new Set(prev).add(roundId))
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/rounds/${roundId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete round")
      refresh()
    } catch (err) {
      setHiddenRoundIds((prev) => {
        const next = new Set(prev)
        next.delete(roundId)
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to delete round")
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    setError(null)
    setHiddenInvitationIds((prev) => new Set(prev).add(invitationId))
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/judge-invitations/${invitationId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to cancel invitation")
      refresh()
    } catch (err) {
      setHiddenInvitationIds((prev) => {
        const next = new Set(prev)
        next.delete(invitationId)
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to cancel invitation")
    }
  }

  async function handleRemoveJudge(participantId: string) {
    setError(null)
    setHiddenJudgeIds((prev) => new Set(prev).add(participantId))
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/judges/${participantId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to remove judge")
      refresh()
    } catch (err) {
      setHiddenJudgeIds((prev) => {
        const next = new Set(prev)
        next.delete(participantId)
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to remove judge")
    }
  }

  async function assignJudgeToPrize(prizeId: string, judgeParticipantId: string) {
    const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/assign-judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeParticipantId }),
    })
    if (!res.ok) throw new Error("Failed to assign")
  }

  async function unassignJudgeFromPrize(prizeId: string, judgeParticipantId: string) {
    const key = `${prizeId}:${judgeParticipantId}`
    setHiddenPrizeJudges((prev) => new Set(prev).add(key))
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}/judges/${judgeParticipantId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to unassign")
      refresh()
    } catch (err) {
      setHiddenPrizeJudges((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      throw err
    }
  }

  return (
    <div className="space-y-6">
      <WizardHeader
        currentStep={currentStep}
        stepsWithData={new Set<StepId>([
          ...(visibleRounds.length > 0 || roundsAcknowledged ? [1 as StepId] : []),
          ...(visiblePrizes.length > 0 ? [2 as StepId] : []),
          ...(visibleJudges.length > 0 || visibleInvitations.length > 0 ? [3 as StepId] : []),
          ...(visiblePrizes.length > 0 ? [4 as StepId] : []),
        ])}
        onStepClick={setCurrentStep}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border bg-background p-6">
        {currentStep === 1 && (
          <RoundsStep
            rounds={visibleRounds}
            roundsAcknowledged={roundsAcknowledged}
            onPickSingle={() => setRoundsAcknowledged(true)}
            onPickMultiple={() => {
              setRoundsAcknowledged(false)
              setShowRoundDialog(true)
            }}
            onAddMore={() => setShowRoundDialog(true)}
            onDelete={handleDeleteRound}
          />
        )}

        {currentStep === 2 && (
          <PrizesStep
            prizes={visiblePrizes}
            onAdd={() => setShowPrizeDialog(true)}
            onDelete={handleDeletePrize}
          />
        )}

        {currentStep === 3 && (
          <JudgesStep
            judges={visibleJudges}
            pendingInvitations={visibleInvitations}
            onAdd={() => setShowJudgeDialog(true)}
            onCancelInvite={handleCancelInvitation}
            onRemoveJudge={handleRemoveJudge}
          />
        )}

        {currentStep === 4 && (
          <AssignmentsStep
            prizes={visiblePrizes}
            judges={visibleJudges}
            rounds={visibleRounds}
            onOpenAssign={(p) => setAssignDialogPrize({ id: p.id, name: p.name })}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={goBack}
          disabled={currentStep === 1}
          className="gap-1.5"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {currentStep === 1 && !roundsAcknowledged && visibleRounds.length === 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRoundsAcknowledged(true)
                goNext()
              }}
            >
              Skip
            </Button>
          )}
          <Button type="button" onClick={goNext} disabled={!canAdvance} className="gap-1.5">
            {currentStep === 4 ? "Finish" : "Next"}
            {currentStep !== 4 && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </div>

      <AddPrizeDialog
        hackathonId={hackathonId}
        open={showPrizeDialog}
        onOpenChange={setShowPrizeDialog}
        onSuccess={handlePrizeCreated}
        rounds={visibleRounds}
      />
      <AddJudgeDialog
        hackathonId={hackathonId}
        open={showJudgeDialog}
        onOpenChange={setShowJudgeDialog}
        onSuccess={handleJudgeCreated}
      />
      <RoundFormDialog
        hackathonId={hackathonId}
        mode="create"
        open={showRoundDialog}
        onOpenChange={setShowRoundDialog}
        onSuccess={handleRoundCreated}
      />
      {assignDialogPrize && (
        <AssignJudgesDialog
          hackathonId={hackathonId}
          prizeId={assignDialogPrize.id}
          prizeName={assignDialogPrize.name}
          judges={visibleJudges}
          open={assignDialogPrize !== null}
          onOpenChange={(open) => !open && setAssignDialogPrize(null)}
          onAssignJudge={assignJudgeToPrize}
          onUnassignJudge={unassignJudgeFromPrize}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}

function WizardHeader({
  currentStep,
  stepsWithData,
  onStepClick,
}: {
  currentStep: StepId
  stepsWithData: Set<StepId>
  onStepClick: (id: StepId) => void
}) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto">
      {STEPS.map((step, idx) => {
        const Icon = step.icon
        const isActive = step.id === currentStep
        const isComplete = step.id < currentStep
        const hasData = stepsWithData.has(step.id)
        const isClickable = !isActive && (isComplete || hasData)
        return (
          <div key={step.id} className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-2 rounded-md px-1 py-0.5 -mx-1 transition-colors",
                isClickable && "cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !isClickable && "cursor-default",
              )}
              aria-label={isClickable ? `Go to ${step.label}` : step.label}
            >
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  isActive && "border-primary bg-primary text-primary-foreground",
                  isComplete && "border-primary bg-primary/10 text-primary",
                  !isActive && !isComplete && hasData && "border-primary/50 bg-primary/5 text-primary/70",
                  !isActive && !isComplete && !hasData && "border-muted-foreground/20 bg-background text-muted-foreground",
                )}
              >
                {isComplete ? <CheckCircle2 className="size-4" /> : <Icon className="size-3.5" />}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 transition-colors",
                  step.id < currentStep ? "bg-primary" : "bg-muted-foreground/20",
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5 space-y-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function PrizesStep({
  prizes,
  onAdd,
  onDelete,
}: {
  prizes: WizardPrize[]
  onAdd: () => void
  onDelete: (prizeId: string) => void
}) {
  return (
    <div>
      <StepIntro
        title="What are you awarding?"
        description="Add every prize or track you'll give out. You can edit or reorder these later."
      />
      {prizes.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <Trophy className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No prizes yet</p>
          <Button onClick={onAdd} className="mt-3 gap-1.5">
            <Plus className="size-4" />
            Add prize
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {prizes.map((prize) => (
            <div
              key={prize.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{prize.name}</p>
                {prize.value && (
                  <p className="text-xs text-muted-foreground truncate">{prize.value}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onDelete(prize.id)}
                className="size-8 text-muted-foreground"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Delete {prize.name}</span>
              </Button>
            </div>
          ))}
          <Button onClick={onAdd} variant="outline" className="w-full gap-1.5">
            <Plus className="size-4" />
            Add another prize
          </Button>
        </div>
      )}
    </div>
  )
}

function RoundsStep({
  rounds,
  roundsAcknowledged,
  onPickSingle,
  onPickMultiple,
  onAddMore,
  onDelete,
}: {
  rounds: RoundData[]
  roundsAcknowledged: boolean
  onPickSingle: () => void
  onPickMultiple: () => void
  onAddMore: () => void
  onDelete: (roundId: string) => void
}) {
  const multipleSelected = rounds.length > 0
  const singleSelected = roundsAcknowledged && rounds.length === 0

  return (
    <div>
      <StepIntro
        title="How many rounds of judging?"
        description="Most events judge in one round. Add rounds only if you need a finalists stage."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onPickSingle}
          className={cn(
            "rounded-md border p-4 text-left transition-colors hover:bg-muted/50",
            singleSelected && "border-primary ring-1 ring-primary",
          )}
        >
          <p className="font-medium">Single round</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every judge scores every prize in one pass.
          </p>
        </button>
        <button
          type="button"
          onClick={onPickMultiple}
          className={cn(
            "rounded-md border p-4 text-left transition-colors hover:bg-muted/50",
            multipleSelected && "border-primary ring-1 ring-primary",
          )}
        >
          <p className="font-medium">Multiple rounds</p>
          <p className="mt-1 text-xs text-muted-foreground">
            First narrow to finalists, then pick winners.
          </p>
        </button>
      </div>

      {rounds.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Your rounds</p>
          {rounds
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((round) => (
              <div
                key={round.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{round.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {round.advancement === "top_n"
                      ? `Advance top ${round.advancementConfig.topN ?? 0}`
                      : round.advancement === "threshold"
                      ? `Advance ≥ ${round.advancementConfig.threshold ?? 0}`
                      : "Manual advancement"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(round.id)}
                  className="size-8 text-muted-foreground"
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Delete {round.name}</span>
                </Button>
              </div>
            ))}
          <Button onClick={onAddMore} variant="outline" className="w-full gap-1.5">
            <Plus className="size-4" />
            Add another round
          </Button>
        </div>
      )}
    </div>
  )
}

function JudgesStep({
  judges,
  pendingInvitations,
  onAdd,
  onCancelInvite,
  onRemoveJudge,
}: {
  judges: WizardJudge[]
  pendingInvitations: WizardInvitation[]
  onAdd: () => void
  onCancelInvite: (invitationId: string) => void
  onRemoveJudge: (participantId: string) => void
}) {
  const hasAny = judges.length > 0 || pendingInvitations.length > 0
  return (
    <div>
      <StepIntro
        title="Who's judging?"
        description="Invite judges by email. They'll get a link to accept and start scoring when judging opens."
      />
      {!hasAny ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <Users className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No judges yet</p>
          <Button onClick={onAdd} className="mt-3 gap-1.5">
            <Plus className="size-4" />
            Add judge
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {judges.map((judge) => (
            <div
              key={judge.participantId}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <JudgePill
                  imageUrl={judge.imageUrl}
                  displayName={judge.displayName}
                  badge={<Badge variant="secondary" className="font-normal">Accepted</Badge>}
                />
                {judge.email && (
                  <span className="truncate text-xs text-muted-foreground">{judge.email}</span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemoveJudge(judge.participantId)}
                className="size-8 text-muted-foreground"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Remove {judge.displayName}</span>
              </Button>
            </div>
          ))}
          {pendingInvitations.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0 text-sm">
                <Mail className="size-4 text-muted-foreground shrink-0" />
                <span className="truncate">{invite.email}</span>
                <Badge variant="secondary" className="font-normal gap-1">
                  <Clock className="size-3" />
                  Pending
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onCancelInvite(invite.id)}
                className="size-8 text-muted-foreground"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Cancel invite</span>
              </Button>
            </div>
          ))}
          <Button onClick={onAdd} variant="outline" className="w-full gap-1.5">
            <Plus className="size-4" />
            Add another judge
          </Button>
        </div>
      )}
    </div>
  )
}

function PrizeAssignmentCard({
  prize,
  judges,
  onOpenAssign,
}: {
  prize: WizardPrize
  judges: WizardJudge[]
  onOpenAssign: (prize: { id: string; name: string }) => void
}) {
  const assigned = judges.filter((j) => j.prizeIds.includes(prize.id))
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">{prize.name}</p>
          {assigned.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No judges assigned</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {assigned.map((judge) => (
                <JudgePill
                  key={judge.participantId}
                  imageUrl={judge.imageUrl}
                  displayName={judge.displayName}
                />
              ))}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenAssign({ id: prize.id, name: prize.name })}
          className="shrink-0"
        >
          {assigned.length === 0 ? "Assign" : "Edit"}
        </Button>
      </div>
    </div>
  )
}

function AssignmentsStep({
  prizes,
  judges,
  rounds,
  onOpenAssign,
}: {
  prizes: WizardPrize[]
  judges: WizardJudge[]
  rounds: RoundData[]
  onOpenAssign: (prize: { id: string; name: string }) => void
}) {
  const grouped = rounds.length > 1
  const groups = grouped ? groupPrizesByRound(prizes, rounds) : null

  return (
    <div>
      <StepIntro
        title="Which judges evaluate which prizes?"
        description="Assign at least one judge per prize. Crowd-vote prizes can be left unassigned."
      />
      {prizes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add prizes first.</p>
      ) : groups ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Layers className="size-3" />
                {group.label}
              </div>
              {group.prizes.map((prize) => (
                <PrizeAssignmentCard
                  key={prize.id}
                  prize={prize}
                  judges={judges}
                  onOpenAssign={onOpenAssign}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {prizes.map((prize) => (
            <PrizeAssignmentCard
              key={prize.id}
              prize={prize}
              judges={judges}
              onOpenAssign={onOpenAssign}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function groupPrizesByRound(
  prizes: WizardPrize[],
  rounds: RoundData[]
): { key: string; label: string; prizes: WizardPrize[] }[] {
  const sorted = [...rounds].sort((a, b) => a.displayOrder - b.displayOrder)
  const byRound = new Map<string | null, WizardPrize[]>()
  for (const p of prizes) {
    const key = p.roundId ?? null
    if (!byRound.has(key)) byRound.set(key, [])
    byRound.get(key)!.push(p)
  }
  const groups: { key: string; label: string; prizes: WizardPrize[] }[] = []
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
