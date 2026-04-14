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

const { createHackathonFromImport, createPrizesFromImport, createChallengesFromImport } = await import("@/lib/services/luma-import-create")

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
