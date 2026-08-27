const MAX_ORIGIN_TRIAL_TOKEN_LENGTH = 4096
const RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000

type OriginTrialEnvironment = {
  WEBMCP_ORIGIN_TRIAL_TOKEN?: string
}

type OriginTrialPayload = {
  origin: string
  feature: string
  expiry: number
}

export type WebMcpOriginTrialRegistration = {
  token: string
  origin: string
  hostname: string
  expiry: number
  renewalDue: boolean
}

export type WebMcpOriginTrialHeaderRule = {
  source: string
  has: Array<{ type: "host"; value: string }>
  headers: Array<{ key: "Origin-Trial"; value: string }>
}

function readToken(environment?: OriginTrialEnvironment): string | null {
  const source = environment ?? {
    WEBMCP_ORIGIN_TRIAL_TOKEN: process.env.WEBMCP_ORIGIN_TRIAL_TOKEN,
  }
  const token = source.WEBMCP_ORIGIN_TRIAL_TOKEN?.trim()
  if (!token || token.length > MAX_ORIGIN_TRIAL_TOKEN_LENGTH) return null
  if (/\s|[<>]/.test(token)) return null
  return token
}

export function getWebMcpOriginTrialToken(
  environment?: OriginTrialEnvironment,
): string | null {
  return readToken(environment)
}

export function hasWebMcpOriginTrialConfiguration(
  environment?: OriginTrialEnvironment,
): boolean {
  const source = environment ?? {
    WEBMCP_ORIGIN_TRIAL_TOKEN: process.env.WEBMCP_ORIGIN_TRIAL_TOKEN,
  }
  return Boolean(source.WEBMCP_ORIGIN_TRIAL_TOKEN?.trim())
}

export function getWebMcpOriginTrialRegistration(
  environment?: OriginTrialEnvironment,
  now = Date.now(),
): WebMcpOriginTrialRegistration | null {
  const token = readToken(environment)
  if (!token) return null

  try {
    const decoded = Buffer.from(token, "base64").toString("utf8")
    const payloadStart = decoded.indexOf('{"origin"')
    if (payloadStart < 0) return null
    const payload = JSON.parse(decoded.slice(payloadStart)) as OriginTrialPayload
    if (
      payload.feature !== "WebMCP" ||
      typeof payload.origin !== "string" ||
      typeof payload.expiry !== "number" ||
      !Number.isSafeInteger(payload.expiry)
    ) return null

    const origin = new URL(payload.origin)
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.port ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      payload.expiry * 1_000 <= now
    ) return null

    return {
      token,
      origin: payload.origin,
      hostname: origin.hostname,
      expiry: payload.expiry,
      renewalDue: payload.expiry * 1_000 <= now + RENEWAL_WINDOW_MS,
    }
  } catch {
    return null
  }
}

export function createWebMcpOriginTrialHeaderRule(
  registration: WebMcpOriginTrialRegistration,
): WebMcpOriginTrialHeaderRule {
  const exactHostname = registration.hostname.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  )
  return {
    source: "/:path*",
    has: [{ type: "host", value: `^${exactHostname}$` }],
    headers: [{ key: "Origin-Trial", value: registration.token }],
  }
}
