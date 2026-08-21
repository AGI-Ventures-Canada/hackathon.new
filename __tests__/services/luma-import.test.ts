import { describe, it, expect, beforeEach, mock } from "bun:test"

const mockFetch = mock(() => Promise.resolve(new Response("")))
globalThis.fetch = mockFetch as unknown as typeof fetch

const { extractLumaEventData, normalizeEventDate, parseTranslationLinksFromHtml } = await import(
  "@/lib/services/luma-import"
)

const MOCK_HTML_WITH_JSONLD = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Test Hackathon",
  "description": "A test event description",
  "startDate": "2026-03-15T09:00:00.000-08:00",
  "endDate": "2026-03-16T17:00:00.000-08:00",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "image": ["https://images.lumacdn.com/test-image.png"],
  "location": {
    "@type": "Place",
    "name": "San Francisco, California",
    "geo": { "@type": "GeoCoordinates", "latitude": 37.79, "longitude": -122.4 }
  }
}
</script>
</head><body></body></html>
`

describe("normalizeEventDate", () => {
  it("drops milliseconds but preserves negative timezone offset", () => {
    expect(normalizeEventDate("2026-03-15T09:00:00.000-08:00")).toBe("2026-03-15T09:00:00-08:00")
  })

  it("drops milliseconds but preserves positive timezone offset", () => {
    expect(normalizeEventDate("2022-06-27T18:30:00.000+04:00")).toBe("2022-06-27T18:30:00+04:00")
  })

  it("preserves the Z suffix on a UTC string", () => {
    expect(normalizeEventDate("2026-01-01T00:00:00.000Z")).toBe("2026-01-01T00:00:00Z")
  })

  it("returns null for null input", () => {
    expect(normalizeEventDate(null)).toBeNull()
  })

  it("returns original string if it doesn't match ISO format", () => {
    expect(normalizeEventDate("not-a-date")).toBe("not-a-date")
  })

  it("handles string without milliseconds", () => {
    expect(normalizeEventDate("2026-07-04T14:30:00-05:00")).toBe("2026-07-04T14:30:00-05:00")
  })

  it("returns offsetless when the source has no offset", () => {
    expect(normalizeEventDate("2026-03-15T09:00:00")).toBe("2026-03-15T09:00:00")
  })

  it("preserves the offset so the absolute instant is unambiguous", () => {
    const input = "2026-03-15T09:00:00.000-08:00"
    const result = normalizeEventDate(input)
    expect(new Date(result!).toISOString()).toBe("2026-03-15T17:00:00.000Z")
  })
})

describe("extractLumaEventData", () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  it("extracts event data from JSON-LD with normalized dates", async () => {
    mockFetch.mockResolvedValueOnce(new Response(MOCK_HTML_WITH_JSONLD, { status: 200 }))

    const result = await extractLumaEventData("sfagents")
    expect(result).not.toBeNull()
    expect(result!.name).toBe("Test Hackathon")
    expect(result!.description).toBe("A test event description")
    expect(result!.startsAt).toBe("2026-03-15T09:00:00-08:00")
    expect(result!.endsAt).toBe("2026-03-16T17:00:00-08:00")
    expect(result!.locationType).toBe("in_person")
    expect(result!.locationName).toBe("San Francisco, California")
    expect(result!.imageUrl).toBe("https://images.lumacdn.com/test-image.png")
  })

  it("uses canonical Luma page data times when available", async () => {
    const nextDataPayload = {
      props: {
        pageProps: {
          initialData: {
            data: {
              start_at: "2026-05-14T13:00:00.000Z",
              end_at: "2026-05-14T18:00:00.000Z",
              description_mirror: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Build with people who love local apps." }],
                  },
                ],
              },
            },
          },
        },
      },
    }
    const offsetlessHtml = MOCK_HTML_WITH_JSONLD
      .replace("Test Hackathon", "Build OS26")
      .replace("A test event description", "Fallback event description")
      .replace("2026-03-15T09:00:00.000-08:00", "2026-05-14T09:00:00")
      .replace("2026-03-16T17:00:00.000-08:00", "2026-05-14T14:00:00")
      .replace(
        "</head>",
        `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextDataPayload)}</script></head>`
      )

    mockFetch.mockResolvedValueOnce(new Response(offsetlessHtml, { status: 200 }))

    const result = await extractLumaEventData("2pvpyrya")

    expect(result).not.toBeNull()
    expect(result!.name).toBe("Build OS26")
    expect(result!.description).toBe("Build with people who love local apps.")
    expect(result!.startsAt).toBe("2026-05-14T13:00:00Z")
    expect(result!.endsAt).toBe("2026-05-14T18:00:00Z")
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://luma.com/2pvpyrya",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("fetches from https://luma.com/{slug}", async () => {
    mockFetch.mockResolvedValueOnce(new Response(MOCK_HTML_WITH_JSONLD, { status: 200 }))

    await extractLumaEventData("my-hackathon")
    expect(mockFetch).toHaveBeenCalledWith(
      "https://luma.com/my-hackathon",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("returns null when fetch fails", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))

    const result = await extractLumaEventData("nonexistent")
    expect(result).toBeNull()
  })

  it("blocks redirects to private services", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    }))

    expect(await extractLumaEventData("unsafe-redirect")).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("rejects oversized pages", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", {
      status: 200,
      headers: { "content-length": String(2 * 1024 * 1024 + 1) },
    }))

    expect(await extractLumaEventData("oversized-page")).toBeNull()
  })

  it("returns null when no JSON-LD found", async () => {
    mockFetch.mockResolvedValueOnce(new Response("<html><body>No data</body></html>", { status: 200 }))

    const result = await extractLumaEventData("empty-page")
    expect(result).toBeNull()
  })

  it("maps OnlineEventAttendanceMode to virtual", async () => {
    const virtualHtml = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Virtual Hackathon",
  "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
  "location": {
    "@type": "VirtualLocation",
    "name": "Online Event",
    "url": "https://luma.com/virtual-event"
  }
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(virtualHtml, { status: 200 }))

    const result = await extractLumaEventData("virtual-event")
    expect(result!.locationType).toBe("virtual")
    expect(result!.locationName).toBe("Online Event")
    expect(result!.locationUrl).toBeNull()
  })

  it("handles script tags with extra attributes (real Luma format)", async () => {
    const realFormatHtml = `
