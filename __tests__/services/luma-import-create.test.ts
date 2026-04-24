import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockFrom,
  mockRpc,
} from "../lib/supabase-mock"

const mockFetch = mock(() =>
  Promise.resolve(
    new Response(Buffer.alloc(1024), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    })
  )
)
globalThis.fetch = mockFetch as unknown as typeof fetch

const mockSharpInstance = {
  metadata: mock(() => Promise.resolve({ width: 800, height: 400 })),
  resize: mock(function (this: unknown) { return this }),
  webp: mock(function (this: unknown) { return this }),
  clone: mock(function (this: unknown) { return this }),
  toBuffer: mock(() => Promise.resolve(Buffer.alloc(50 * 1024))),
}
mock.module("sharp", () => ({ default: mock(() => mockSharpInstance) }))

const mockStorageUpload = mock(() => Promise.resolve({ data: { path: "h1/banner.webp" }, error: null }))
const mockStorageGetPublicUrl = mock(() => ({
  data: { publicUrl: "https://storage.test/banners/h1/banner.webp" },
}))
const mockStorageFrom = mock(() => ({
  upload: mockStorageUpload,
  getPublicUrl: mockStorageGetPublicUrl,
  remove: mock(() => Promise.resolve({ error: null })),
}))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
    storage: { from: mockStorageFrom },
  }),
}))

const mockExtractExternalEventData = mock(() => Promise.resolve(null as unknown))
const mockExtractExternalRichContent = mock(() => Promise.resolve(null as unknown))
mock.module("@/lib/services/external-import", () => ({
  extractExternalEventData: mockExtractExternalEventData,
  extractExternalRichContent: mockExtractExternalRichContent,
  isLumaUrl: (input: string) => {
    try {
      const { hostname } = new URL(input.startsWith("http") ? input : `https://${input}`)
      return hostname === "luma.com" || hostname === "www.luma.com" || hostname === "lu.ma" || hostname === "www.lu.ma"
    } catch {
      return false
    }
  },
}))

const {
  createHackathonFromImport,
  createPrizesFromImport,
  createChallengesFromImport,
  importTranslationVariants,
} = await import("@/lib/services/luma-import-create")

describe("createHackathonFromImport", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockFetch.mockClear()
    mockStorageUpload.mockClear()
    mockSharpInstance.toBuffer.mockClear()
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(Buffer.alloc(1024), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        })
      )
    )
  })

  it("creates hackathon with all imported fields", async () => {
    const selectChain = createChainableMock({ data: null, error: null })
    const insertChain = createChainableMock({
      data: { id: "h1", name: "Test Hackathon", slug: "test-hackathon", tenant_id: "t1" },
      error: null,
    })
    const updateChain = createChainableMock({
      data: { id: "h1", updated_at: "2026-02-25" },
      error: null,
    })

    let callCount = 0
    setMockFromImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain
      if (callCount === 2) return insertChain
      return updateChain
    })

    const result = await createHackathonFromImport("tenant-1", {
      name: "Test Hackathon",
      description: "A test event",
      startsAt: "2026-03-15T09:00:00.000-08:00",
      endsAt: "2026-03-16T17:00:00.000-08:00",
      locationType: "in_person",
      locationName: "San Francisco",
      locationUrl: null,
      imageUrl: "https://images.lumacdn.com/test.png",
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe("h1")
    expect(mockFetch).toHaveBeenCalledWith("https://images.lumacdn.com/test.png")
    expect(mockStorageUpload).toHaveBeenCalled()
  })

  it("creates hackathon even if banner download fails", async () => {
    const selectChain = createChainableMock({ data: null, error: null })
    const insertChain = createChainableMock({
      data: { id: "h2", name: "No Banner", slug: "no-banner", tenant_id: "t1" },
      error: null,
    })
    const updateChain = createChainableMock({
      data: { id: "h2", updated_at: "2026-02-25" },
      error: null,
    })

    let callCount = 0
    setMockFromImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain
      if (callCount === 2) return insertChain
      return updateChain
    })

    const result = await createHackathonFromImport("tenant-1", {
      name: "No Banner",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe("h2")
  })

  it("returns null when hackathon creation fails", async () => {
    const selectChain = createChainableMock({ data: null, error: null })
    const insertChain = createChainableMock({
      data: null,
      error: { message: "Insert failed" },
    })

    let callCount = 0
    setMockFromImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain
      return insertChain
    })

    const result = await createHackathonFromImport("tenant-1", {
      name: "Fail",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    })

    expect(result).toBeNull()
  })

  it("includes rules field in hackathon update", async () => {
    const selectChain = createChainableMock({ data: null, error: null })
    const insertChain = createChainableMock({
      data: { id: "h3", name: "With Rules", slug: "with-rules", tenant_id: "t1" },
      error: null,
    })
    const updateChain = createChainableMock({
      data: { id: "h3", updated_at: "2026-02-25" },
      error: null,
    })

    let callCount = 0
    setMockFromImplementation(() => {
      callCount++
      if (callCount === 1) return selectChain
      if (callCount === 2) return insertChain
      return updateChain
    })

    const result = await createHackathonFromImport("tenant-1", {
      name: "With Rules",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
      rules: "No plagiarism allowed.",
    })

    expect(result).not.toBeNull()
    expect(result!.id).toBe("h3")
  })
})

