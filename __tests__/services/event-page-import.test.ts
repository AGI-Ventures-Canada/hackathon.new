import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockFetch = mock(() =>
  Promise.resolve(new Response("", { status: 200 }))
)

globalThis.fetch = mockFetch as typeof fetch

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
      startsAt: "2026-06-08T09:00:00",
      endsAt: "2026-06-08T20:00:00",
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
      startsAt: "2026-06-08T09:00:00",
      endsAt: "2026-06-08T20:00:00",
      locationType: "in_person",
      locationName: "Ottawa, ON",
      locationUrl: null,
      imageUrl: "https://example.com/banner.png",
      language: null,
      translationLinks: [],    })
  })
})
