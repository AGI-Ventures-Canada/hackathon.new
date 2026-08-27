import posthog from "posthog-js"

const SENSITIVE_PATHS = [
  /^\/cli-auth\/?$/,
  /^\/prizes\/claim\/[^/]+/,
  /^\/invite\/[^/]+/,
  /^\/judge-invite\/[^/]+/,
]

export function sanitizeAnalyticsUrl(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    const url = new URL(value, window.location.origin)
    url.search = ""
    url.hash = ""
    if (SENSITIVE_PATHS.some((pattern) => pattern.test(url.pathname))) {
      url.pathname = url.pathname.startsWith("/prizes/claim/")
        ? "/prizes/claim/[redacted]"
        : url.pathname.startsWith("/judge-invite/")
          ? "/judge-invite/[redacted]"
          : url.pathname.startsWith("/invite/")
            ? "/invite/[redacted]"
            : "/cli-auth"
    }
    return url.toString()
  } catch {
    return "[redacted-url]"
  }
}

if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    before_send: (event) => {
      if (!event) return null
      for (const key of ["$current_url", "$referrer", "$initial_referrer"]) {
        if (key in event.properties) event.properties[key] = sanitizeAnalyticsUrl(event.properties[key])
      }
      return event
    },
  })
}
