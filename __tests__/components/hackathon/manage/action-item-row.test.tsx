import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ActionItem } from "@/lib/utils/organizer-actions"

const handleActionClick = mock(() => {})
const removeCustomItem = mock(() => {})
const toggleComplete = mock(() => {})

mock.module("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}))

mock.module("@/components/hackathon/manage/action-items-context", () => ({
  buildActionHref: (_slug: string, item: ActionItem) => item.tab ? "/event-target" : null,
  useActionItems: () => ({
    slug: "build-day",
    handleActionClick,
    removeCustomItem,
    toggleComplete,
    dismissItem: mock(() => {}),
  }),
}))

const { ActionItemRow } = await import(
  "@/components/hackathon/manage/action-item-row"
)

afterEach(() => {
  cleanup()
  handleActionClick.mockClear()
  removeCustomItem.mockClear()
  toggleComplete.mockClear()
})

describe("ActionItemRow", () => {
  it("keeps mobile help separate from the task action", () => {
    render(
      <ActionItemRow
        item={{
          id: "review-schedule",
          label: "Review the schedule",
          tooltip: "Check every time and room.",
          severity: "warning",
          tab: "overview",
          action: "open-agenda-dialog",
          close: { kind: "manual" },
        }}
        completed={false}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "More information: Review the schedule",
      }),
    )
    expect(handleActionClick).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("link", { name: /Review the schedule/ }))
    expect(handleActionClick).toHaveBeenCalledTimes(1)
  })

  it("lets organizers remove a completed custom task", () => {
    render(
      <ActionItemRow
        item={{
          id: "custom-call-venue",
          label: "Call the venue",
          severity: "info",
          close: { kind: "manual" },
        }}
        completed
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove custom item: Call the venue",
      }),
    )
    expect(removeCustomItem).toHaveBeenCalledWith("custom-call-venue")
  })

  it("labels an automatically managed disabled checkbox", () => {
    render(
      <ActionItemRow
        item={{
          id: "add-judge",
          label: "Add a judge",
          severity: "urgent",
          close: { kind: "auto", isComplete: false },
        }}
        completed={false}
      />,
    )

    const checkbox = screen.getByRole("checkbox", {
      name: "Status is updated automatically: Add a judge",
    })
    expect(checkbox.hasAttribute("disabled")).toBe(true)
  })
})
