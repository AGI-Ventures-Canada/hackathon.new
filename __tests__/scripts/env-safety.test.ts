import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const tempDirs: string[] = []

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function checkEnv(contents: string): number {
  const directory = mkdtempSync(join(tmpdir(), "oatmeal-env-safety-"))
  tempDirs.push(directory)
  const envFile = join(directory, ".env.local")
  writeFileSync(envFile, contents)

  return spawnSync(
    "bash",
    [
      "-c",
      'source scripts/lib/env-safety.sh; contains_remote_supabase_credentials "$1"',
      "bash",
      envFile,
    ],
    { cwd: process.cwd() }
  ).status ?? 1
}

describe("contains_remote_supabase_credentials", () => {
  it("rejects hosted public and server Supabase URLs", () => {
    expect(checkEnv("NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co\n")).toBe(0)
    expect(checkEnv('SUPABASE_URL="https://project.supabase.co"\n')).toBe(0)
  })

  it("allows local Supabase URLs and unrelated values", () => {
    expect(checkEnv("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54422\n")).toBe(1)
    expect(checkEnv("CLERK_SECRET_KEY=development-placeholder\n")).toBe(1)
  })
})