<html><head>
<script data-cfasync="false" type="application/ld+json" data-next-head="">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Real Luma Event"
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(realFormatHtml, { status: 200 }))

    const result = await extractLumaEventData("real-event")
    expect(result).not.toBeNull()
    expect(result!.name).toBe("Real Luma Event")
  })

  it("handles missing optional fields gracefully", async () => {
    const minimalHtml = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Minimal Hackathon"
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(minimalHtml, { status: 200 }))

    const result = await extractLumaEventData("minimal")
    expect(result).not.toBeNull()
    expect(result!.name).toBe("Minimal Hackathon")
    expect(result!.description).toBeNull()
    expect(result!.startsAt).toBeNull()
    expect(result!.imageUrl).toBeNull()
  })

  it("ignores placeholder address ('Register to See Address')", async () => {
    const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Hidden Venue Event",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": {
    "@type": "Place",
    "name": "San Francisco, California",
    "address": "Register to See Address"
  }
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

    const result = await extractLumaEventData("hidden-venue")
    expect(result!.locationName).toBe("San Francisco, California")
  })

  it("combines venue name with real address", async () => {
    const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Venue Event",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": {
    "@type": "Place",
    "name": "Moscone Center",
    "address": "747 Howard St, San Francisco, CA 94103"
  }
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

    const result = await extractLumaEventData("venue-event")
    expect(result!.locationName).toBe("Moscone Center (747 Howard St, San Francisco, CA 94103)")
  })

  it("handles PostalAddress object format", async () => {
    const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Postal Event",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": {
    "@type": "Place",
    "name": "Tech Hub",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Main St",
      "addressLocality": "San Francisco",
      "addressRegion": "CA"
    }
  }
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

    const result = await extractLumaEventData("postal-event")
    expect(result!.locationName).toBe("Tech Hub (123 Main St, San Francisco, CA)")
  })

  it("avoids duplicate when address contains venue name", async () => {
    const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Duplicate Event",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": {
    "@type": "Place",
    "name": "San Francisco",
    "address": "747 Howard St, San Francisco, CA"
  }
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

    const result = await extractLumaEventData("duplicate-event")
    expect(result!.locationName).toBe("747 Howard St, San Francisco, CA")
  })

  it("preserves locationUrl for in-person events", async () => {
    const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "URL Event",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": {
    "@type": "Place",
    "name": "Conference Center",
    "url": "https://maps.google.com/some-place"
  }
}
</script>
</head><body></body></html>`
    mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }))

    const result = await extractLumaEventData("url-event")
    expect(result!.locationUrl).toBe("https://maps.google.com/some-place")
  })
})

describe("parseTranslationLinksFromHtml", () => {
  it("detects a French cross-link from typical Luma body HTML", () => {
    const html = `<p>About Build OS26</p><p><em>(For the french version, </em><em><a href="https://luma.com/blntxcm9" target="_blank" rel="nofollow noopener">click here</a></em><em>)</em></p>`
    const links = parseTranslationLinksFromHtml(html, "2pvpyrya")
    expect(links).toEqual([{ url: "https://luma.com/blntxcm9", languageCode: "fr" }])
  })

  it("detects French via 'Version française' phrasing", () => {
    const html = `<p>Version française disponible <a href="https://lu.ma/abc123">ici</a></p>`
    const links = parseTranslationLinksFromHtml(html, "en-slug")
    expect(links[0]?.languageCode).toBe("fr")
  })

  it("detects language when the keyword follows the link text", () => {
    const html = `<p><a href="https://luma.com/xyz123">Click here</a> for the French version →</p>`
    const links = parseTranslationLinksFromHtml(html, "primary")
    expect(links).toEqual([{ url: "https://luma.com/xyz123", languageCode: "fr" }])
  })

  it("skips self-referencing anchors", () => {
    const html = `<a href="https://luma.com/self">French version</a><a href="https://luma.com/other">French</a>`
    const links = parseTranslationLinksFromHtml(html, "self")
    expect(links.map((l) => l.url)).toEqual(["https://luma.com/other"])
  })

  it("skips anchors without a language keyword nearby", () => {
    const html = `<a href="https://luma.com/abc123">Some unrelated event</a>`
    const links = parseTranslationLinksFromHtml(html, "primary")
    expect(links).toEqual([])
  })

  it("dedupes repeated anchors to the same URL", () => {
    const html = `<p>French: <a href="https://luma.com/xyz123">here</a></p><p>Version française: <a href="https://luma.com/xyz123">here</a></p>`
    const links = parseTranslationLinksFromHtml(html, "primary")
    expect(links).toEqual([{ url: "https://luma.com/xyz123", languageCode: "fr" }])
  })
})
