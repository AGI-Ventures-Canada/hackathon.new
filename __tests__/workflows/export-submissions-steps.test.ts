import { describe, it, expect, beforeEach, mock } from "bun:test"

const mockLoadExportPayload = mock(() => Promise.resolve(null as unknown))
const mockMarkExportProcessing = mock(() => Promise.resolve())
const mockMarkExportReady = mock(() => Promise.resolve())
const mockMarkExportFailed = mock(() => Promise.resolve())

function teamIdSet(payload: {
  submissions: { team?: { members: { clerkUserId: string }[] } | null }[]
}) {
  const ids = new Set<string>()
  for (const s of payload.submissions) {
    for (const m of s.team?.members ?? []) ids.add(m.clerkUserId)
  }
  return ids
}

mock.module("@/lib/services/submission-exports", () => ({
  loadExportPayload: mockLoadExportPayload,
  markExportProcessing: mockMarkExportProcessing,
  markExportReady: mockMarkExportReady,
  markExportFailed: mockMarkExportFailed,
  collectExportUserIds: (payload: Parameters<typeof teamIdSet>[0]) =>
    Array.from(teamIdSet(payload)),
}))

const mockResolveClerkUsers = mock(() =>
  Promise.resolve({
    displayNames: { u1: "Alice", u2: "Bob" },
    emails: { u1: "alice@x.com", u2: "bob@x.com" },
  })
)

mock.module("@/lib/services/clerk-users", () => ({
  resolveClerkUsers: mockResolveClerkUsers,
}))

const mockSendExportReadyEmail = mock(() =>
  Promise.resolve({ success: true })
)
const mockSendExportFailedEmail = mock(() =>
  Promise.resolve({ success: true })
)

mock.module("@/lib/email/submission-exports", () => ({
  sendExportReadyEmail: mockSendExportReadyEmail,
  sendExportFailedEmail: mockSendExportFailedEmail,
}))

const defaultLookup: () => Promise<{ data: unknown }> = () =>
  Promise.resolve({ data: null })

const fromImpl = mock(() => ({
  select: () => ({
    eq: () => ({
      maybeSingle: () => {
        const next = pendingFromCall.shift() ?? defaultLookup
        return next()
      },
    }),
  }),
}))

const pendingFromCall: Array<() => Promise<{ data: unknown }>> = []

mock.module("@/lib/db/client", () => ({
  supabase: () => ({ from: fromImpl, storage: { from: () => ({}) } }),
}))

const { loadExportData, finalizeExport, failExport, buildPdfScreenshotMap } =
  await import("@/lib/workflows/export-submissions/steps")

const { default: sharp } = await import("sharp")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const EXPORT_ID = "22222222-2222-2222-2222-222222222222"

const basePayload = {
  hackathon: {
    id: HACKATHON_ID,
    name: "Hack",
    slug: "hack",
    startsAt: null,
    endsAt: null,
  },
  filters: { winnersOnly: false, includeDrafts: false, includeJudgeNotes: true },
  generatedAt: "2026-01-01T00:00:00Z",
  submissions: [
    {
      id: "s1",
      title: "Proj",
      description: null,
      status: "submitted" as const,
      githubUrl: null,
      liveAppUrl: null,
      demoVideoUrl: null,
      screenshotUrl: null,
      createdAt: "2026-01-01T00:00:00Z",
      team: {
        id: "t1",
        name: "Team",
        members: [
          { clerkUserId: "u1", role: "participant" },
          { clerkUserId: "u2", role: "participant" },
        ],
      },
      result: null,
      prizes: [],
      scores: [],
      judgeNotes: [],
      socialSubmissions: [],
    },
  ],
}

function resetAllStepMocks() {
  mockLoadExportPayload.mockClear()
  mockMarkExportProcessing.mockClear()
  mockMarkExportReady.mockClear()
  mockMarkExportFailed.mockClear()
  mockResolveClerkUsers.mockClear()
  mockSendExportReadyEmail.mockClear()
  mockSendExportFailedEmail.mockClear()
  pendingFromCall.length = 0
}

describe("loadExportData", () => {
  beforeEach(resetAllStepMocks)

  it("marks processing, loads payload, and enriches with Clerk users", async () => {
    mockLoadExportPayload.mockImplementation(() => Promise.resolve(basePayload))

    const enriched = await loadExportData(EXPORT_ID)

    expect(mockMarkExportProcessing).toHaveBeenCalledWith(EXPORT_ID)
    expect(mockLoadExportPayload).toHaveBeenCalledWith(EXPORT_ID)
    expect(mockResolveClerkUsers).toHaveBeenCalledWith(["u1", "u2"])
    expect(enriched.users.u1?.name).toBe("Alice")
    expect(enriched.users.u1?.email).toBe("alice@x.com")
    expect(enriched.submissions).toHaveLength(1)
  })

  it("throws when the export row is missing", async () => {
    mockLoadExportPayload.mockImplementation(() => Promise.resolve(null))
    await expect(loadExportData(EXPORT_ID)).rejects.toThrow(/not found/)
  })

  it("nulls out Clerk-default user_ names so the JSON directory shows only emails", async () => {
    mockLoadExportPayload.mockImplementation(() => Promise.resolve(basePayload))
    mockResolveClerkUsers.mockImplementation(() =>
      Promise.resolve({
        displayNames: { u1: "Alice", u2: "user_2abc123XYZ" },
        emails: { u1: "alice@x.com", u2: "bob@x.com" },
      })
    )

    const enriched = await loadExportData(EXPORT_ID)
    expect(enriched.users.u1?.name).toBe("Alice")
    expect(enriched.users.u2?.name).toBeNull()
    expect(enriched.users.u2?.email).toBe("bob@x.com")
  })
})

