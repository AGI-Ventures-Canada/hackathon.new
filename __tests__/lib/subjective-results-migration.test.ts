import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260830220000_subjective_results_atomic.sql"),
  "utf8",
)

describe("subjective results migration", () => {
  it("replaces only core results and keeps prize rankings", () => {
    expect(migration).toContain(
      "where hackathon_id = p_hackathon_id\n    and prize_id is null\n    and prize_track_id is null\n    and round_id is null;",
    )
  })

  it("keeps the mutation service-role-only", () => {
    expect(migration).toContain(
      "revoke all on function public.replace_subjective_results_atomic(uuid, jsonb)\n  from public, anon, authenticated;",
    )
    expect(migration).toContain(
      "grant execute on function public.replace_subjective_results_atomic(uuid, jsonb)\n  to service_role;",
    )
  })
})
