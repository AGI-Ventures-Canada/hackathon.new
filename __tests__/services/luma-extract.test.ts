import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test"

const mockExtract = mock(() =>
  Promise.resolve({
    results: [
      {
        url: "https://luma.com/test-hackathon",
        title: "Test Hackathon",
        rawContent: "# Test Hackathon\n\n## Sponsors\n- Acme Corp (Gold)\n- Beta Inc\n\n## Rules\nNo plagiarism. Teams of 1-4.\n\n## Prizes\n- Grand Prize: $5,000\n- Best Design: MacBook Pro",
      },
    ],
    failedResults: [],
    responseTime: 1.5,
    requestId: "req-1",
  })
)

mock.module("@tavily/core", () => ({
  tavily: () => ({ extract: mockExtract }),
}))

const mockGenerateObject = mock(() =>
  Promise.resolve({
    object: {
      sponsors: [
        { name: "Acme Corp", tier: "gold" as const },
        { name: "Beta Inc", tier: null },
      ],
      rules: "No plagiarism. Teams of 1-4.",
      prizes: [
        { name: "Grand Prize", description: null, value: "$5,000" },
        { name: "Best Design", description: null, value: "MacBook Pro" },
      ],
      challenges: [
        {
          title: "AI for Healthcare",
          description: "Improve patient triage.",
          resources: [{ label: "Dataset", url: "https://example.com/data.csv" }],
        },
        {
          title: "Climate Track",
          description: null,
          resources: [],
        },
      ],
    },
  })
)

mock.module("ai", () => ({
  generateObject: mockGenerateObject,
}))

mock.module("@/lib/ai/anthropic", () => ({
  anthropic: () => "mock-model",
  anthropicProvider: () => "mock-provider",
  SUPPORTED_MODELS: {},
  getDefaultModel: () => "claude-haiku-4-5-20251001",
  isValidModel: () => true,
  getModelConfig: () => ({}),
}))

const { extractEventPageRichContent, extractLumaRichContent } = await import("@/lib/services/luma-extract")

describe("extractLumaRichContent", () => {
  beforeEach(() => {
    mockExtract.mockClear()
    mockGenerateObject.mockClear()
    process.env.TAVILY_API_KEY = "test-key"
  })

  afterEach(() => {
    delete process.env.TAVILY_API_KEY
  })

  it("extracts sponsors, rules, prizes, and challenges from page content", async () => {
    const result = await extractLumaRichContent("test-hackathon")

    expect(result).not.toBeNull()
    expect(result!.sponsors).toHaveLength(2)
    expect(result!.sponsors[0].name).toBe("Acme Corp")
    expect(result!.sponsors[0].tier).toBe("gold")
    expect(result!.sponsors[1].name).toBe("Beta Inc")
    expect(result!.sponsors[1].tier).toBeNull()
    expect(result!.rules).toBe("No plagiarism. Teams of 1-4.")
    expect(result!.prizes).toHaveLength(2)
    expect(result!.prizes[0].name).toBe("Grand Prize")
    expect(result!.prizes[0].value).toBe("$5,000")
    expect(result!.challenges).toHaveLength(2)
    expect(result!.challenges[0].title).toBe("AI for Healthcare")
    expect(result!.challenges[0].description).toBe("Improve patient triage.")
    expect(result!.challenges[0].resources).toEqual([
      { label: "Dataset", url: "https://example.com/data.csv" },
    ])
    expect(result!.challenges[1].title).toBe("Climate Track")
    expect(result!.challenges[1].resources).toEqual([])
  })

  it("returns null when TAVILY_API_KEY is not set", async () => {
    delete process.env.TAVILY_API_KEY

    const result = await extractLumaRichContent("test")

    expect(result).toBeNull()
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it("returns null when Tavily extraction fails", async () => {
    mockExtract.mockRejectedValueOnce(new Error("Network error"))

    const result = await extractLumaRichContent("test")

    expect(result).toBeNull()
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })

  it("returns null when Tavily returns no results", async () => {
    mockExtract.mockResolvedValueOnce({
      results: [],
      failedResults: [{ url: "https://luma.com/test", error: "Not found" }],
      responseTime: 0.5,
      requestId: "req-2",
    })

    const result = await extractLumaRichContent("test")

    expect(result).toBeNull()
  })

  it("returns null when Tavily returns empty content", async () => {
    mockExtract.mockResolvedValueOnce({
      results: [{ url: "https://luma.com/test", title: null, rawContent: "" }],
      failedResults: [],
      responseTime: 0.5,
      requestId: "req-3",
    })

    const result = await extractLumaRichContent("test")

    expect(result).toBeNull()
  })

  it("returns null when LLM extraction fails", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("LLM error"))

    const result = await extractLumaRichContent("test")

    expect(result).toBeNull()
  })

  it("passes correct URL to Tavily", async () => {
    await extractLumaRichContent("my-event/sub-path")

    expect(mockExtract).toHaveBeenCalledWith(
      ["https://luma.com/my-event/sub-path"],
      expect.objectContaining({ extractDepth: "advanced", format: "markdown" })
    )
  })

  it("supports arbitrary event page URLs", async () => {
    await extractEventPageRichContent("eventbrite.com/e/test-event")

    expect(mockExtract).toHaveBeenCalledWith(
      ["https://eventbrite.com/e/test-event"],
      expect.objectContaining({ extractDepth: "advanced", format: "markdown" })
    )
  })

  it("passes page content to generateObject", async () => {
    await extractLumaRichContent("test-hackathon")

    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        maxOutputTokens: 2048,
        prompt: expect.stringContaining("# Test Hackathon"),
      })
    )
  })
})
