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
  it("strips timezone offset and preserves wall-clock time", () => {
    expect(normalizeEventDate("2026-03-15T09:00:00.000-08:00")).toBe("2026-03-15T09:00:00")
  })

  it("strips positive timezone offset", () => {
    expect(normalizeEventDate("2022-06-27T18:30:00.000+04:00")).toBe("2022-06-27T18:30:00")
  })

  it("strips Z suffix from UTC string", () => {
    expect(normalizeEventDate("2026-01-01T00:00:00.000Z")).toBe("2026-01-01T00:00:00")
  })

  it("returns null for null input", () => {
    expect(normalizeEventDate(null)).toBeNull()
  })

  it("returns original string if it doesn't match ISO format", () => {
    expect(normalizeEventDate("not-a-date")).toBe("not-a-date")
  })

  it("handles string without milliseconds", () => {
    expect(normalizeEventDate("2026-07-04T14:30:00-05:00")).toBe("2026-07-04T14:30:00")
  })

  it("produces consistent output regardless of runtime timezone", () => {
    const input = "2026-03-15T09:00:00.000-08:00"
    const result = normalizeEventDate(input)
    const d = new Date(result!)
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(0)
    expect(d.getDate()).toBe(15)
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
    expect(result!.startsAt).toBe("2026-03-15T09:00:00")
    expect(result!.endsAt).toBe("2026-03-16T17:00:00")
    expect(result!.locationType).toBe("in_person")
    expect(result!.locationName).toBe("San Francisco, California")
    expect(result!.imageUrl).toBe("https://images.lumacdn.com/test-image.png")
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
