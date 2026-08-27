import { PostHog } from "posthog-node"

let _client: PostHog | null = null

function getClient(): PostHog | null {
  if (_client) return _client

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return null

  _client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    flushAt: 10,
    flushInterval: 5000,
  })
  return _client
}

export function trackEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const client = getClient()
  if (!client) return

  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      environment: process.env.VERCEL_ENV || "development",
    },
  })
}

export async function trackEventImmediately(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
  options: { eventId: string; timestamp: string },
): Promise<void> {
  const client = getClient()
  if (!client) return

  await client.captureImmediate({
    distinctId,
    event,
    properties: {
      ...properties,
      environment: process.env.VERCEL_ENV || "development",
    },
    timestamp: new Date(options.timestamp),
    uuid: options.eventId,
  })
}

export function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>
) {
  const client = getClient()
  if (!client) return

  client.identify({ distinctId, properties })
}

export function isCliRequest(request: Request): boolean {
  const ua = request.headers.get("user-agent") || ""
  return ua.startsWith("hackathon-cli/")
}

export function getCliVersion(request: Request): string | null {
  const ua = request.headers.get("user-agent") || ""
  const match = ua.match(/^hackathon-cli\/(.+)$/)
  return match ? match[1] : null
}

export async function shutdownAnalytics() {
  if (!_client) return
  await _client.shutdown()
  _client = null
}
