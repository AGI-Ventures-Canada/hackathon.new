"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { JudgeProjectAssignments } from "./manual-judging-assignments"

interface PickProjectsDialogProps {
  hackathonId: string
  judgeParticipantId: string
  judgeDisplayName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PickProjectsDialog({ hackathonId, judgeParticipantId, judgeDisplayName, open, onOpenChange }: PickProjectsDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Pick projects for {judgeDisplayName}</DialogTitle>
        <DialogDescription>Choose projects for this judge&apos;s number scorecard.</DialogDescription>
      </DialogHeader>
      {open && <JudgeProjectAssignments key={`${hackathonId}:${judgeParticipantId}`} hackathonId={hackathonId} judgeParticipantId={judgeParticipantId} />}
      <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button></div>
    </DialogContent>
  </Dialog>
}
