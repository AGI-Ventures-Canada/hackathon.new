"use client"

import { useCallback } from "react"
import { ScheduleEditor, type ScheduleEditorProps, type ScheduleItemData } from "./schedule-editor"
import { useActionItemsOptional } from "./manage/action-items-context"

type Props = ScheduleEditorProps

export function OverviewSchedule(props: Props) {
  const ctx = useActionItemsOptional()

  const onEditTriggerItem: ScheduleEditorProps["onEditTriggerItem"] = useCallback((item: ScheduleItemData) => {
    if (!ctx) return
    if (item.trigger_type === "challenge_release") {
      ctx.handleActionClick({ id: "create-challenge", label: "", severity: "info", action: "open-challenge-dialog" })
    } else if (item.trigger_type === "submission_deadline") {
      ctx.handleActionClick({ id: "check-submission-deadline", label: "", severity: "info", action: "open-submission-deadline-dialog" })
    }
  }, [ctx])

  const onAddChallenge = useCallback(() => {
    ctx?.handleActionClick({ id: "create-challenge", label: "", severity: "info", action: "open-challenge-dialog" })
  }, [ctx])

  return (
    <div className="rounded-lg border p-4">
      <ScheduleEditor
        {...props}
        onEditTriggerItem={ctx ? onEditTriggerItem : undefined}
        onAddChallenge={ctx ? onAddChallenge : undefined}
      />
    </div>
  )
}
