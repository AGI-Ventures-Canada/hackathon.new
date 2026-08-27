import { describe, expect, it, mock } from "bun:test"
import {
  clerkDeliveredEmailTemplateSlugs,
  missingProductionEmailEnvironment,
  verifyProductionEmailDelivery,
} from "@/lib/email/production-policy"

const configuredEnvironment = {
  RESEND_API_KEY: "re_test",
  RESEND_FROM_EMAIL: "Oatmeal <hello@example.com>",
  CLERK_SECRET_KEY: "sk_test",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test",
} as NodeJS.ProcessEnv

describe("production email policy", () => {
  it("requires both Resend delivery and Clerk forwarding settings", () => {
    expect(
      missingProductionEmailEnvironment({
        RESEND_API_KEY: "re_test",
        RESEND_FROM_EMAIL: " ",
      } as NodeJS.ProcessEnv),
    ).toEqual([
      "RESEND_FROM_EMAIL",
      "CLERK_SECRET_KEY",
      "CLERK_WEBHOOK_SIGNING_SECRET",
    ])
  })

  it("finds Clerk templates that still bypass Resend", () => {
    expect(
      clerkDeliveredEmailTemplateSlugs([
        { slug: "verification_code", delivered_by_clerk: false },
        { slug: "organization_invitation", delivered_by_clerk: true },
        { slug: "reset_password_code", delivered_by_clerk: true },
      ]),
    ).toEqual(["organization_invitation", "reset_password_code"])
  })

  it("rejects incomplete Clerk template responses", () => {
    expect(() => clerkDeliveredEmailTemplateSlugs([])).toThrow(
      "incomplete email template list",
    )
    expect(() =>
      clerkDeliveredEmailTemplateSlugs([
        { slug: "verification_code" },
      ]),
    ).toThrow("incomplete email template list")
  })

  it("accepts production when every Clerk template is forwarded", async () => {
    const fetcher = mock(() =>
      Promise.resolve(
        Response.json([
          { slug: "verification_code", delivered_by_clerk: false },
          { slug: "organization_invitation", delivered_by_clerk: false },
        ]),
      ),
    )

    await expect(
      verifyProductionEmailDelivery({
        environment: configuredEnvironment,
        fetcher: fetcher as typeof fetch,
      }),
    ).resolves.toEqual({ templateCount: 2 })
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.clerk.com/v1/templates/email?limit=100&offset=0",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test",
        }),
      }),
    )
  })

  it("blocks production when Clerk would deliver an email", async () => {
    const fetcher = mock(() =>
      Promise.resolve(
        Response.json([
          { slug: "organization_invitation", delivered_by_clerk: true },
        ]),
      ),
    )

    await expect(
      verifyProductionEmailDelivery({
        environment: configuredEnvironment,
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow("organization_invitation")
  })

  it("checks every page of Clerk email templates", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      slug: `template_${index}`,
      delivered_by_clerk: false,
    }))
    const fetcher = mock((input: RequestInfo | URL) =>
      Promise.resolve(
        Response.json(
          String(input).includes("offset=0")
            ? firstPage
            : [{ slug: "last_template", delivered_by_clerk: false }],
        ),
      ),
    )

    await expect(
      verifyProductionEmailDelivery({
        environment: configuredEnvironment,
        fetcher: fetcher as typeof fetch,
      }),
    ).resolves.toEqual({ templateCount: 101 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
