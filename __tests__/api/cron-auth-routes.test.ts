import { afterEach, describe, expect, it } from "bun:test"
import { isAuthorizedCronRequest } from "@/lib/auth/cron"
import { GET as getTransitions } from "@/app/api/cron/transitions/route"
import { GET as getPurgeExports } from "@/app/api/cron/purge-exports/route"
import { GET as getReminders } from "@/app/api/cron/reminders/route"

const originalCronSecret = process.env.CRON_SECRET

afterEach(() => {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = originalCronSecret
  }
})

describe("cron authorization", () => {
  it("rejects Bearer undefined when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET
    const request = new Request("https://example.com/api/cron", {
      headers: { authorization: "Bearer undefined" },
    })

    expect(isAuthorizedCronRequest(request)).toBe(false)
    expect((await getTransitions(request)).status).toBe(401)
    expect((await getPurgeExports(request)).status).toBe(401)
    expect((await getReminders(request)).status).toBe(401)
  })

  it("requires an exact configured bearer token", () => {
    process.env.CRON_SECRET = "cron-secret"

    expect(isAuthorizedCronRequest(new Request("https://example.com", {
      headers: { authorization: "Bearer wrong" },
    }))).toBe(false)
    expect(isAuthorizedCronRequest(new Request("https://example.com", {
      headers: { authorization: "Bearer cron-secret" },
    }))).toBe(true)
  })
})