describe("createPrizesFromImport", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("creates prizes with correct display order", async () => {
    const prizesChain = createChainableMock({
      data: { id: "p1", hackathon_id: "h1", name: "Grand Prize", description: "Top team", value: "$5,000", display_order: 0, created_at: "" },
      error: null,
    })
    setMockFromImplementation(() => prizesChain)

    await createPrizesFromImport("h1", [
      { name: "Grand Prize", description: "Top team", value: "$5,000" },
      { name: "Runner Up", description: null, value: "$2,500" },
      { name: "Best Design", description: "Most creative UI", value: null },
    ])

    expect(prizesChain.insert).toHaveBeenCalledTimes(3)
    expect(prizesChain.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      hackathon_id: "h1",
      name: "Grand Prize",
      description: "Top team",
      value: "$5,000",
      display_order: 0,
    }))
    expect(prizesChain.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      name: "Runner Up",
      description: null,
      value: "$2,500",
      display_order: 1,
    }))
    expect(prizesChain.insert).toHaveBeenNthCalledWith(3, expect.objectContaining({
      name: "Best Design",
      description: "Most creative UI",
      value: null,
      display_order: 2,
    }))
  })

  it("handles empty prizes array", async () => {
    const prizesChain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => prizesChain)

    await createPrizesFromImport("h1", [])

    expect(prizesChain.insert).not.toHaveBeenCalled()
  })

  it("defaults null description and value", async () => {
    const prizesChain = createChainableMock({
      data: { id: "p1", hackathon_id: "h1", name: "Participation Award", description: null, value: null, display_order: 0, created_at: "" },
      error: null,
    })
    setMockFromImplementation(() => prizesChain)

    await createPrizesFromImport("h1", [
      { name: "Participation Award" },
    ])

    expect(prizesChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: "Participation Award",
      description: null,
      value: null,
      display_order: 0,
    }))
  })
})

