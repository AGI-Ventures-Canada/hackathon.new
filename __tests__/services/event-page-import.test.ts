import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockFetch = mock(() =>
  Promise.resolve(new Response("", { status: 200 }))
)

globalThis.fetch = mockFetch as unknown as typeof fetch

const { extractEventPageData } = await import("@/lib/services/event-page-import")

describe("extractEventPageData", () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  it("extracts event data from Eventbrite JSON-LD", async () => {
    mockFetch.mockResolvedValueOnce(new Response(`<!DOCTYPE html>
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Event",
              "name": "DevOps for GenAI Hackathon - Ottawa 2026",
              "description": "Get ready to team up and hack the future of DevOps with AI-powered tools.",
              "url": "https://www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158",
              "image": "https://img.evbuc.com/test.png",
              "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
              "startDate": "2026-06-08T09:00:00-04:00",
              "endDate": "2026-06-08T20:00:00-04:00",
              "location": {
                "@type": "Place",
                "name": "Invest Ottawa",
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": "7 Bayview Station Road",
                  "addressLocality": "Ottawa",
                  "addressRegion": "ON"
                }
              }
            }
          </script>
        </head>
      </html>`, { status: 200 }))

    const result = await extractEventPageData(
      "https://www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158"
    )

    expect(result).toEqual({
      name: "DevOps for GenAI Hackathon - Ottawa 2026",
      description: "Get ready to team up and hack the future of DevOps with AI-powered tools.",
      startsAt: "2026-06-08T09:00:00-04:00",
      endsAt: "2026-06-08T20:00:00-04:00",
      locationType: "in_person",
      locationName: "Invest Ottawa (7 Bayview Station Road, Ottawa, ON)",
      locationUrl: null,
      imageUrl: "https://img.evbuc.com/test.png",
      language: null,
      translationLinks: [],    })
  })

  it("falls back to event metadata when JSON-LD is missing", async () => {
    mockFetch.mockResolvedValueOnce(new Response(`<!DOCTYPE html>
      <html>
        <head>
          <title>Fallback Event Title</title>
          <meta name="description" content="Fallback description" />
          <meta property="event:start_time" content="2026-06-08T09:00:00-04:00" />
          <meta property="event:end_time" content="2026-06-08T20:00:00-04:00" />
          <meta name="twitter:data1" content="Ottawa, ON" />
          <meta property="og:image" content="https://example.com/banner.png" />
        </head>
      </html>`, { status: 200 }))

    const result = await extractEventPageData("https://example.com/events/test")

    expect(result).toEqual({
      name: "Fallback Event Title",
      description: "Fallback description",
      startsAt: "2026-06-08T09:00:00-04:00",
      endsAt: "2026-06-08T20:00:00-04:00",
      locationType: "in_person",
      locationName: "Ottawa, ON",
      locationUrl: null,
      imageUrl: "https://example.com/banner.png",
      language: null,
      translationLinks: [],    })
  })

  it("blocks redirects to private services", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    }))

    expect(await extractEventPageData("https://example.com/unsafe-redirect")).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("rejects oversized event pages", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", {
      status: 200,
      headers: { "content-length": String(2 * 1024 * 1024 + 1) },
    }))

    expect(await extractEventPageData("https://example.com/oversized-event")).toBeNull()
  })

  it("redacts event URL secrets from fetch errors", async () => {
    const url = "https://example.com/events/log-test?token=event-secret#private"
    mockFetch.mockRejectedValueOnce(new Error(`Network failure for ${url}`))
    const originalConsoleError = console.error
    const consoleError = mock(() => {})
    console.error = consoleError

    try {
      expect(await extractEventPageData(url)).toBeNull()
    } finally {
      console.error = originalConsoleError
    }

    const output = JSON.stringify(consoleError.mock.calls)
    expect(output).toContain("https://example.com/[redacted]")
    expect(output).not.toContain("log-test")
    expect(output).not.toContain("event-secret")
    expect(output).not.toContain("#private")
  })
})
