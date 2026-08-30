import { describe, expect, it } from "bun:test"
import {
  organizerSectionForActionItem,
  organizerTaskInspectUrl,
  toOrganizerTask,
} from "@/lib/utils/organizer-action-board"
import type { ActionItem } from "@/lib/utils/organizer-actions"

function item(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: "task-1",
    label: "Review the work",
    severity: "warning",
    close: { kind: "manual" },
    ...overrides,
  }
}

describe("organizer action board", () => {
  it("maps judging tasks to their exact place", () => {
    const assignment = item({
      tab: "judging",
      subtab: "assignments",
      subtabKey: "jtab",
    })
    const results = item({
      tab: "judging",
      subtab: "results",
      subtabKey: "jtab",
    })

    expect(organizerSectionForActionItem(assignment)).toBe("assignments")
    expect(organizerTaskInspectUrl("build-day", assignment)).toBe(
      "/e/build-day/manage?tab=judging&jtab=assignments",
    )
    expect(organizerSectionForActionItem(results)).toBe("results")
  })

  it("maps post-event and email tasks without losing their subtab", () => {
    expect(organizerSectionForActionItem(item({
      tab: "post-event",
      subtab: "feedback",
      subtabKey: "ptab",
    }))).toBe("feedback")
    expect(organizerSectionForActionItem(item({
      tab: "event",
      subtab: "email",
      subtabKey: "etab",
    }))).toBe("email")
  })

  it("returns one stable task receipt for every surface", () => {
    const task = toOrganizerTask(
      "build-day",
      item({
        id: "unassigned-submissions",
        tab: "judging",
        subtab: "assignments",
        subtabKey: "jtab",
        severity: "urgent",
        close: { kind: "auto", isComplete: false },
      }),
      "pending",
    )

    expect(task.taskRef).toBe("unassigned-submissions")
    expect(task.destination).toBe("assignments")
    expect(task.inspectUrl).toBe("/e/build-day/manage?tab=judging&jtab=assignments")
    expect(task.blocksProgress).toBe(true)
  })

  it("does not mark completed tasks as blockers", () => {
    const task = toOrganizerTask(
      "build-day",
      item({ severity: "urgent" }),
      "completed",
      { custom: true, updatedAt: "2026-08-30T12:00:00.000Z" },
    )

    expect(task.custom).toBe(true)
    expect(task.blocksProgress).toBe(false)
    expect(task.updatedAt).toBe("2026-08-30T12:00:00.000Z")
  })
})
