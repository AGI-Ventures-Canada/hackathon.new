import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"

type MockContext = {
  hackathonStatus: HackathonStatus
  hackathonPhase: HackathonPhase | null
  triggerTransition: (s: string) => void
}

let mockContext: MockContext = {
  hackathonStatus: "published",
  hackathonPhase: null,
  triggerTransition: () => {},
}

mock.module("@/components/hackathon/manage/action-items-context", () => ({
  useActionItems: () => mockContext,
}))

const { StatusBadgeMenu } = await import(
  "@/components/hackathon/manage/status-badge-menu"
)

afterEach(() => {
  cleanup()
})

describe("StatusBadgeMenu", () => {
  it("renders 'Live' when context status is active", () => {
    mockContext = {
      hackathonStatus: "active",
      hackathonPhase: null,
      triggerTransition: () => {},
    }
    render(<StatusBadgeMenu />)
    expect(screen.getByText("Live")).toBeDefined()
  })

  it("renders 'Published' when context status is published", () => {
    mockContext = {
      hackathonStatus: "published",
      hackathonPhase: null,
      triggerTransition: () => {},
    }
    render(<StatusBadgeMenu />)
    expect(screen.getByText("Published")).toBeDefined()
  })

  it("renders 'Completed' when context status is completed", () => {
    mockContext = {
      hackathonStatus: "completed",
      hackathonPhase: null,
      triggerTransition: () => {},
    }
    render(<StatusBadgeMenu />)
    expect(screen.getByText("Completed")).toBeDefined()
  })

  it("renders 'Draft' when context status is draft", () => {
    mockContext = {
      hackathonStatus: "draft",
      hackathonPhase: null,
      triggerTransition: () => {},
    }
    render(<StatusBadgeMenu />)
    expect(screen.getByText("Draft")).toBeDefined()
  })

  it("renders 'Judging' when context status is judging", () => {
    mockContext = {
      hackathonStatus: "judging",
      hackathonPhase: null,
      triggerTransition: () => {},
    }
    render(<StatusBadgeMenu />)
    expect(screen.getByText("Judging")).toBeDefined()
  })

  it("includes phase suffix when a phase is set", () => {
    mockContext = {
      hackathonStatus: "active",
      hackathonPhase: "submission_open",
      triggerTransition: () => {},
    }
    render(<StatusBadgeMenu />)
    expect(screen.getByText("Live · Submissions Open")).toBeDefined()
  })
})