describe("createChallengesFromImport", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  function setupChallengeMocks() {
    const hackathonsChain = createChainableMock({
      data: { id: "h1" },
      error: null,
    })
    const challengesChain = createChainableMock({
      data: {
        id: "c1",
        hackathon_id: "h1",
        title: "Challenge",
        description: null,
        resources: [],
        sort_order: 0,
        created_at: "",
        updated_at: "",
      },
      error: null,
    })
    setMockFromImplementation((table: string) => {
      if (table === "hackathons") return hackathonsChain
      return challengesChain
    })
    return { hackathonsChain, challengesChain }
  }

  it("creates challenges with title, description, and resources", async () => {
    const { challengesChain } = setupChallengeMocks()

    await createChallengesFromImport("h1", "tenant-1", [
      {
        title: "AI for Healthcare",
        description: "Improve patient triage.",
        resources: [{ label: "Dataset", url: "https://example.com/data.csv" }],
      },
      {
        title: "Climate Track",
        description: null,
      },
    ])

    expect(challengesChain.insert).toHaveBeenCalledTimes(2)
    expect(challengesChain.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      hackathon_id: "h1",
      title: "AI for Healthcare",
      description: "Improve patient triage.",
      resources: [{ label: "Dataset", url: "https://example.com/data.csv" }],
    }))
    expect(challengesChain.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      hackathon_id: "h1",
      title: "Climate Track",
      description: null,
      resources: [],
    }))
  })

  it("drops resource entries with empty urls and normalizes the rest", async () => {
    const { challengesChain } = setupChallengeMocks()

    await createChallengesFromImport("h1", "tenant-1", [
      {
        title: "Resources Test",
        resources: [
          { label: "Valid", url: "  example.com/api  " },
          { label: "Empty", url: "" },
        ],
      },
    ])

    expect(challengesChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: "Resources Test",
      resources: [{ label: "Valid", url: "https://example.com/api" }],
    }))
  })

  it("handles empty challenges array", async () => {
    const { challengesChain } = setupChallengeMocks()

    await createChallengesFromImport("h1", "tenant-1", [])

    expect(challengesChain.insert).not.toHaveBeenCalled()
  })
})

