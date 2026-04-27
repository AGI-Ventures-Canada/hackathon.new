import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
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
  createAgendaFromImport,
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

describe("createAgendaFromImport", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("is a no-op when items is empty", async () => {
    const chain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => chain)

    await createAgendaFromImport("h1", [])

    expect(chain.delete).not.toHaveBeenCalled()
    expect(chain.insert).not.toHaveBeenCalled()
  })

  it("is a no-op when no item has a startsAt", async () => {
    const chain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => chain)

    await createAgendaFromImport("h1", [
      { title: "Untimed session", startsAt: null, speakers: [] },
    ])

    expect(chain.delete).not.toHaveBeenCalled()
    expect(chain.insert).not.toHaveBeenCalled()
  })

  it("deletes auto-seeded defaults with id NOT IN inserted ids", async () => {
    const chains: ReturnType<typeof createChainableMock>[] = []
    let idCounter = 1
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          description: null,
          starts_at: "2026-05-10T09:00:00-04:00",
          ends_at: null,
          location: null,
          sort_order: 0,
          trigger_type: null,
          linked_to: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport("h1", [
      { title: "Kickoff", startsAt: "2026-05-10T09:00:00-04:00", speakers: [] },
    ])

    const insertChain = chains.find((c) => (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0)
    expect(insertChain).toBeDefined()
    expect(insertChain!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        hackathon_id: "h1",
        title: "Kickoff",
        sort_order: 0,
      })
    )

    const deleteChain = chains.find((c) => (c.delete as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0)
    expect(deleteChain).toBeDefined()
    expect(deleteChain!.eq).toHaveBeenCalledWith("hackathon_id", "h1")
    expect(deleteChain!.is).toHaveBeenCalledWith("trigger_type", null)
    expect(deleteChain!.not).toHaveBeenCalledWith("id", "in", "(imp-1)")
  })

  it("rolls back partial inserts when any insert fails", async () => {
    let callCount = 0
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      callCount++
      const chain =
        callCount === 1
          ? createChainableMock({
              data: {
                id: "imp-1",
                hackathon_id: "h1",
                title: "x",
                description: null,
                starts_at: "",
                ends_at: null,
                location: null,
                sort_order: 0,
                trigger_type: null,
                linked_to: null,
                created_at: "",
                updated_at: "",
              },
              error: null,
            })
          : callCount === 2
            ? createChainableMock({ data: null, error: { message: "insert failed" } })
            : createChainableMock({ data: null, error: null })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport("h1", [
      { title: "Kickoff", startsAt: "2026-05-10T09:00:00-04:00", speakers: [] },
      { title: "Panel", startsAt: "2026-05-10T10:00:00-04:00", speakers: [] },
    ])

    const rollbackChain = chains.find(
      (c) => (c.delete as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0
    )
    expect(rollbackChain).toBeDefined()
    expect(rollbackChain!.eq).toHaveBeenCalledWith("hackathon_id", "h1")
    expect(rollbackChain!.in).toHaveBeenCalledWith("id", ["imp-1"])
    expect(rollbackChain!.is).not.toHaveBeenCalledWith("trigger_type", null)
  })

  it("does not call delete when the very first insert fails (no partial rows)", async () => {
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({ data: null, error: { message: "insert failed" } })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport("h1", [
      { title: "Kickoff", startsAt: "2026-05-10T09:00:00-04:00", speakers: [] },
    ])

    for (const chain of chains) {
      expect(chain.delete).not.toHaveBeenCalled()
    }
  })

  it("anchors Jan-1 fallback dates to the hackathon's start date, keeping time of day", async () => {
    let idCounter = 1
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          description: null,
          starts_at: "",
          ends_at: null,
          location: null,
          sort_order: 0,
          trigger_type: null,
          linked_to: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport(
      "h1",
      [
        {
          title: "Breakfast",
          startsAt: "2026-01-01T07:00:00-04:00",
          endsAt: "2026-01-01T08:00:00-04:00",
          speakers: [],
        },
      ],
      "2026-05-14T09:00:00-04:00"
    )

    const insertChain = chains.find(
      (c) => (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0
    )
    expect(insertChain!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Breakfast",
        starts_at: "2026-05-14T07:00:00-04:00",
        ends_at: "2026-05-14T08:00:00-04:00",
      })
    )
  })

  it("borrows the event's timezone offset when the item has none", async () => {
    let idCounter = 1
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          description: null,
          starts_at: "",
          ends_at: null,
          location: null,
          sort_order: 0,
          trigger_type: null,
          linked_to: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport(
      "h1",
      [
        {
          title: "Doors Open",
          startsAt: "2026-05-14T08:30:00",
          endsAt: "2026-05-14T09:00:00",
          speakers: [],
        },
      ],
      "2026-05-14T09:00:00-04:00"
    )

    const insertChain = chains.find(
      (c) => (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0
    )
    expect(insertChain!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        starts_at: "2026-05-14T08:30:00-04:00",
        ends_at: "2026-05-14T09:00:00-04:00",
      })
    )
  })

  it("attaches the event's offset when anchoring Jan-1 fallbacks without an offset", async () => {
    let idCounter = 1
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          description: null,
          starts_at: "",
          ends_at: null,
          location: null,
          sort_order: 0,
          trigger_type: null,
          linked_to: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport(
      "h1",
      [
        {
          title: "Breakfast",
          startsAt: "1970-01-01T07:00:00",
          speakers: [],
        },
      ],
      "2026-05-14T09:00:00-04:00"
    )

    const insertChain = chains.find(
      (c) => (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0
    )
    expect(insertChain!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        starts_at: "2026-05-14T07:00:00-04:00",
      })
    )
  })

  it("leaves dates within the event window untouched", async () => {
    let idCounter = 1
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          description: null,
          starts_at: "",
          ends_at: null,
          location: null,
          sort_order: 0,
          trigger_type: null,
          linked_to: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport(
      "h1",
      [
        {
          title: "Day 2 Lunch",
          startsAt: "2026-05-15T12:00:00-04:00",
          speakers: [],
        },
      ],
      "2026-05-14T09:00:00-04:00"
    )

    const insertChain = chains.find(
      (c) => (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0
    )
    expect(insertChain!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        starts_at: "2026-05-15T12:00:00-04:00",
      })
    )
  })

  it("caps imported items at the max", async () => {
    let idCounter = 1
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          description: null,
          starts_at: "",
          ends_at: null,
          location: null,
          sort_order: 0,
          trigger_type: null,
          linked_to: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      })
      chains.push(chain)
      return chain
    })

    const oversized = Array.from({ length: 75 }, (_, i) => ({
      title: `Item ${i}`,
      startsAt: "2026-05-10T09:00:00-04:00",
      speakers: [],
    }))

    await createAgendaFromImport("h1", oversized)

    const insertCount = chains.reduce(
      (sum, c) => sum + (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length,
      0
    )
    expect(insertCount).toBe(50)
  })

  it("skips items without startsAt but still imports the rest", async () => {
    const chain = createChainableMock({
      data: { id: "s1", hackathon_id: "h1", title: "x", starts_at: "", created_at: "", updated_at: "" },
      error: null,
    })
    setMockFromImplementation(() => chain)

    await createAgendaFromImport("h1", [
      { title: "No time", startsAt: null, speakers: [] },
      {
        title: "Has time",
        startsAt: "2026-05-10T10:00:00-04:00",
        speakers: [],
      },
    ])

    expect(chain.insert).toHaveBeenCalledTimes(1)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Has time",
        sort_order: 0,
      })
    )
  })

  it("prepends speakers into the description", async () => {
    const chain = createChainableMock({
      data: { id: "s1", hackathon_id: "h1", title: "x", starts_at: "", created_at: "", updated_at: "" },
      error: null,
    })
    setMockFromImplementation(() => chain)

    await createAgendaFromImport("h1", [
      {
        title: "Keynote",
        description: "The future of AI.",
        startsAt: "2026-05-10T09:00:00-04:00",
        speakers: ["Alice Smith", "Bob Jones"],
      },
      {
        title: "Speakers only",
        description: null,
        startsAt: "2026-05-10T10:00:00-04:00",
        speakers: ["Carol Lee"],
      },
    ])

    expect(chain.insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        description: "Speakers: Alice Smith, Bob Jones\n\nThe future of AI.",
      })
    )
    expect(chain.insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        description: "Speakers: Carol Lee",
      })
    )
  })

  it("does not throw when the cleanup delete errors after a successful insert", async () => {
    let idCounter = 1
    let callCount = 0
    setMockFromImplementation(() => {
      callCount++
      if (callCount === 1) {
        return createChainableMock({
          data: {
            id: `imp-${idCounter++}`,
            hackathon_id: "h1",
            title: "x",
            description: null,
            starts_at: "",
            ends_at: null,
            location: null,
            sort_order: 0,
            trigger_type: null,
            linked_to: null,
            created_at: "",
            updated_at: "",
          },
          error: null,
        })
      }
      return createChainableMock({ data: null, error: { message: "permission denied" } })
    })

    await expect(
      createAgendaFromImport("h1", [
        { title: "Kickoff", startsAt: "2026-05-10T09:00:00-04:00", speakers: [] },
      ])
    ).resolves.toBeUndefined()
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

  type RpcCall = { fn: string; params: Record<string, unknown> }
  let rpcCalls: RpcCall[]

  function captureRpc() {
    rpcCalls = []
    setMockRpcImplementation((fn, params) => {
      rpcCalls.push({ fn, params: params as Record<string, unknown> })
      return Promise.resolve({ data: null, error: null })
    })
    setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
  }

  beforeEach(() => {
    resetSupabaseMocks()
    mockExtractExternalEventData.mockReset()
    mockExtractExternalRichContent.mockReset()
    mockExtractExternalEventData.mockImplementation(() => Promise.resolve(null))
    mockExtractExternalRichContent.mockImplementation(() => Promise.resolve(null))
    captureRpc()
  })

  it("no-op when translationLinks is empty", async () => {
    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [],
    })

    expect(mockExtractExternalEventData).not.toHaveBeenCalled()
    expect(rpcCalls).toHaveLength(0)
  })

  it("calls the upsert RPC per locale with tenant scoping", async () => {
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

    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe("upsert_hackathon_translation")
    expect(rpcCalls[0].params).toEqual({
      p_hackathon_id: "h1",
      p_tenant_id: "t1",
      p_locale: "fr",
      p_fields: {
        name: "Hackathon IA de Montréal",
        description: "Construisez des trucs.",
        rules: "Soyez gentils.",
        location_name: "Montréal",
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

    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })

    const fields = rpcCalls[0].params.p_fields as Record<string, unknown>
    expect(fields.name).toBeUndefined()
    expect(fields.description).toBe("Construisez des trucs.")
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

    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })

    const fields = rpcCalls[0].params.p_fields as Record<string, unknown>
    expect(fields.description).toBe("Construisez des trucs.")
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

    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/en2", languageCode: "en" }],
    })

    expect(rpcCalls).toHaveLength(0)
  })

  it("skips unsafe URLs and non-Luma URLs without fetching", async () => {
    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [
        { url: "http://169.254.169.254/metadata", languageCode: "fr" },
        { url: "https://evil.example.com/page", languageCode: "fr" },
      ],
    })

    expect(mockExtractExternalEventData).not.toHaveBeenCalled()
    expect(rpcCalls).toHaveLength(0)
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

    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
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

    await importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [
        { url: "https://luma.com/bad", languageCode: "fr" },
        { url: "https://luma.com/es", languageCode: "es" },
      ],
    })

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].params.p_locale).toBe("es")
  })
})
