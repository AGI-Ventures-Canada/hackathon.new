import { describe, expect, it } from "bun:test"
import {
  createWebMcpOriginTrialHeaderRule,
  getWebMcpOriginTrialRegistration,
  getWebMcpOriginTrialToken,
  hasWebMcpOriginTrialConfiguration,
} from "@/lib/webmcp/origin-trial"

const NOW = Date.parse("2026-08-26T16:00:00.000Z")

function makeToken(
  payload: Partial<{ origin: string; feature: string; expiry: number }> = {},
): string {
  return Buffer.from(`signed-prefix${JSON.stringify({
    origin: "https://preview.example:443",
    feature: "WebMCP",
    expiry: Math.floor((NOW + 60 * 24 * 60 * 60 * 1_000) / 1_000),
    ...payload,
  })}`).toString("base64")
}

describe("WebMCP origin trial", () => {
  it("normalizes and bounds the configured token", () => {
    expect(
      getWebMcpOriginTrialToken({
        WEBMCP_ORIGIN_TRIAL_TOKEN: "  signed-token  ",
      }),
    ).toBe("signed-token")
    expect(getWebMcpOriginTrialToken({})).toBeNull()
    expect(getWebMcpOriginTrialToken({ WEBMCP_ORIGIN_TRIAL_TOKEN: "bad token" }))
      .toBeNull()
    expect(getWebMcpOriginTrialToken({ WEBMCP_ORIGIN_TRIAL_TOKEN: "<meta>" }))
      .toBeNull()
    expect(hasWebMcpOriginTrialConfiguration({
      WEBMCP_ORIGIN_TRIAL_TOKEN: "bad token",
    })).toBe(true)
    expect(hasWebMcpOriginTrialConfiguration({
      WEBMCP_ORIGIN_TRIAL_TOKEN: "   ",
    })).toBe(false)
  })

  it("decodes the exact WebMCP origin and expiry", () => {
    const token = makeToken()
    expect(getWebMcpOriginTrialRegistration(
      { WEBMCP_ORIGIN_TRIAL_TOKEN: token },
      NOW,
    )).toEqual({
      token,
      origin: "https://preview.example:443",
      hostname: "preview.example",
      expiry: Math.floor((NOW + 60 * 24 * 60 * 60 * 1_000) / 1_000),
      renewalDue: false,
    })
  })

  it("rejects expired, wrong-feature, non-HTTPS, and non-default-port tokens", () => {
    for (const token of [
      makeToken({ expiry: Math.floor((NOW - 1) / 1_000) }),
      makeToken({ feature: "OtherFeature" }),
      makeToken({ origin: "http://preview.example:80" }),
      makeToken({ origin: "https://preview.example:444" }),
    ]) {
      expect(getWebMcpOriginTrialRegistration(
        { WEBMCP_ORIGIN_TRIAL_TOKEN: token },
        NOW,
      )).toBeNull()
    }
  })

  it("fails closed when a signed payload cannot be parsed", () => {
    const malformedToken = Buffer.from('signed-prefix{"origin"').toString("base64")

    expect(getWebMcpOriginTrialRegistration(
      { WEBMCP_ORIGIN_TRIAL_TOKEN: malformedToken },
      NOW,
    )).toBeNull()
  })

  it("requires renewal 30 days before expiry", () => {
    const token = makeToken({
      expiry: Math.floor((NOW + 29 * 24 * 60 * 60 * 1_000) / 1_000),
    })
    expect(getWebMcpOriginTrialRegistration(
      { WEBMCP_ORIGIN_TRIAL_TOKEN: token },
      NOW,
    )?.renewalDue).toBe(true)
  })

  it("builds a response-header rule for only the token's exact host", () => {
    const registration = getWebMcpOriginTrialRegistration(
      { WEBMCP_ORIGIN_TRIAL_TOKEN: makeToken() },
      NOW,
    )
    expect(registration).not.toBeNull()
    expect(createWebMcpOriginTrialHeaderRule(registration!)).toEqual({
      source: "/:path*",
      has: [{ type: "host", value: "^preview\\.example$" }],
      headers: [{ key: "Origin-Trial", value: registration?.token }],
    })
    const matcher = new RegExp(
      createWebMcpOriginTrialHeaderRule(registration!).has[0].value,
    )
    expect(matcher.test("preview.example")).toBe(true)
    expect(matcher.test("previewXexample")).toBe(false)
    expect(matcher.test("www.preview.example")).toBe(false)
  })
})
