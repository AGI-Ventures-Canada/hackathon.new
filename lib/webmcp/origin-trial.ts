const MAX_ORIGIN_TRIAL_TOKEN_LENGTH = 4096

export function getWebMcpOriginTrialToken(
  environment?: { WEBMCP_ORIGIN_TRIAL_TOKEN?: string },
): string | null {
  const source = environment ?? {
    WEBMCP_ORIGIN_TRIAL_TOKEN: process.env.WEBMCP_ORIGIN_TRIAL_TOKEN,
  }
  const token = source.WEBMCP_ORIGIN_TRIAL_TOKEN?.trim()
  if (!token || token.length > MAX_ORIGIN_TRIAL_TOKEN_LENGTH) return null
  if (/\s|[<>]/.test(token)) return null
  return token
}