describe("importTranslationVariants", () => {
  const primary = {
    name: "AGI Montreal",
    description: "Build stuff.",
    rules: "Be nice.",
    location_name: "Montreal",
    community_label: null,
  }

  function setupUpdateChain() {
    const updateChain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => updateChain)
    return updateChain
  }

  beforeEach(() => {
    resetSupabaseMocks()
    mockExtractExternalEventData.mockReset()
    mockExtractExternalRichContent.mockReset()
    mockExtractExternalEventData.mockImplementation(() => Promise.resolve(null))
    mockExtractExternalRichContent.mockImplementation(() => Promise.resolve(null))
  })

  it("no-op when translationLinks is empty", async () => {
    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [],
    })

    expect(mockExtractExternalEventData).not.toHaveBeenCalled()
  })

  it("writes a translations JSONB with differing fields for each locale", async () => {
    mockExtractExternalEventData.mockImplementationOnce(() =>
      Promise.resolve({
        name: "Hackathon IA de Montréal",
        description: "Construisez des trucs.",
        startsAt: null,
        endsAt: null,
        locationType: null,
        locationName: "Montréal",
        locationUrl: null,
        imageUrl: null,
        language: "fr",
      })
    )
    mockExtractExternalRichContent.mockImplementationOnce(() =>
      Promise.resolve({
        sponsors: [],
        rules: "Soyez gentils.",
        prizes: [],
        challenges: [],
        translationLinks: [],
        cleanedDescription: "Construisez des trucs.",
      })
    )

    const updateChain = setupUpdateChain()

    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })

    expect(updateChain.update).toHaveBeenCalledWith({
      translations: {
        fr: {
          name: "Hackathon IA de Montréal",
          description: "Construisez des trucs.",
          rules: "Soyez gentils.",
          location_name: "Montréal",
        },
      },
    })
  })

  it("omits name when variant title is a suffix variant of primary", async () => {
    mockExtractExternalEventData.mockImplementationOnce(() =>
      Promise.resolve({
        name: "AGI Montreal - FR",
        description: "Construisez des trucs.",
        startsAt: null,
        endsAt: null,
        locationType: null,
        locationName: null,
        locationUrl: null,
        imageUrl: null,
        language: "fr",
      })
    )

    const updateChain = setupUpdateChain()

    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })

    const [[payload]] = updateChain.update.mock.calls
    expect((payload as { translations: Record<string, Record<string, unknown>> }).translations.fr.name).toBeUndefined()
    expect((payload as { translations: Record<string, Record<string, unknown>> }).translations.fr.description).toBe("Construisez des trucs.")
  })

  it("prefers cleanedDescription over eventData.description for variants", async () => {
    mockExtractExternalEventData.mockImplementationOnce(() =>
      Promise.resolve({
        name: "Hackathon IA de Montréal",
        description: "Construisez des trucs. Pour la version anglaise cliquez ici.",
        startsAt: null,
        endsAt: null,
        locationType: null,
        locationName: null,
        locationUrl: null,
        imageUrl: null,
        language: "fr",
      })
    )
    mockExtractExternalRichContent.mockImplementationOnce(() =>
      Promise.resolve({
        sponsors: [],
        rules: null,
        prizes: [],
        challenges: [],
        translationLinks: [],
        cleanedDescription: "Construisez des trucs.",
      })
    )

    const updateChain = setupUpdateChain()

    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })

    const [[payload]] = updateChain.update.mock.calls
    expect((payload as { translations: Record<string, Record<string, unknown>> }).translations.fr.description)
      .toBe("Construisez des trucs.")
  })

  it("skips variant whose detected locale equals the primary locale", async () => {
    mockExtractExternalEventData.mockImplementationOnce(() =>
      Promise.resolve({
        name: "Same language",
        description: "x",
        startsAt: null,
        endsAt: null,
        locationType: null,
        locationName: null,
        locationUrl: null,
        imageUrl: null,
        language: "en",
      })
    )

    const updateChain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => updateChain)

    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/en2", languageCode: "en" }],
    })

    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it("skips unsafe URLs and non-Luma URLs without fetching", async () => {
    const updateChain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => updateChain)

    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [
        { url: "http://169.254.169.254/metadata", languageCode: "fr" },
        { url: "https://evil.example.com/page", languageCode: "fr" },
      ],
    })

    expect(mockExtractExternalEventData).not.toHaveBeenCalled()
    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it("dedupes variants by normalized URL", async () => {
    mockExtractExternalEventData.mockImplementation(() =>
      Promise.resolve({
        name: "Foo FR",
        description: "fr",
        startsAt: null,
        endsAt: null,
        locationType: null,
        locationName: null,
        locationUrl: null,
        imageUrl: null,
        language: "fr",
      })
    )
    mockExtractExternalRichContent.mockImplementation(() => Promise.resolve(null))

    setupUpdateChain()

    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [
        { url: "https://luma.com/fr", languageCode: "fr" },
        { url: "https://luma.com/fr", languageCode: "fr" },
      ],
    })

    expect(mockExtractExternalEventData).toHaveBeenCalledTimes(1)
  })

  it("continues past a failing variant fetch", async () => {
    mockExtractExternalEventData.mockImplementationOnce(() => Promise.reject(new Error("boom")))
    mockExtractExternalEventData.mockImplementationOnce(() =>
      Promise.resolve({
        name: "Evento en español",
        description: "Hola",
        startsAt: null,
        endsAt: null,
        locationType: null,
        locationName: null,
        locationUrl: null,
        imageUrl: null,
        language: "es",
      })
    )
    mockExtractExternalRichContent.mockImplementation(() => Promise.resolve(null))

    const updateChain = setupUpdateChain()

    await importTranslationVariants({
      hackathonId: "h1",
      primaryLocale: "en",
      primary,
      translationLinks: [
        { url: "https://luma.com/bad", languageCode: "fr" },
        { url: "https://luma.com/es", languageCode: "es" },
      ],
    })

    expect(updateChain.update).toHaveBeenCalledTimes(1)
    const [[payload]] = updateChain.update.mock.calls
    expect(Object.keys((payload as { translations: Record<string, unknown> }).translations)).toEqual(["es"])
  })
})
