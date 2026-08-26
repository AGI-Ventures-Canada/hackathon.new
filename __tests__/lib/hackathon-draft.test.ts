import { describe, expect, it } from "bun:test"
import {
  HACKATHON_DRAFT_CLOCK_SKEW_MS,
  HACKATHON_DRAFT_EXPIRY_MS,
  applyDraftPatch,
  createDefaultHackathonDraft,
  createDraftEnvelope,
  hasOffsetAwareDraftTimestamps,
  normalizeDraftTimestampsForSubmission,
  parseStoredDraft,
  serializeDraftEnvelope,
} from "@/lib/hackathon-draft"

const NOW = new Date("2026-08-25T12:00:00.000Z")

describe("hackathon draft envelope", () => {
  it("builds sensible deterministic defaults", () => {
    const state = createDefaultHackathonDraft(NOW)
    const startsAt = new Date(state.startsAt!)
    const endsAt = new Date(state.endsAt!)
    expect(startsAt.getHours()).toBe(8)
    expect(startsAt.getMinutes()).toBe(30)
    expect(endsAt.getHours()).toBe(17)
    expect(endsAt.getMinutes()).toBe(0)
    expect(state.registrationOpensAt).toBe(NOW.toISOString())
    expect(new Date(state.registrationClosesAt!).getTime()).toBeLessThan(startsAt.getTime())
    expect(state.challenges).toEqual([])
  })

  it("round trips a current envelope", () => {
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: NOW,
    })
    const parsed = parseStoredDraft(serializeDraftEnvelope(envelope), {
      draftId: "unused",
      now: new Date(NOW.getTime() + 1_000),
    })
    expect(parsed?.migrated).toBe(false)
    expect(parsed?.envelope).toEqual(envelope)
  })

  it("migrates the prior storage shape", () => {
    const legacyState = createDefaultHackathonDraft(NOW)
    const {
      challenges: _challenges,
      agendaItems: _agendaItems,
      registrationOpensAt: _registrationOpensAt,
      registrationClosesAt: _registrationClosesAt,
      ...oldState
    } = legacyState
    const parsed = parseStoredDraft(JSON.stringify({
      state: oldState,
      savedAt: NOW.getTime(),
    }), {
      draftId: "migrated-1",
      now: new Date(NOW.getTime() + 1_000),
    })
    expect(parsed?.migrated).toBe(true)
    expect(parsed?.sanitized).toBe(false)
    expect(parsed?.envelope.state.challenges).toEqual([])
    expect(parsed?.envelope.state.agendaItems).toEqual([])
    expect(parsed?.envelope.state.registrationOpensAt).toBeNull()
    expect(parsed?.envelope.state.registrationClosesAt).toBeNull()
  })

  it("bounds a legacy scratch draft without dropping its other edits", () => {
    const parsed = parseStoredDraft(JSON.stringify({
      state: {
        ...createDefaultHackathonDraft(NOW),
        name: "n".repeat(121),
        description: "d".repeat(5_001),
        rules: "Keep these rules",
      },
      savedAt: NOW.getTime(),
    }), {
      draftId: "migrated-1",
      now: new Date(NOW.getTime() + 1_000),
    })

    expect(parsed?.sanitized).toBe(true)
    expect(parsed?.envelope.state.name).toHaveLength(120)
    expect(parsed?.envelope.state.description).toHaveLength(5_000)
    expect(parsed?.envelope.state.rules).toBe("Keep these rules")
  })

  it("bounds a matching safe legacy import while redacting its source", () => {
    const legacy = (sourceUrl: string, state = createDefaultHackathonDraft(NOW)) => JSON.stringify({
      state,
      sourceUrl,
      savedAt: NOW.getTime(),
    })
    const options = {
      sourceUrl: "https://events.example.com/hackathon",
      draftId: "migrated-1",
      now: new Date(NOW.getTime() + 1_000),
    }

    const migrated = parseStoredDraft(legacy(
      "https://events.example.com/hackathon?invite=secret#private",
      {
        ...createDefaultHackathonDraft(NOW),
        name: "Imported event",
        sponsors: Array.from({ length: 51 }, (_, index) => ({
          name: index === 0 ? "s".repeat(121) : `Sponsor ${index}`,
          tier: null,
        })),
        rules: "Keep the imported rules",
      },
    ), options)
    expect(migrated?.sanitized).toBe(true)
    expect(migrated?.envelope.source).toEqual({
      kind: "event_import",
      url: "https://events.example.com/hackathon",
    })
    expect(migrated?.envelope.state.sponsors).toHaveLength(50)
    expect(migrated?.envelope.state.sponsors[0]?.name).toHaveLength(120)
    expect(migrated?.envelope.state.rules).toBe("Keep the imported rules")
    expect(parseStoredDraft(legacy(
      "https://events.example.com/other?invite=secret",
    ), options)).toBeNull()
    expect(parseStoredDraft(legacy(
      "http://127.0.0.1/hackathon?invite=secret",
    ), options)).toBeNull()
  })

  it("drops expired and mismatched-source drafts", () => {
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      source: { kind: "event_import", url: "https://example.com/a" },
      now: NOW,
    })
    expect(parseStoredDraft(serializeDraftEnvelope(envelope), {
      sourceUrl: "https://example.com/b",
      draftId: "draft-2",
      now: NOW,
    })).toBeNull()
    expect(parseStoredDraft(serializeDraftEnvelope(envelope), {
      sourceUrl: "https://example.com/a",
      draftId: "draft-2",
      now: new Date(NOW.getTime() + HACKATHON_DRAFT_EXPIRY_MS),
    })).toBeNull()
  })

  it("preserves and re-dates drafts after a browser clock correction", () => {
    const future = new Date(NOW.getTime() + HACKATHON_DRAFT_CLOCK_SKEW_MS + 1)
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: future,
    })

    const current = parseStoredDraft(serializeDraftEnvelope(envelope), {
      draftId: "unused",
      now: NOW,
    })
    const legacy = parseStoredDraft(JSON.stringify({
      state: createDefaultHackathonDraft(NOW),
      savedAt: future.getTime(),
    }), {
      draftId: "migrated-1",
      now: NOW,
    })

    expect(current?.migrated).toBe(true)
    expect(current?.sanitized).toBe(false)
    expect(current?.envelope.savedAt).toBe(NOW.toISOString())
    expect(legacy?.migrated).toBe(true)
    expect(legacy?.sanitized).toBe(false)
    expect(legacy?.envelope.savedAt).toBe(NOW.toISOString())
  })

  it("accepts a draft within normal browser clock skew", () => {
    const future = new Date(NOW.getTime() + HACKATHON_DRAFT_CLOCK_SKEW_MS)
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: future,
    })

    expect(parseStoredDraft(serializeDraftEnvelope(envelope), {
      draftId: "unused",
      now: NOW,
    })?.envelope).toEqual(envelope)
  })

  it("applies a valid patch atomically and replaces arrays", () => {
    const envelope = createDraftEnvelope({
      ...createDefaultHackathonDraft(NOW),
      description: "Old",
      sponsors: [{ name: "Old sponsor", tier: null }],
    }, { draftId: "draft-1", now: NOW })
    const result = applyDraftPatch(envelope, 0, {
      description: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      sponsors: [{ name: "New sponsor", tier: "gold" }],
    }, new Date(NOW.getTime() + 1_000))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.revision).toBe(1)
    expect(result.envelope.state.name).toBe(envelope.state.name)
    expect(result.envelope.state.description).toBeNull()
    expect(result.envelope.state.registrationOpensAt).toBeNull()
    expect(result.envelope.state.registrationClosesAt).toBeNull()
    expect(result.envelope.state.sponsors).toEqual([{ name: "New sponsor", tier: "gold" }])
  })

  it("rejects stale revisions and invalid timestamp patches without changing state", () => {
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: NOW,
    })
    expect(applyDraftPatch(envelope, 2, { name: "Stale" })).toEqual(expect.objectContaining({
      ok: false,
      code: "stale_revision",
    }))
    expect(applyDraftPatch(envelope, 0, {
      startsAt: "2026-09-08T09:00:00" as `${number}-${number}-${number}T${string}`,
    })).toEqual(expect.objectContaining({ ok: false, code: "invalid_patch" }))
    expect(envelope.revision).toBe(0)
  })

  it("rejects a registration window that closes before it opens", () => {
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: NOW,
    })
    const result = applyDraftPatch(envelope, 0, {
      registrationOpensAt: "2026-09-02T12:00:00.000Z",
      registrationClosesAt: "2026-09-01T12:00:00.000Z",
    })
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "invalid_patch" }))
    expect(envelope.revision).toBe(0)
  })

  it("rejects an agenda patch that ends before it starts", () => {
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: NOW,
    })

    const result = applyDraftPatch(envelope, 0, {
      agendaItems: [{
        title: "Backwards session",
        description: null,
        startsAt: "2026-09-08T10:00:00.000Z",
        endsAt: "2026-09-08T09:00:00.000Z",
        location: null,
        speakers: [],
      }],
    })

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "invalid_patch" }))
    expect(envelope.revision).toBe(0)
    expect(envelope.state.agendaItems).toEqual([])
  })

  it("normalizes bare draft URLs in one atomic patch", () => {
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: NOW,
    })

    const result = applyDraftPatch(envelope, 0, {
      locationUrl: "meet.example.com/room",
      imageUrl: "images.example.com/banner.png",
      challenges: [
        {
          title: "Build it",
          description: null,
          resources: [{ label: "Docs", url: "docs.example.com/start" }],
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.state.locationUrl).toBe("https://meet.example.com/room")
    expect(result.envelope.state.imageUrl).toBe("https://images.example.com/banner.png")
    expect(result.envelope.state.challenges[0].resources[0].url).toBe(
      "https://docs.example.com/start",
    )
  })

  it("rejects an unsafe URL without changing the draft", () => {
    const envelope = createDraftEnvelope(createDefaultHackathonDraft(NOW), {
      draftId: "draft-1",
      now: NOW,
    })

    const result = applyDraftPatch(envelope, 0, {
      locationUrl: "http://127.0.0.1/private",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe("invalid_patch")
    expect(envelope.revision).toBe(0)
    expect(envelope.state.locationUrl).toBeNull()
  })

  it("turns local wall-clock times into the browser timezone before submission", () => {
    const result = normalizeDraftTimestampsForSubmission({
      ...createDefaultHackathonDraft(NOW),
      startsAt: "2026-01-15T09:00:00",
      endsAt: "2026-07-15T09:00:00",
      registrationOpensAt: null,
      registrationClosesAt: null,
      agendaItems: [{
        title: "Summer session",
        description: null,
        startsAt: "2026-07-15T10:00:00",
        endsAt: "2026-07-15T11:00:00",
        location: null,
        speakers: [],
      }],
    }, "America/Toronto")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.startsAt).toBe("2026-01-15T14:00:00.000Z")
    expect(result.state.endsAt).toBe("2026-07-15T13:00:00.000Z")
    expect(result.state.agendaItems[0].startsAt).toBe("2026-07-15T14:00:00.000Z")
    expect(hasOffsetAwareDraftTimestamps(result.state)).toBe(true)
  })

  it("rejects a local time skipped by daylight saving time", () => {
    const state = {
      ...createDefaultHackathonDraft(NOW),
      startsAt: "2026-03-08T02:30:00",
      endsAt: "2026-03-08T04:00:00",
    }

    const result = normalizeDraftTimestampsForSubmission(state, "America/Toronto")

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      message: expect.stringContaining("skipped clock hour"),
    }))
    expect(hasOffsetAwareDraftTimestamps(state)).toBe(false)
  })

  it("keeps an incomplete agenda visible instead of silently dropping it", () => {
    const state = {
      ...createDefaultHackathonDraft(NOW),
      agendaItems: [{
        title: "Kickoff",
        description: null,
        startsAt: null,
        endsAt: null,
        location: null,
        speakers: [],
      }],
    }

    expect(normalizeDraftTimestampsForSubmission(state, "America/Toronto")).toEqual({
      ok: false,
      message: "Add a start time to every agenda item.",
    })
  })

  it("normalizes imported event dates without dropping incomplete agenda rows", () => {
    const state = {
      ...createDefaultHackathonDraft(NOW),
      startsAt: "2026-09-08T09:00:00",
      agendaItems: [{
        title: "Kickoff",
        description: null,
        startsAt: null,
        endsAt: null,
        location: null,
        speakers: [],
      }],
    }

    const result = normalizeDraftTimestampsForSubmission(
      state,
      "America/Toronto",
      { allowIncompleteAgenda: true },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.startsAt).toBe("2026-09-08T13:00:00.000Z")
    expect(result.state.agendaItems).toEqual(state.agendaItems)
  })

  it("rejects an unknown browser timezone without changing the draft", () => {
    const state = createDefaultHackathonDraft(NOW)
    const originalStartsAt = state.startsAt
    const result = normalizeDraftTimestampsForSubmission(state, "Not/A_Timezone")

    expect(result.ok).toBe(false)
    expect(state.startsAt).toBe(originalStartsAt)
  })

  it("uses the chosen timezone for calendar-day defaults across DST", () => {
    const now = new Date("2026-02-25T23:30:00.000Z")
    const state = createDefaultHackathonDraft(now, "America/Toronto")

    expect(state.registrationOpensAt).toBe(now.toISOString())
    expect(state.startsAt).toBe("2026-03-11T12:30:00.000Z")
    expect(state.endsAt).toBe("2026-03-12T21:00:00.000Z")
    expect(state.registrationClosesAt).toBe("2026-03-10T12:30:00.000Z")
  })

  it("normalizes fractional local times and existing offset-aware times", () => {
    const state = {
      ...createDefaultHackathonDraft(NOW),
      startsAt: "2026-09-08T09:00:00.123456",
      endsAt: "2026-09-08T18:00:00-04:00",
      registrationOpensAt: null,
      registrationClosesAt: null,
    }

    const result = normalizeDraftTimestampsForSubmission(
      state,
      "America/Toronto",
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.startsAt).toBe("2026-09-08T13:00:00.123Z")
    expect(result.state.endsAt).toBe("2026-09-08T22:00:00.000Z")
  })

  it("rejects normalized event dates that end before they start", () => {
    const result = normalizeDraftTimestampsForSubmission(
      {
        ...createDefaultHackathonDraft(NOW),
        startsAt: "2026-09-08T18:00:00",
        endsAt: "2026-09-08T09:00:00",
      },
      "America/Toronto",
    )

    expect(result).toEqual({
      ok: false,
      message: "The end time must be after the start time.",
    })
  })

  it("detects a local agenda timestamp even when top-level dates are safe", () => {
    const state = {
      ...createDefaultHackathonDraft(NOW),
      agendaItems: [{
        title: "Local kickoff",
        description: null,
        startsAt: "2026-09-08T09:00:00",
        endsAt: null,
        location: null,
        speakers: [],
      }],
    }

    expect(hasOffsetAwareDraftTimestamps(state)).toBe(false)
  })

  it("migrates a mixed legacy draft field by field", () => {
    const parsed = parseStoredDraft(JSON.stringify({
      savedAt: NOW.getTime(),
      state: {
        name: " Legacy Jam ",
        description: 123,
        startsAt: "2026-09-08T13:00:00.000Z",
        endsAt: "2026-09-08T12:00:00.000Z",
        registrationOpensAt: "2026-09-02T12:00:00.000Z",
        registrationClosesAt: "2026-09-01T12:00:00.000Z",
        locationType: "teleport",
        locationName: "Room 1",
        locationUrl: "http://127.0.0.1/private",
        imageUrl: "https://images.example.com/banner.png",
        sponsors: [
          null,
          { name: " " },
          { name: " OpenAI ", tier: 42 },
          { name: "Partner", tier: " Gold " },
        ],
        rules: "Be kind.",
        prizes: [
          "bad",
          { name: " " },
          {
            name: " Best Overall ",
            description: "d".repeat(1_001),
            value: 5000,
          },
        ],
        challenges: [
          null,
          { title: " " },
          {
            title: " Useful tools ",
            description: "Build something useful.",
            resources: [
              null,
              { label: 1, url: "https://docs.example.com" },
              { label: "Private", url: "http://127.0.0.1" },
              { label: " Docs ", url: "https://docs.example.com/start" },
            ],
          },
        ],
        agendaItems: [
          null,
          { title: " " },
          {
            title: " Opening ",
            description: "Welcome",
            startsAt: "2026-09-08T14:00:00.000Z",
            endsAt: "2026-09-08T13:00:00.000Z",
            location: "Main room",
            speakers: [null, " ", " Ada "],
          },
        ],
      },
    }), {
      draftId: "migrated-mixed",
      now: new Date(NOW.getTime() + 1_000),
    })

    expect(parsed?.sanitized).toBe(true)
    expect(parsed?.envelope.state).toEqual(expect.objectContaining({
      name: " Legacy Jam ",
      description: null,
      endsAt: null,
      registrationClosesAt: null,
      locationType: null,
      locationUrl: null,
      imageUrl: "https://images.example.com/banner.png",
      sponsors: [
        { name: "OpenAI", tier: null },
        { name: "Partner", tier: "Gold" },
      ],
      prizes: [{
        name: "Best Overall",
        description: "d".repeat(1_000),
        value: null,
      }],
      challenges: [{
        title: "Useful tools",
        description: "Build something useful.",
        resources: [{
          label: "Docs",
          url: "https://docs.example.com/start",
        }],
      }],
      agendaItems: [{
        title: "Opening",
        description: "Welcome",
        startsAt: "2026-09-08T14:00:00.000Z",
        endsAt: null,
        location: "Main room",
        speakers: ["Ada"],
      }],
    }))
  })

  it("replaces malformed legacy collections with empty ones", () => {
    const parsed = parseStoredDraft(JSON.stringify({
      savedAt: NOW.getTime(),
      state: {
        name: "Legacy Jam",
        sponsors: {},
        prizes: "none",
        challenges: 42,
        agendaItems: false,
      },
    }), {
      draftId: "migrated-collections",
      now: new Date(NOW.getTime() + 1_000),
    })

    expect(parsed?.sanitized).toBe(true)
    expect(parsed?.envelope.state.sponsors).toEqual([])
    expect(parsed?.envelope.state.prizes).toEqual([])
    expect(parsed?.envelope.state.challenges).toEqual([])
    expect(parsed?.envelope.state.agendaItems).toEqual([])
  })

  it("drops malformed legacy envelopes instead of inventing a draft", () => {
    const options = { draftId: "migrated-invalid", now: NOW }
    expect(parseStoredDraft("not-json", options)).toBeNull()
    expect(parseStoredDraft("null", options)).toBeNull()
    expect(parseStoredDraft(JSON.stringify({
      state: { name: "Legacy Jam" },
      savedAt: "yesterday",
    }), options)).toBeNull()
    expect(parseStoredDraft(JSON.stringify({
      state: null,
      savedAt: NOW.getTime(),
    }), options)).toBeNull()
    expect(parseStoredDraft(JSON.stringify({
      state: {},
      savedAt: NOW.getTime(),
    }), options)).toBeNull()
  })

  it("clears optional URLs in a valid atomic patch", () => {
    const envelope = createDraftEnvelope({
      ...createDefaultHackathonDraft(NOW),
      locationUrl: "https://meet.example.com/room",
      imageUrl: "https://images.example.com/banner.png",
    }, { draftId: "draft-clear-urls", now: NOW })

    const result = applyDraftPatch(envelope, 0, {
      locationUrl: null,
      imageUrl: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.state.locationUrl).toBeNull()
    expect(result.envelope.state.imageUrl).toBeNull()
  })
})
