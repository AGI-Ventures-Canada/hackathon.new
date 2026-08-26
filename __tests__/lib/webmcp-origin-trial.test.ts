import { describe, expect, it } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { WebMcpOriginTrialMeta } from "@/components/webmcp-origin-trial-meta"
import { getWebMcpOriginTrialToken } from "@/lib/webmcp/origin-trial"

describe("getWebMcpOriginTrialToken", () => {
  it("returns a configured token", () => {
    expect(
      getWebMcpOriginTrialToken({
        WEBMCP_ORIGIN_TRIAL_TOKEN: "  signed-token  ",
      }),
    ).toBe("signed-token")
  })

  it("omits missing or malformed values", () => {
    expect(getWebMcpOriginTrialToken({})).toBeNull()
    expect(
      getWebMcpOriginTrialToken({
        WEBMCP_ORIGIN_TRIAL_TOKEN: "bad token",
      }),
    ).toBeNull()
    expect(
      getWebMcpOriginTrialToken({
        WEBMCP_ORIGIN_TRIAL_TOKEN: "<meta>",
      }),
    ).toBeNull()
  })
})

describe("WebMcpOriginTrialMeta", () => {
  it("renders the server token before client tools load", () => {
    expect(
      renderToStaticMarkup(
        createElement(WebMcpOriginTrialMeta, { token: "preview-token" }),
      ),
    ).toBe('<meta http-equiv="origin-trial" content="preview-token"/>')
  })

  it("renders nothing when the deployment is not enrolled", () => {
    expect(
      renderToStaticMarkup(createElement(WebMcpOriginTrialMeta, { token: null })),
    ).toBe("")
  })
})
