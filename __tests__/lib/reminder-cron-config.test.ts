import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

type VercelConfig = {
  crons?: Array<{ path: string; schedule: string }>
}

describe("reminder cron config", () => {
  it("checks due reminders every minute", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as VercelConfig

    expect(config.crons?.find((cron) => cron.path === "/api/cron/reminders"))
      .toEqual({ path: "/api/cron/reminders", schedule: "* * * * *" })
  })
})
