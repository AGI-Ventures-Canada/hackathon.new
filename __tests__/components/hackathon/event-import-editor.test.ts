import { describe, expect, it } from "bun:test"
import {
  createImportDraftSource,
  eventDataToState,
  importStorageKey,
} from "@/components/hackathon/event-import-editor"
import type { EventPageData } from "@/lib/services/event-page-import"
import type { EventPageRichContent } from "@/lib/services/luma-extract"

const eventData: EventPageData = {
  name: "Imported event",
  description: "Original description",
  startsAt: "2026-09-01T09:00:00-04:00",
  endsAt: "2026-09-01T17:00:00-04:00",
  locationType: "in_person",
  locationName: "Ottawa",
  locationUrl: null,
  imageUrl: null,
  language: "en",
  translationLinks: [],
}

const richContent: EventPageRichContent = {
  sponsors: [],
  rules: null,
  prizes: [],
  challenges: [],
  translationLinks: [],
  agendaItems: [],
  cleanedDescription: null,
}

describe("event import draft preparation", () => {
  it("does not append the source twice when restoring after sign-in", () => {
    const base = "oatmeal:external-import:safe-reference"
    const source = "https://events.example/event"
    const exact = importStorageKey(base, source)

    expect(exact).toBe(base)
    expect(importStorageKey(exact, source)).toBe(exact)
  })

  it("keeps valid fields when another imported field is invalid", () => {
    const result = eventDataToState({
      ...eventData,
      name: "n".repeat(121),
      endsAt: "not-a-date",
      imageUrl: "javascript:alert(1)",
    }, {
      ...richContent,
      cleanedDescription: "d".repeat(5_001),
      agendaItems: [{
        title: "Opening",
        description: null,
        startsAt: "2026-09-01T09:30:00-04:00",
        endsAt: "not-a-date",
        location: null,
        speakers: [],
      }],
    })

    expect(result.sanitized).toBe(true)
    expect(result.state.name).toHaveLength(120)
    expect(result.state.description).toHaveLength(5_000)
    expect(result.state.startsAt).toBe("2026-09-01T13:00:00.000Z")
    expect(result.state.endsAt).toBeNull()
    expect(result.state.imageUrl).toBeNull()
    expect(result.state.agendaItems[0]?.startsAt).toBe("2026-09-01T13:30:00.000Z")
    expect(result.state.agendaItems[0]?.endsAt).toBeNull()
  })

  it("stores only bounded, redacted import metadata", () => {
    const source = createImportDraftSource(
      "https://user:pass@example.com/events/one?token=secret#private",
      ` fr-CA ${"x".repeat(40)}`,
      [
        {
          url: "https://luma.com/fr?secret=value#fragment",
          languageCode: " fr ",
        },
        {
          url: "https://luma.com/fr?another=value",
          languageCode: "fr",
        },
        {
          url: "javascript:alert(1)",
          languageCode: "es",
        },
      ],
    )

    expect(source.url).toBe("https://example.com/events/one")
    expect(source.defaultLocale).toHaveLength(35)
    expect(source.translationLinks).toEqual([{
      url: "https://luma.com/fr",
      languageCode: "fr",
    }])
  })

  it("sanitizes every rich import collection without dropping safe rows", () => {
    const result = eventDataToState({
      ...eventData,
      name: "   ",
      endsAt: "2026-09-01T08:00:00-04:00",
      locationName: "l".repeat(241),
      locationUrl: "meet.example.com/room",
      imageUrl: "http://127.0.0.1/private.png",
    }, {
      ...richContent,
      sponsors: [
        { name: "", tier: null },
        { name: " OpenAI ", tier: "gold" },
      ],
      rules: "r".repeat(10_001),
      prizes: [
        { name: "", description: null, value: null },
        {
          name: " Best Overall ",
          description: "d".repeat(1_001),
          value: "v".repeat(121),
        },
      ],
      challenges: [
        { title: "", description: null, resources: [] },
        {
          title: " Useful tools ",
          description: "c".repeat(2_001),
          resources: [
            { label: "", url: "http://127.0.0.1/private" },
            { label: "", url: "docs.example.com/start" },
          ],
        },
      ],
      agendaItems: [
        {
          title: "",
          description: null,
          startsAt: null,
          endsAt: null,
          location: null,
          speakers: [],
        },
        {
          title: " Opening ",
          description: "a".repeat(1_001),
          startsAt: "2026-09-01T10:00:00-04:00",
          endsAt: "2026-09-01T09:00:00-04:00",
          location: "m".repeat(201),
          speakers: ["", " Ada ", "s".repeat(121)],
        },
      ],
      cleanedDescription: "Clean description",
    })

    expect(result.sanitized).toBe(true)
    expect(result.state.name).toBe("Imported hackathon")
    expect(result.state.endsAt).toBeNull()
    expect(result.state.locationName).toHaveLength(240)
    expect(result.state.locationUrl).toBe("https://meet.example.com/room")
    expect(result.state.imageUrl).toBeNull()
    expect(result.state.sponsors).toEqual([{ name: "OpenAI", tier: "gold" }])
    expect(result.state.rules).toHaveLength(10_000)
    expect(result.state.prizes).toEqual([{
      name: "Best Overall",
      description: "d".repeat(1_000),
      value: "v".repeat(120),
    }])
    expect(result.state.challenges).toEqual([{
      title: "Useful tools",
      description: "c".repeat(2_000),
      resources: [{ label: "Resource", url: "https://docs.example.com/start" }],
    }])
    expect(result.state.agendaItems).toEqual([{
      title: "Opening",
      description: "a".repeat(1_000),
      startsAt: "2026-09-01T14:00:00.000Z",
      endsAt: null,
      location: "m".repeat(200),
      speakers: ["Ada", "s".repeat(120)],
    }])
    expect(result.state.description).toBe("Clean description")
  })

  it("caps imported lists at their browser-draft limits", () => {
    const result = eventDataToState(eventData, {
      ...richContent,
      sponsors: Array.from({ length: 51 }, (_, index) => ({
        name: `Sponsor ${index}`,
        tier: null,
      })),
      prizes: Array.from({ length: 51 }, (_, index) => ({
        name: `Prize ${index}`,
        description: null,
        value: null,
      })),
      challenges: Array.from({ length: 51 }, (_, index) => ({
        title: `Challenge ${index}`,
        description: null,
        resources: Array.from({ length: 21 }, (_unused, resourceIndex) => ({
          label: `Resource ${resourceIndex}`,
          url: `https://docs.example.com/${index}/${resourceIndex}`,
        })),
      })),
      agendaItems: Array.from({ length: 51 }, (_, index) => ({
        title: `Session ${index}`,
        description: null,
        startsAt: null,
        endsAt: null,
        location: null,
        speakers: Array.from({ length: 21 }, (_unused, speakerIndex) =>
          `Speaker ${speakerIndex}`,
        ),
      })),
    })

    expect(result.sanitized).toBe(true)
    expect(result.state.sponsors).toHaveLength(50)
    expect(result.state.prizes).toHaveLength(50)
    expect(result.state.challenges).toHaveLength(50)
    expect(result.state.challenges[0]?.resources).toHaveLength(20)
    expect(result.state.agendaItems).toHaveLength(50)
    expect(result.state.agendaItems[0]?.speakers).toHaveLength(20)
  })

  it("limits translation handoff metadata to ten unique safe links", () => {
    const source = createImportDraftSource(
      "https://events.example.com/hackathon",
      " ",
      Array.from({ length: 12 }, (_, index) => ({
        url: `https://luma.com/language-${index}?private=value`,
        languageCode: index === 0 ? " " : `l${index}`,
      })),
    )

    expect(source.defaultLocale).toBeNull()
    expect(source.translationLinks).toHaveLength(10)
    expect(source.translationLinks[0]).toEqual({
      url: "https://luma.com/language-1",
      languageCode: "l1",
    })
  })
})
