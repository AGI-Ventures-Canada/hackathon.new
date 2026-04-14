"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { JudgingSetupWizard } from "./judging-setup-wizard"
import type { WizardJudgeAdded, WizardPrizeAdded } from "./judging-setup-wizard"
import type { RoundData } from "./rounds-types"
import { assertOk } from "@/lib/utils/fetch"

type PrizeResponse = {
  id: string
  name: string
  description: string | null
  value: string | null
  judging_style: string | null
  assignment_mode: string | null
  max_picks: number | null
  round_id: string | null
  display_order: number
  is_screening: boolean
  totalAssignments: number
  completedAssignments: number
  judgeCount: number
}

type JudgeResponse = {
  participantId: string
  clerkUserId: string
  displayName: string
  email: string | null
  imageUrl: string | null
  prizeIds: string[]
}

type RoundResponse = {
  id: string
  name: string
  status: string
  displayOrder: number
  advancement: string
  advancementConfig: Record<string, unknown>
  prizeCount: number
  screeningPrizeId: string | null
}

type InvitationResponse = {
  id: string
  email: string
  status: string
  created_at: string
}

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

interface JudgingSetupDialogProps {
  hackathonId: string
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onJudgeAdded?: (judge: WizardJudgeAdded) => void
  onPrizeAdded?: (prize: WizardPrizeAdded) => void
}

export function JudgingSetupDialog({
  hackathonId,
  slug,
  open,
  onOpenChange,
  onJudgeAdded,
  onPrizeAdded,
}: JudgingSetupDialogProps) {
  const [prizes, setPrizes] = useState<WizardPrize[]>([])
  const [judges, setJudges] = useState<WizardJudge[]>([])
  const [rounds, setRounds] = useState<RoundData[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<WizardInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [prizesData, judgesData, roundsData, invitationsData] = await Promise.all([
        fetch(`/api/dashboard/hackathons/${hackathonId}/prizes`).then(assertOk<{ prizes: PrizeResponse[] }>),
        fetch(`/api/dashboard/hackathons/${hackathonId}/judging/judges`).then(assertOk<{ judges: JudgeResponse[] }>),
        fetch(`/api/dashboard/hackathons/${hackathonId}/rounds`).then(assertOk<{ rounds: RoundResponse[] }>),
        fetch(`/api/dashboard/hackathons/${hackathonId}/judging/invitations`).then(assertOk<{ invitations: InvitationResponse[] }>),
      ])

      setPrizes(
        (prizesData.prizes ?? [])
          .filter((p) => !p.is_screening)
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? null,
            value: p.value ?? null,
            judgingStyle: p.judging_style ?? null,
            assignmentMode: p.assignment_mode ?? null,
            maxPicks: p.max_picks ?? null,
            roundId: p.round_id ?? null,
            displayOrder: p.display_order ?? 0,
            totalAssignments: p.totalAssignments ?? 0,
            completedAssignments: p.completedAssignments ?? 0,
            judgeCount: p.judgeCount ?? 0,
          }))
      )

      setJudges(
        (judgesData.judges ?? []).map((j) => ({
          participantId: j.participantId,
          clerkUserId: j.clerkUserId,
          displayName: j.displayName,
          email: j.email ?? null,
          imageUrl: j.imageUrl ?? null,
          prizeIds: j.prizeIds ?? [],
        }))
      )

      setRounds(
        (roundsData.rounds ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status ?? "planned",
          isActive: r.status === "active",
          displayOrder: r.displayOrder ?? 0,
          advancement: (r.advancement as RoundData["advancement"]) ?? "manual",
          advancementConfig: (r.advancementConfig as RoundData["advancementConfig"]) ?? {},
          prizeCount: r.prizeCount ?? 0,
          screeningPrizeId: r.screeningPrizeId ?? null,
        }))
      )

      const allInvitations = invitationsData.invitations ?? []
      setPendingInvitations(
        allInvitations
          .filter((i) => i.status === "pending")
          .map((i) => ({
            id: i.id,
            email: i.email,
            status: i.status,
            createdAt: i.created_at,
          }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load judging data")
    } finally {
      setLoading(false)
    }
  }, [hackathonId])

  useEffect(() => {
    if (open) {
      fetchData()
    }
  }, [open, fetchData])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Judging &amp; prizes setup</DialogTitle>
          <DialogDescription>
            Set up rounds, prizes, judges, and assignments for your event.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <JudgingSetupWizard
            hackathonId={hackathonId}
            slug={slug}
            prizes={prizes}
            judges={judges}
            rounds={rounds}
            pendingInvitations={pendingInvitations}
            onFinish={() => onOpenChange(false)}
            onJudgeAdded={onJudgeAdded}
            onPrizeAdded={onPrizeAdded}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