describe("finalizeExport", () => {
  beforeEach(resetAllStepMocks)

  it("marks ready and sends the ready email to the requester", async () => {
    pendingFromCall.push(() =>
      Promise.resolve({ data: { requested_by_user_id: "u1" } })
    )

    await finalizeExport(
      EXPORT_ID,
      { storagePath: "h/x/f.zip", fileSizeBytes: 2048, submissionCount: 3 },
      { ...basePayload, users: { u1: { name: "Alice", email: "alice@x.com" } } }
    )

    expect(mockMarkExportReady).toHaveBeenCalledTimes(1)
    expect(mockSendExportReadyEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendExportReadyEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.to).toBe("alice@x.com")
    expect(arg.hackathonId).toBe(HACKATHON_ID)
    expect(arg.submissionCount).toBe(3)
    expect(arg.fileSizeBytes).toBe(2048)
  })

  it("skips the email when the requester has no email on file", async () => {
    pendingFromCall.push(() =>
      Promise.resolve({ data: { requested_by_user_id: "u_unknown" } })
    )

    await finalizeExport(
      EXPORT_ID,
      { storagePath: "h/x/f.zip", fileSizeBytes: 1, submissionCount: 0 },
      { ...basePayload, users: {} }
    )

    expect(mockMarkExportReady).toHaveBeenCalledTimes(1)
    expect(mockSendExportReadyEmail).not.toHaveBeenCalled()
  })
})

describe("buildPdfScreenshotMap", () => {
  async function makeWebp(): Promise<Buffer> {
    return sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 20, g: 90, b: 180 },
      },
    })
      .webp({ quality: 70 })
      .toBuffer()
  }

  it("converts webp screenshots to png keyed by submission id", async () => {
    const webp = await makeWebp()
    const map = await buildPdfScreenshotMap([
      { path: "media/sub-1/screenshot.webp", buffer: webp },
    ])

    expect(Object.keys(map)).toEqual(["sub-1"])
    expect(map["sub-1"]!.format).toBe("png")
    expect(map["sub-1"]!.data.subarray(1, 4).toString()).toBe("PNG")
  })

  it("ignores non-screenshot media (e.g. social OG images)", async () => {
    const webp = await makeWebp()
    const map = await buildPdfScreenshotMap([
      { path: "media/sub-1/social-1-og.webp", buffer: webp },
    ])
    expect(map).toEqual({})
  })

  it("skips screenshots that fail to decode without throwing", async () => {
    const map = await buildPdfScreenshotMap([
      { path: "media/sub-1/screenshot.webp", buffer: Buffer.from("not an image") },
    ])
    expect(map).toEqual({})
  })

  it("returns an empty map when there are no images", async () => {
    expect(await buildPdfScreenshotMap([])).toEqual({})
  })
})

describe("failExport", () => {
  beforeEach(resetAllStepMocks)

  it("marks failed and sends the failure email", async () => {
    pendingFromCall.push(() =>
      Promise.resolve({ data: { requested_by_user_id: "u1" } })
    )
    pendingFromCall.push(() =>
      Promise.resolve({ data: { hackathon: { name: "Hack", slug: "hack" } } })
    )

    await failExport(EXPORT_ID, "boom")

    expect(mockMarkExportFailed).toHaveBeenCalledWith(EXPORT_ID, "boom")
    expect(mockSendExportFailedEmail).toHaveBeenCalledTimes(1)
    const arg = mockSendExportFailedEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.errorMessage).toBe("boom")
    expect(arg.hackathonName).toBe("Hack")
  })

  it("sanitizes paths and URLs out of the error message", async () => {
    pendingFromCall.push(() =>
      Promise.resolve({ data: { requested_by_user_id: "u1" } })
    )
    pendingFromCall.push(() =>
      Promise.resolve({ data: { hackathon: { name: "Hack", slug: "hack" } } })
    )

    const raw =
      "Upload failed: /var/lib/internal/secret.zip then https://internal.host/path?x=1 timed out"
    await failExport(EXPORT_ID, raw)

    const storedArg = mockMarkExportFailed.mock.calls[0]!
    const storedMessage = storedArg[1] as string
    expect(storedMessage).not.toContain("/var/lib")
    expect(storedMessage).not.toContain("internal.host")
    expect(storedMessage).toContain("[path]")
    expect(storedMessage).toContain("[link]")

    const emailArg = mockSendExportFailedEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(emailArg.errorMessage).toBe(storedMessage)
  })

  it("truncates long error messages", async () => {
    pendingFromCall.push(() =>
      Promise.resolve({ data: { requested_by_user_id: "u1" } })
    )
    pendingFromCall.push(() =>
      Promise.resolve({ data: { hackathon: { name: "Hack", slug: "hack" } } })
    )

    const longMessage = "x".repeat(1000)
    await failExport(EXPORT_ID, longMessage)

    const storedMessage = mockMarkExportFailed.mock.calls[0]![1] as string
    expect(storedMessage.length).toBeLessThanOrEqual(240)
    expect(storedMessage.endsWith("…")).toBe(true)
  })

  it("skips email when requester has no email on file", async () => {
    pendingFromCall.push(() =>
      Promise.resolve({ data: { requested_by_user_id: "u_unknown" } })
    )

    await failExport(EXPORT_ID, "boom")

    expect(mockMarkExportFailed).toHaveBeenCalledTimes(1)
    expect(mockSendExportFailedEmail).not.toHaveBeenCalled()
  })
})


