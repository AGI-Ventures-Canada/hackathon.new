"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClipboardList, Loader2, Info, MapPin, ListChecks } from "lucide-react"
import { JudgePill } from "./judge-pill"
import { PickProjectsDialog } from "./pick-projects-dialog"
import { assertOk } from "@/lib/utils/fetch"

type JudgeRow = {
  participantId: string
  displayName: string
  imageUrl: string | null
}

type RoomOption = {
  id: string
  name: string
  submissionCount: number
}

type JudgeCountEntry = { all: number; byRoom: Record<string, number> }

const ALL_ROOMS = "all"

interface AssignmentsSectionProps {
  hackathonId: string
  judges: JudgeRow[]
  totalSubmissionCount: number
  rooms: RoomOption[]
  countsByJudge: Record<string, JudgeCountEntry>
  hasWeightedScoring: boolean
}

export function AssignmentsSection({
  hackathonId,
  judges,
  totalSubmissionCount,
  rooms,
  countsByJudge,
  hasWeightedScoring,
}: AssignmentsSectionProps) {
  const router = useRouter()
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [optimisticDelta, setOptimisticDelta] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<string>(ALL_ROOMS)
  const [pickerJudge, setPickerJudge] = useState<JudgeRow | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isAllRooms = selectedRoom === ALL_ROOMS
  const selectedRoomOption = isAllRooms ? null : rooms.find((r) => r.id === selectedRoom) ?? null
  const scopeCount = isAllRooms
    ? totalSubmissionCount
    : selectedRoomOption?.submissionCount ?? 0

  const baseCount = (id: string) => {
    const entry = countsByJudge[id]
    if (!entry) return 0
    return isAllRooms ? entry.all : entry.byRoom[selectedRoom] ?? 0
  }

  const counts = (id: string) => baseCount(id) + (optimisticDelta[id] ?? 0)

  async function assignJudge(participantId: string) {
    setError(null)
    const remaining = Math.max(0, scopeCount - counts(participantId))
    if (remaining === 0) return
    setPending((prev) => new Set(prev).add(participantId))
    setOptimisticDelta((prev) => ({
      ...prev,
      [participantId]: (prev[participantId] ?? 0) + remaining,
    }))
    try {
      await fetch(`/api/dashboard/hackathons/${hackathonId}/judging/assign-weighted-score-judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judgeParticipantId: participantId,
          ...(isAllRooms ? {} : { roomId: selectedRoom }),
        }),
      }).then(assertOk)
      router.refresh()
    } catch (err) {
      setOptimisticDelta((prev) => {
        const next = { ...prev }
        const current = next[participantId] ?? 0
        const reverted = current - remaining
        if (reverted === 0) delete next[participantId]
        else next[participantId] = reverted
        return next
      })
      setError(err instanceof Error ? err.message : "Failed to assign judge")
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(participantId)
        return next
      })
    }
  }

  async function assignAll() {
    setError(null)
    for (const judge of judges) {
      if (counts(judge.participantId) >= scopeCount) continue
      await assignJudge(judge.participantId)
    }
  }

  const allAssigned =
    judges.length > 0 &&
    scopeCount > 0 &&
    judges.every((j) => counts(j.participantId) >= scopeCount)

  const pendingJudges = judges.filter((j) => counts(j.participantId) < scopeCount)
  const pendingAssignmentCount = pendingJudges.reduce(
    (sum, j) => sum + Math.max(0, scopeCount - counts(j.participantId)),
    0,
  )
  const willOverrideRoomScoping = isAllRooms && rooms.length > 0

  const scopeLabel = isAllRooms ? "project" : `project from ${selectedRoomOption?.name ?? "room"}`
  const scopeLabelPlural = isAllRooms ? "projects" : `projects from ${selectedRoomOption?.name ?? "room"}`

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="size-4" />
          Project assignments
        </CardTitle>
        {judges.length > 0 && scopeCount > 0 && !allAssigned && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={pending.size > 0}
          >
            {pending.size > 0 ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            <span className="hidden sm:inline">Assign every judge</span>
            <span className="sm:hidden">Assign all</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasWeightedScoring && (
          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              Turn on weight-based scoring and add criteria first, then come back here to pick
              who scores what.
            </AlertDescription>
          </Alert>
        )}

        {rooms.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-sm font-medium flex items-center gap-2" htmlFor="assignments-room-filter">
              <MapPin className="size-4 text-muted-foreground" />
              Pick projects from
            </label>
            <Select value={selectedRoom} onValueChange={setSelectedRoom}>
              <SelectTrigger id="assignments-room-filter" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROOMS}>
                  All projects ({totalSubmissionCount})
                </SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name} ({room.submissionCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {scopeCount === 0
            ? isAllRooms
              ? "No projects yet. Once teams submit, you can pick who scores them."
              : `No projects in ${selectedRoomOption?.name ?? "this room"} yet.`
            : `${scopeCount} ${scopeCount === 1 ? scopeLabel : scopeLabelPlural} to judge.`}
        </p>

        {judges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Add judges first, then you can pick who scores which projects.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {judges.map((judge) => {
              const count = counts(judge.participantId)
              const isPending = pending.has(judge.participantId)
              const fullyAssigned = scopeCount > 0 && count >= scopeCount
              return (
                <div
                  key={judge.participantId}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <JudgePill
                      imageUrl={judge.imageUrl}
                      displayName={judge.displayName}
                    />
                    <Badge variant={fullyAssigned ? "secondary" : "outline"}>
                      {count} / {scopeCount} {scopeCount === 1 ? "project" : "projects"}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPickerJudge(judge)}
                      disabled={totalSubmissionCount === 0}
                    >
                      <ListChecks className="mr-2 size-4" />
                      <span className="hidden sm:inline">Pick projects</span>
                      <span className="sm:hidden">Projects</span>
                    </Button>
                    <Button
                      size="sm"
                      variant={fullyAssigned ? "ghost" : "outline"}
                      onClick={() => assignJudge(judge.participantId)}
                      disabled={isPending || scopeCount === 0 || fullyAssigned}
                    >
                      {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {fullyAssigned
                        ? isAllRooms
                          ? "All projects assigned"
                          : "Room assigned"
                        : count === 0
                          ? isAllRooms
                            ? "Assign all projects"
                            : `Assign ${selectedRoomOption?.name ?? "room"}`
                          : "Assign remaining"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>

      {pickerJudge && (
        <PickProjectsDialog
          hackathonId={hackathonId}
          judgeParticipantId={pickerJudge.participantId}
          judgeDisplayName={pickerJudge.displayName}
          open={!!pickerJudge}
          onOpenChange={(next) => {
            if (!next) setPickerJudge(null)
          }}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isAllRooms
                ? "Give every judge all projects?"
                : `Give every judge the ${selectedRoomOption?.name ?? "room"} projects?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`This adds ${pendingAssignmentCount} new ${pendingAssignmentCount === 1 ? "pick" : "picks"} across ${pendingJudges.length} ${pendingJudges.length === 1 ? "judge" : "judges"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {willOverrideRoomScoping && (
            <Alert>
              <Info className="size-4" />
              <AlertDescription>
                Heads up: you have rooms set up. This skips room scoping and gives every
                judge every project. Pick a room above if you want to stay scoped to a room.
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void assignAll()}>
              Yes, assign them
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
