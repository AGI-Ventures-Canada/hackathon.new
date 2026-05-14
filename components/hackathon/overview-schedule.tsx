"use client"

import { useCallback } from "react"
import { ScheduleEditor, type ScheduleEditorProps, type ScheduleItemData } from "./schedule-editor"
import { useActionItemsOptional } from "./manage/action-items-context"

type Props = ScheduleEditorProps

export function OverviewSchedule(props: Props) {
  const ctx = useActionItemsOptional()

  const onEditTriggerItem: ScheduleEditorProps["onEditTriggerItem"] = useCallback((item: ScheduleItemData) => {
    if (!ctx) return
    if (item.trigger_type === "submission_deadline") {
      ctx.handleActionClick({ id: "check-submission-deadline", label: "", severity: "info", action: "open-submission-deadline-dialog", close: { kind: "manual" } })
    }
  }, [ctx])

  const onAddChallenge = useCallback(() => {
    ctx?.handleActionClick({ id: "create-challenge", label: "", severity: "info", action: "open-challenge-dialog", close: { kind: "auto", isComplete: false } })
  }, [ctx])

  return (
    <div className="rounded-lg border p-4">
      <ScheduleEditor
        {...props}
        challengeExists={ctx?.challengeExists ?? props.challengeExists}
        onEditTriggerItem={ctx ? onEditTriggerItem : undefined}
        onAddChallenge={ctx ? onAddChallenge : undefined}
      />
    </div>
  )
}
