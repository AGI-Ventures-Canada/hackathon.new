import { describe, it, expect } from "bun:test"
import {
  formatJudgeLabel,
  formatJudgeNotes,
  formatMembers,
  formatScores,
} from "@/lib/workflows/export-submissions/format"
import type {
  ExportSubmissionRow,
  ExportUserDirectory,
} from "@/lib/services/submission-exports"

const baseSubmission: ExportSubmissionRow = {
  id: "s1",
  title: "Proj",
  description: null,
  status: "submitted",
  githubUrl: null,
  liveAppUrl: null,
  demoVideoUrl: null,
  screenshotUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
  team: {
    id: "t1",
    name: "Team",
    members: [
      { clerkUserId: "u_named", role: "participant" },
      { clerkUserId: "u_clerk_default", role: "captain" },
      { clerkUserId: "u_no_name", role: "participant" },
      { clerkUserId: "u_missing", role: "participant" },
    ],
  },
  result: null,
  prizes: [],
  scores: [
    { judgeClerkUserId: "judge_named", criteriaName: "Polish", score: 5 },
    { judgeClerkUserId: "judge_clerk_default", criteriaName: "Polish", score: 4 },
    { judgeClerkUserId: "judge_no_name", criteriaName: "Polish", score: 3 },
    { judgeClerkUserId: null, criteriaName: "Polish", score: 2 },
  ],
  judgeNotes: [
    { judgeClerkUserId: "judge_named", notes: "great" },
    { judgeClerkUserId: "judge_clerk_default", notes: "needs work" },
    { judgeClerkUserId: null, notes: "anon" },
  ],
  socialSubmissions: [],
}

const users: ExportUserDirectory = {
  u_named: { name: "Ada Lovelace", email: "ada@example.com" },
  u_clerk_default: { name: null, email: "grace.hopper@example.com" },
  u_no_name: { name: null, email: "katherine.johnson@example.com" },
  judge_named: { name: "Alan Turing", email: "alan@example.com" },
  judge_clerk_default: { name: null, email: "claude.shannon@example.com" },
  judge_no_name: { name: null, email: "linus@example.com" },
}

describe("formatMembers", () => {
  it("renders Clerk name with email when a real name is set", () => {
    const out = formatMembers(baseSubmission, users)
    expect(out).toContain("Ada Lovelace <ada@example.com>")
  })

  it("shows only the email when the name was normalized away upstream (e.g. Clerk's user_ default)", () => {
    const out = formatMembers(baseSubmission, users)
    expect(out).toContain("grace.hopper@example.com (captain)")
  })

  it("shows only the email when Clerk has no name", () => {
    const out = formatMembers(baseSubmission, users)
    expect(out).toContain("katherine.johnson@example.com")
    expect(out).not.toContain("<katherine.johnson@example.com>")
  })

  it("falls back to 'Unknown member' when the user is missing entirely", () => {
    const out = formatMembers(baseSubmission, users)
    expect(out).toContain("Unknown member")
    expect(out).not.toContain("u_missing")
  })
})

describe("formatJudgeLabel", () => {
  it("includes both name and email when a real name is set", () => {
    expect(formatJudgeLabel("judge_named", users)).toBe(
      "Alan Turing <alan@example.com>"
    )
  })

  it("shows only the email when the name was normalized away upstream", () => {
    expect(formatJudgeLabel("judge_clerk_default", users)).toBe(
      "claude.shannon@example.com"
    )
  })

  it("shows only the email when Clerk has no name", () => {
    expect(formatJudgeLabel("judge_no_name", users)).toBe("linus@example.com")
  })

  it("falls back to 'Unknown judge' for missing users and null ids", () => {
    expect(formatJudgeLabel(null, users)).toBe("Unknown judge")
    expect(formatJudgeLabel("judge_missing", users)).toBe("Unknown judge")
  })
})

describe("formatScores", () => {
  it("annotates every score with the judge's name or email", () => {
    const out = formatScores(baseSubmission, users)
    expect(out).toContain("Alan Turing <alan@example.com> — Polish: 5")
    expect(out).toContain("claude.shannon@example.com — Polish: 4")
    expect(out).toContain("linus@example.com — Polish: 3")
    expect(out).toContain("Unknown judge — Polish: 2")
  })
})

describe("formatJudgeNotes", () => {
  it("prefixes every note with the judge's name or email", () => {
    const out = formatJudgeNotes(baseSubmission, users)
    expect(out).toContain("[Alan Turing <alan@example.com>] great")
    expect(out).toContain("[claude.shannon@example.com] needs work")
    expect(out).toContain("[Unknown judge] anon")
  })
})
