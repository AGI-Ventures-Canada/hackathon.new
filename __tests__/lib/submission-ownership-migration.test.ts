import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260827234000_atomic_judging_and_team_mutations.sql"
  ),
  "utf8"
)

describe("submission ownership migration", () => {
  it("keeps one owner project and preserves duplicate ownership metadata", () => {
    expect(migration).toContain("ranked.owner_rank > 1")
    expect(migration).toContain("duplicate_team_project")
    expect(migration).toContain("duplicate_solo_project")
    expect(migration).toContain("previous_team_id")
    expect(migration).toContain("previous_participant_id")
  })

  it("prefers projects with judging or result activity", () => {
    expect(migration).toContain("public.judge_assignments")
    expect(migration).toContain("public.judge_picks")
    expect(migration).toContain("public.prize_assignments")
    expect(migration).toContain("public.hackathon_results")
    expect(migration).toContain("public.crowd_votes")
    expect(migration).toContain("public.round_submissions")
  })
})
