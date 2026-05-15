import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { HackathonJudgeDisplay } from "@/lib/db/hackathon-types"
import { JudgeCard } from "@/components/hackathon/judge-card"

const baseJudge: HackathonJudgeDisplay = {
  id: "judge-1",
  hackathon_id: "hackathon-1",
  name: "ada.lovelace@example.com",
  title: "Technical Judge With A Very Long Title",
  organization: "Long Organization Name That Should Wrap Inside The Card",
  headshot_url: null,
  clerk_user_id: null,
  participant_id: null,
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

afterEach(() => {
  cleanup()
})

describe("JudgeCard", () => {
  it("shows a readable name instead of an email address", () => {
    render(<JudgeCard judge={baseJudge} />)

    expect(screen.getByText("Ada Lovelace")).toBeDefined()
    expect(screen.queryByText("ada.lovelace@example.com")).toBeNull()
  })

  it("lets long judge text wrap inside the card", () => {
    render(<JudgeCard judge={baseJudge} />)

    expect(screen.getByText("Ada Lovelace").className).toContain("break-words")
    expect(screen.getByText(baseJudge.organization!).className).toContain("break-words")
  })
})
