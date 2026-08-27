import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260827130000_lock_down_team_invitation_rpc.sql"
  ),
  "utf8"
)

describe("privileged RPC grants", () => {
  it("keeps team invitation acceptance behind the server service role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM PUBLIC"
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) TO service_role"
    )
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.accept_team_invitation(TEXT, TEXT)"
    )
  })

  it("keeps bulk room assignment behind the server service role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.bulk_assign_teams(UUID, JSONB) FROM PUBLIC"
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.bulk_assign_teams(UUID, JSONB) TO service_role"
    )
  })
})
