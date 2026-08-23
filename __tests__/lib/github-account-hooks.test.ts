import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const verifier = resolve(import.meta.dir, "../../.githooks/verify-account")
const tempDirs: string[] = []

function run(command: string[], cwd: string, env: Record<string, string> = {}, stdin?: string) {
  return Bun.spawnSync(command, {
    cwd,
    env: { ...process.env, ...env },
    stdin: stdin ? Buffer.from(stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  })
}

function createRepo(login = "alex-agiventures") {
  const directory = mkdtempSync(join(tmpdir(), "oatmeal-account-policy-"))
  const bin = join(directory, "bin")
  tempDirs.push(directory)
  mkdirSync(bin)
  writeFileSync(join(bin, "gh"), `#!/bin/sh\nprintf '%s\\n' '${login}'\n`)
  chmodSync(join(bin, "gh"), 0o755)
  run(["git", "init", "-q"], directory)
  run(["git", "config", "--local", "user.name", "Alex Ivany"], directory)
  run(["git", "config", "--local", "user.email", "alex@agiventures.ca"], directory)
  run(["git", "remote", "add", "origin", "git@github.com-work:AGI-Ventures-Canada/oatmeal.git"], directory)
  return { directory, env: { PATH: `${bin}:${process.env.PATH}` } }
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("GitHub account hooks", () => {
  test("accepts the required local identity and work account", () => {
    const { directory, env } = createRepo()
    const result = run([verifier, "all"], directory, env)

    expect(result.exitCode).toBe(0)
  })

  test("rejects a personal commit identity", () => {
    const { directory, env } = createRepo()
    run(["git", "config", "--local", "user.email", "alexander.ivany@gmail.com"], directory)
    const result = run([verifier, "commit"], directory, env)

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("repo-local user.email must be alex@agiventures.ca")
  })

  test("rejects an environment override of the author identity", () => {
    const { directory, env } = createRepo()
    const result = run([verifier, "commit"], directory, {
      ...env,
      GIT_AUTHOR_EMAIL: "alexander.ivany@gmail.com",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("effective author must use alex@agiventures.ca")
  })

  test("rejects a personal GitHub CLI login", () => {
    const { directory, env } = createRepo("alexivany")
    const result = run([verifier, "remote"], directory, env)

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("active GitHub login must be alex-agiventures")
  })

  test("rejects the personal SSH host", () => {
    const { directory, env } = createRepo()
    run(["git", "remote", "set-url", "origin", "git@github.com:AGI-Ventures-Canada/oatmeal.git"], directory)
    const result = run([verifier, "remote"], directory, env)

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("origin must have exactly one fetch URL")
  })

  test("rejects an extra personal push URL", () => {
    const { directory, env } = createRepo()
    run(["git", "remote", "set-url", "--add", "--push", "origin", "git@github.com-work:AGI-Ventures-Canada/oatmeal.git"], directory)
    run(["git", "remote", "set-url", "--add", "--push", "origin", "git@github.com:AGI-Ventures-Canada/oatmeal.git"], directory)
    const result = run([verifier, "remote"], directory, env)

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("origin must have exactly one push URL")
  })

  test("rejects the actual personal destination of a direct push", () => {
    const { directory, env } = createRepo()
    const result = run(
      [verifier, "push", "personal", "git@github.com:AGI-Ventures-Canada/oatmeal.git"],
      directory,
      env,
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("actual push target must be git@github.com-work")
  })

  test("rejects pushed commits authored by another account", () => {
    const { directory, env } = createRepo()
    writeFileSync(join(directory, "README.md"), "test\n")
    run(["git", "add", "README.md"], directory)
    run(["git", "commit", "-qm", "test", "--author", "Personal <alexander.ivany@gmail.com>"], directory)
    const sha = run(["git", "rev-parse", "HEAD"], directory).stdout.toString().trim()
    const zero = "0".repeat(40)
    const result = run(
      [verifier, "push"],
      directory,
      env,
      `refs/heads/test ${sha} refs/heads/test ${zero}\n`,
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain(`author uses alexander.ivany@gmail.com`)
  })
})
