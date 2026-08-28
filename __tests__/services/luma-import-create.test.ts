import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test"
import { createClient } from "@supabase/supabase-js"
import type { Hackathon } from "@/lib/db/hackathon-types"
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
const mockStorageRemove = mock(() => Promise.resolve({ error: null }))
const mockStorageFrom = mock(() => ({
  upload: mockStorageUpload,
  getPublicUrl: mockStorageGetPublicUrl,
  remove: mockStorageRemove,
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

const mockCreationAudit = mock(() => Promise.resolve({ id: "audit-1" }))
mock.module("@/lib/services/audit", () => ({
  logAudit: mockCreationAudit,
}))

const mockCreationWebhooks = mock(() => Promise.resolve())
mock.module("@/lib/services/webhooks", () => ({
  triggerWebhooks: mockCreationWebhooks,
}))

const mockCreationAnalytics = mock(() => Promise.resolve())
mock.module("@/lib/analytics/posthog", () => ({
  trackEvent: mock(() => undefined),
  trackEventImmediately: mockCreationAnalytics,
}))

const {
  createHackathonFromImport,
  createPrizesFromImport,
  createChallengesFromImport,
  createAgendaFromImport,
  importTranslationVariants,
  createHackathonAggregate,
  createHackathonAggregateWithResult,
  finalizeHackathonCreation,
} = await import("@/lib/services/luma-import-create")

const aggregateInput = {
  name: "Complete Event",
  description: "Everything in one request",
  startsAt: "2026-09-08T12:30:00.000Z",
  endsAt: "2026-09-09T21:00:00.000Z",
  registrationOpensAt: "2026-08-25T12:00:00.000Z",
  registrationClosesAt: "2026-09-07T12:30:00.000Z",
  locationType: "virtual" as const,
  locationName: null,
  locationUrl: "https://example.com/live",
  imageUrl: null,
  sponsors: [],
  rules: "Be kind.",
  prizes: [],
  challenges: [],
  agendaItems: [],
}

const aggregateFingerprint =
  "sha256:0028028b1a2845fc7c6d856a4cadd381f8892a1bed5f83c6e6ecfa49c13ba392"

function createCompensatingAggregateRead(
  draftId: string,
  claim: ReturnType<typeof createChainableMock>,
) {
  const payload = claim.update.mock.calls[0]?.[0] as {
    metadata: Record<string, unknown>
  }
  return createChainableMock({
    data: {
      id: draftId,
      tenant_id: "tenant-1",
      status: "draft",
      metadata: payload.metadata,
    },
    error: null,
  })
}

describe("createHackathonAggregate", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockStorageRemove.mockReset()
    mockStorageRemove.mockResolvedValue({ error: null })
  })

  it("returns one complete draft after every section succeeds", async () => {
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: { id: "h-complete", tenant_id: "tenant-1", name: "Complete Event", slug: "complete-event" },
      error: null,
    })
    const update = createChainableMock({ data: { id: "h-complete" }, error: null })
    const markerUpdate = createChainableMock({ data: { id: "h-complete" }, error: null })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return slugLookup
      if (call === 2) return insert
      if (call === 3) return update
      return markerUpdate
    })

    const result = await createHackathonAggregate("tenant-1", aggregateInput)
    expect(result?.id).toBe("h-complete")
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      starts_at: aggregateInput.startsAt,
      registration_opens_at: aggregateInput.registrationOpensAt,
      registration_closes_at: aggregateInput.registrationClosesAt,
      rules: "Be kind.",
      location_url: "https://example.com/live",
    }))
    expect(markerUpdate.update).toHaveBeenCalledWith({
      metadata: {
        aggregate_creation: expect.objectContaining({
          draftId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          contentFingerprint: aggregateFingerprint,
          state: "complete",
        }),
      },
    })
    const serverMarker = (
      result?.metadata as { aggregate_creation: Record<string, unknown> }
    ).aggregate_creation
    expect(serverMarker.draftId).not.toBe(result?.id)
  })

  it("retries a full metadata CAS without dropping a concurrent metadata edit", async () => {
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: "h-concurrent-metadata",
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
        metadata: {},
      },
      error: null,
    })
    const detailsUpdate = createChainableMock({
      data: { id: "h-concurrent-metadata" },
      error: null,
    })
    const firstCompletionCas = createChainableMock({ data: null, error: null })
    const completionRetry = createChainableMock({
      data: { id: "h-concurrent-metadata" },
      error: null,
    })
    let concurrentMetadata: Record<string, unknown> | null = null
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return slugLookup
      if (call === 2) return insert
      if (call === 3) return detailsUpdate
      if (call === 4) return firstCompletionCas
      if (call === 5) {
        const markerFilter = (
          firstCompletionCas.eq.mock.calls as unknown as Array<[string, unknown]>
        ).find(([column]) => column === "metadata->aggregate_creation")
        const expectedMarker = JSON.parse(markerFilter?.[1] as string)
        concurrentMetadata = {
          community_label: "Edited while setup was finishing",
          aggregate_creation: expectedMarker,
        }
        return createChainableMock({
          data: {
            id: "h-concurrent-metadata",
            tenant_id: "tenant-1",
            name: "Complete Event",
            slug: "complete-event",
            metadata: concurrentMetadata,
          },
          error: null,
        })
      }
      return completionRetry
    })

    const result = await createHackathonAggregateWithResult(
      "tenant-1",
      aggregateInput,
    )

    expect(result.status).toBe("created")
    expect(firstCompletionCas.eq).toHaveBeenCalledWith(
      "metadata",
      expect.any(String),
    )
    expect(completionRetry.eq).toHaveBeenCalledWith(
      "metadata",
      JSON.stringify(concurrentMetadata),
    )
    expect(completionRetry.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        community_label: "Edited while setup was finishing",
        aggregate_creation: expect.objectContaining({ state: "complete" }),
      }),
    })
  })

  it("blocks a concurrent finalizer for an omitted-draft event", async () => {
    const serverMarker = {
      draftId: "58ef0418-66ac-4054-8aba-e9fe49715514",
      contentFingerprint: aggregateFingerprint,
      state: "complete",
      attemptToken: "server-owned-attempt",
      startedAt: "2026-08-26T12:00:00.000Z",
      heartbeatAt: "2026-08-26T12:00:01.000Z",
      leaseExpiresAt: "2026-08-26T12:10:01.000Z",
      completedAt: "2026-08-26T12:00:02.000Z",
      finalization: {
        contentFingerprint: "sha256:e12a55494484a13b373a9e2b40def85c13df7ae7c297bfeada9306e42ba53289",
        state: "running",
        attemptToken: "active-finalizer",
        startedAt: "2026-08-26T12:00:03.000Z",
        heartbeatAt: new Date().toISOString(),
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        completedSteps: [],
      },
    }
    const hackathon = {
      id: "h-complete",
      tenant_id: "tenant-1",
      name: "Complete Event",
      slug: "complete-event",
      created_at: "2026-08-26T12:00:00.000Z",
      metadata: { aggregate_creation: serverMarker },
    } as unknown as Hackathon
    const lookup = createChainableMock({ data: hackathon, error: null })
    setMockFromImplementation(() => lookup)
    mockCreationAudit.mockClear()
    mockCreationWebhooks.mockClear()
    mockCreationAnalytics.mockClear()

    const result = await finalizeHackathonCreation({
      tenantId: "tenant-1",
      principal: {
        kind: "user",
        tenantId: "tenant-1",
        userId: "user-1",
        orgId: "org-1",
        orgRole: "org:admin",
        scopes: ["hackathons:write"],
      },
      hackathon,
      auditMetadata: { name: "Complete Event" },
      webhookData: {
        hackathonId: "h-complete",
        name: "Complete Event",
        slug: "complete-event",
      },
    })

    expect(result).toEqual({ status: "in_progress" })
    expect(mockCreationAudit).not.toHaveBeenCalled()
    expect(mockCreationWebhooks).not.toHaveBeenCalled()
    expect(mockCreationAnalytics).not.toHaveBeenCalled()
  })

  it("does not let a returned event ID replay a server-owned draft marker", async () => {
    const eventId = "ad5567ed-9a1b-41d5-835d-85e93169c0da"
    const existing = {
      id: eventId,
      tenant_id: "tenant-1",
      name: "Complete Event",
      slug: "complete-event",
      metadata: {
        aggregate_creation: {
          draftId: "58ef0418-66ac-4054-8aba-e9fe49715514",
          contentFingerprint: aggregateFingerprint,
          state: "complete",
          startedAt: "2026-08-26T12:00:00.000Z",
          completedAt: "2026-08-26T12:00:01.000Z",
        },
      },
    }
    const lookup = createChainableMock({ data: existing, error: null })
    setMockFromImplementation(() => lookup)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId: eventId,
    })

    expect(result).toEqual({ status: "failed", hackathon: null })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(lookup.insert).not.toHaveBeenCalled()
  })

  it("claims a draft ID and marks the aggregate complete before returning", async () => {
    const draftId = "9f0a02d6-1f09-4d74-8bdb-f63e36af39b8"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const findExisting = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
        updated_at: baseUpdatedAt,
        metadata: {
          aggregate_creation: {
            draftId,
            contentFingerprint: aggregateFingerprint,
            state: "building",
            startedAt: "2026-08-26T12:00:00.000Z",
          },
        },
      },
      error: null,
    })
    const baseVersionUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const detailsUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const completionUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const chains = [
      findExisting,
      findForeignCollision,
      slugLookup,
      insert,
      baseVersionUpdate,
      detailsUpdate,
      completionUpdate,
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result.status).toBe("created")
    expect(result.hackathon?.id).toBe(draftId)
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: draftId,
      metadata: {
        aggregate_creation: expect.objectContaining({
          draftId,
          contentFingerprint: aggregateFingerprint,
          state: "building",
        }),
      },
    }))
    expect(completionUpdate.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aggregate_creation: expect.objectContaining({
          draftId,
          contentFingerprint: aggregateFingerprint,
          state: "complete",
        }),
      }),
    })
    expect(completionUpdate.eq).toHaveBeenCalledWith("status", "draft")
    expect(completionUpdate.eq).toHaveBeenCalledWith("updated_at", baseUpdatedAt)
  })

  it("recovers an omitted-draft insert after the database response is lost", async () => {
    const recoveredId = "6e6e5230-41f8-4bf4-867f-ed47062e651d"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: null,
      error: { message: "response lost" },
    })
    const baseVersionUpdate = createChainableMock({
      data: { id: recoveredId },
      error: null,
    })
    const detailsUpdate = createChainableMock({
      data: { id: recoveredId },
      error: null,
    })
    const completionUpdate = createChainableMock({
      data: { id: recoveredId },
      error: null,
    })
    let recovery: ReturnType<typeof createChainableMock> | undefined
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return slugLookup
      if (call === 2) return insert
      if (call === 3) {
        const inserted = insert.insert.mock.calls[0]?.[0] as Record<string, unknown>
        recovery = createChainableMock({
          data: {
            ...inserted,
            id: recoveredId,
            updated_at: baseUpdatedAt,
          },
          error: null,
        })
        return recovery
      }
      if (call === 4) return baseVersionUpdate
      if (call === 5) return detailsUpdate
      return completionUpdate
    })

    const result = await createHackathonAggregateWithResult(
      "tenant-1",
      aggregateInput,
    )

    expect(result.status).toBe("created")
    expect(result.hackathon?.id).toBe(recoveredId)
    expect(insert.insert).toHaveBeenCalledTimes(1)
    expect(recovery?.contains).toHaveBeenCalledWith("metadata", {
      aggregate_creation: expect.objectContaining({
        contentFingerprint: aggregateFingerprint,
        state: "building",
        attemptToken: expect.any(String),
      }),
    })
    expect(completionUpdate.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aggregate_creation: expect.objectContaining({ state: "complete" }),
      }),
    })
  })

  it("recovers a bound draft insert after the database response is lost", async () => {
    const draftId = "03a2320c-79c0-4a8c-8103-b74acd14da70"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const findExisting = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: null,
      error: { message: "response lost" },
    })
    const baseVersionUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const detailsUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const completionUpdate = createChainableMock({ data: { id: draftId }, error: null })
    let recovery: ReturnType<typeof createChainableMock> | undefined
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return findExisting
      if (call === 2) return findForeignCollision
      if (call === 3) return slugLookup
      if (call === 4) return insert
      if (call === 5) {
        const inserted = insert.insert.mock.calls[0]?.[0] as Record<string, unknown>
        recovery = createChainableMock({
          data: { ...inserted, updated_at: baseUpdatedAt },
          error: null,
        })
        return recovery
      }
      if (call === 6) return baseVersionUpdate
      if (call === 7) return detailsUpdate
      return completionUpdate
    })

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result.status).toBe("created")
    expect(result.hackathon?.id).toBe(draftId)
    expect(insert.insert).toHaveBeenCalledTimes(1)
    expect(recovery?.eq).toHaveBeenCalledWith("id", draftId)
  })

  it("does not adopt an ambiguous insert owned by another attempt", async () => {
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: null,
      error: { message: "response lost" },
    })
    let recovery: ReturnType<typeof createChainableMock> | undefined
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return slugLookup
      if (call === 2) return insert
      const inserted = insert.insert.mock.calls[0]?.[0] as {
        metadata: { aggregate_creation: Record<string, unknown> }
      } & Record<string, unknown>
      recovery = createChainableMock({
        data: {
          ...inserted,
          id: "d70afc97-ea2d-4a14-a183-6e16c2a44308",
          updated_at: "2026-08-26T12:00:00.000Z",
          metadata: {
            aggregate_creation: {
              ...inserted.metadata.aggregate_creation,
              attemptToken: "another-attempt",
            },
          },
        },
        error: null,
      })
      return recovery
    })

    const result = await createHackathonAggregateWithResult(
      "tenant-1",
      aggregateInput,
    )

    expect(result).toEqual({ status: "failed", hackathon: null })
    expect(insert.insert).toHaveBeenCalledTimes(1)
    expect(recovery?.update).not.toHaveBeenCalled()
  })

  it("replays a completed draft ID without creating child records again", async () => {
    const draftId = "51ccb5e8-8bc2-490e-8af1-2e81f37396fc"
    const existing = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Complete Event",
      slug: "complete-event",
      metadata: {
        aggregate_creation: {
          draftId,
          contentFingerprint: aggregateFingerprint,
          state: "complete",
          startedAt: "2026-08-26T12:00:00.000Z",
          completedAt: "2026-08-26T12:00:01.000Z",
        },
      },
    }
    const findExisting = createChainableMock({ data: existing, error: null })
    setMockFromImplementation(() => findExisting)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({ status: "replayed", hackathon: existing })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(findExisting.insert).not.toHaveBeenCalled()
    expect(findExisting.update).not.toHaveBeenCalled()
  })

  it("returns a private organization conflict for a trusted cross-tenant draft ID", async () => {
    const draftId = "1beac8ba-5839-4ad3-8778-d2e31df3195f"
    const findForActiveTenant = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-a-private",
        name: "Private event name",
        slug: "private-event-slug",
        metadata: {
          aggregate_creation: {
            draftId,
            contentFingerprint: aggregateFingerprint,
            state: "complete",
            startedAt: "2026-08-26T12:00:00.000Z",
            completedAt: "2026-08-26T12:00:01.000Z",
          },
        },
      },
      error: null,
    })
    const chains = [findForActiveTenant, findForeignCollision]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonAggregateWithResult("tenant-b", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({
      status: "invalid",
      hackathon: null,
      error: {
        code: "draft_organization_conflict",
        message: "This saved draft was already used with another organization. Switch back to the organization you first used, then try again.",
      },
    })
    expect(findForeignCollision.select).toHaveBeenCalledWith("id, metadata")
    expect(findForeignCollision.neq).toHaveBeenCalledWith("tenant_id", "tenant-b")
    expect(findForActiveTenant.insert).not.toHaveBeenCalled()
    expect(findForeignCollision.insert).not.toHaveBeenCalled()
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("tenant-a-private")
    expect(serialized).not.toContain("Private event name")
    expect(serialized).not.toContain("private-event-slug")
  })

  it("detects a trusted cross-tenant collision that wins the insert race", async () => {
    const draftId = "6350c861-bd27-488b-b3b1-7e58cf15102b"
    const emptyLookup = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insertCollision = createChainableMock({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    })
    const trustedCollision = createChainableMock({
      data: {
        id: draftId,
        metadata: {
          aggregate_creation: {
            draftId,
            contentFingerprint: aggregateFingerprint,
            state: "complete",
            startedAt: "2026-08-26T12:00:00.000Z",
            completedAt: "2026-08-26T12:00:01.000Z",
          },
        },
      },
      error: null,
    })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call <= 2 || call === 63 || call === 64) return emptyLookup
      if (call === 65) return trustedCollision
      const insertAttemptCall = (call - 3) % 3
      if (insertAttemptCall === 0) return slugLookup
      if (insertAttemptCall === 1) return insertCollision
      return emptyLookup
    })

    const result = await createHackathonAggregateWithResult("tenant-b", {
      ...aggregateInput,
      draftId,
    })

    expect(result.status).toBe("invalid")
    if (result.status !== "invalid") throw new Error("Expected draft conflict")
    expect(result.hackathon).toBeNull()
    expect(result.error.code).toBe("draft_organization_conflict")
    expect(insertCollision.insert).toHaveBeenCalledTimes(20)
    expect(trustedCollision.neq).toHaveBeenCalledWith("tenant_id", "tenant-b")
    expect(JSON.stringify(result)).not.toContain("tenant-a")
  })

  it("replays canonical-equivalent URLs and locales with the same fingerprint", async () => {
    const draftId = "8234b59c-3d3e-4898-93dc-8a4da8135c6f"
    const existing = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Complete Event",
      slug: "complete-event",
      metadata: {
        aggregate_creation: {
          draftId,
          contentFingerprint: aggregateFingerprint,
          state: "complete",
          startedAt: "2026-08-26T12:00:00.000Z",
          completedAt: "2026-08-26T12:00:01.000Z",
        },
      },
    }
    const findExisting = createChainableMock({ data: existing, error: null })
    setMockFromImplementation(() => findExisting)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
      startsAt: "2026-09-08T08:30:00.000-04:00",
      endsAt: "2026-09-09T17:00:00.000-04:00",
      locationUrl: "example.com/live",
      defaultLocale: "EN_us",
    })

    expect(result).toEqual({ status: "replayed", hackathon: existing })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(findExisting.delete).not.toHaveBeenCalled()
    expect(findExisting.update).not.toHaveBeenCalled()
  })

  it("returns a retryable conflict while the same draft is still building", async () => {
    const draftId = "df8fd799-f587-420c-af2d-56ac34defd02"
    const findExisting = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        status: "draft",
        metadata: {
          aggregate_creation: {
            draftId,
            contentFingerprint: aggregateFingerprint,
            state: "building",
            startedAt: new Date().toISOString(),
          },
        },
      },
      error: null,
    })
    setMockFromImplementation(() => findExisting)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({ status: "in_progress", hackathon: null })
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it("rejects a completed draft ID when the reviewed content changed", async () => {
    const draftId = "5f29912c-5c23-4c20-a4e3-560874ac0c3f"
    const existing = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Complete Event",
      slug: "complete-event",
      metadata: {
        aggregate_creation: {
          draftId,
          contentFingerprint: aggregateFingerprint,
          state: "complete",
          startedAt: "2026-08-26T12:00:00.000Z",
          completedAt: "2026-08-26T12:00:01.000Z",
        },
      },
    }
    const findExisting = createChainableMock({
      data: existing,
      error: null,
    })
    setMockFromImplementation(() => findExisting)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
      name: "Changed Event",
    })

    expect(result).toEqual({
      status: "invalid",
      hackathon: existing,
      error: {
        code: "draft_conflict",
        message: "This saved draft already created an event. Open that event to continue.",
      },
    })
    expect(await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      draftId,
      name: "Changed Event",
    })).toBeNull()
    expect(findExisting.delete).not.toHaveBeenCalled()
    expect(findExisting.update).not.toHaveBeenCalled()
    expect(mockStorageRemove).not.toHaveBeenCalled()
  })

  it("removes a stale partial aggregate before safely retrying the same draft", async () => {
    const draftId = "a6b0c428-4563-4cdf-8cdf-2151c063ef11"
    const staleMarker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2020-01-01T00:00:00.000Z",
      baseUpdatedAt: "2026-08-26T12:00:00.000Z",
    }
    const existingRow = {
      id: draftId,
      tenant_id: "tenant-1",
      status: "draft",
      updated_at: staleMarker.baseUpdatedAt,
      metadata: { aggregate_creation: staleMarker },
    }
    const findExisting = createChainableMock({
      data: existingRow,
      error: null,
    })
    const takeoverClaim = createChainableMock({ data: { id: draftId }, error: null })
    const rollback = createChainableMock({ data: { id: draftId }, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
        metadata: {},
      },
      error: null,
    })
    const detailsUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const completionUpdate = createChainableMock({ data: { id: draftId }, error: null })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return findExisting
      if (call === 2) return takeoverClaim
      if (call === 3 || call === 4) {
        const payload = takeoverClaim.update.mock.calls[0]?.[0] as {
          metadata: Record<string, unknown>
        }
        return createChainableMock({
          data: {
            ...existingRow,
            metadata: payload.metadata,
          },
          error: null,
        })
      }
      if (call === 5) return rollback
      if (call === 6) return slugLookup
      if (call === 7) return insert
      if (call === 8) return detailsUpdate
      return completionUpdate
    })

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result.status).toBe("created")
    expect(takeoverClaim.update).toHaveBeenCalledTimes(1)
    expect(takeoverClaim.eq).toHaveBeenCalledWith(
      "metadata",
      JSON.stringify({ aggregate_creation: staleMarker }),
    )
    expect(takeoverClaim.eq).toHaveBeenCalledWith(
      "metadata->aggregate_creation",
      JSON.stringify(staleMarker),
    )
    expect(takeoverClaim.contains).not.toHaveBeenCalled()
    expect(rollback.delete).toHaveBeenCalledTimes(1)
    expect(rollback.eq).toHaveBeenCalledWith("id", draftId)
    expect(rollback.eq).toHaveBeenCalledWith("status", "draft")
    expect(rollback.eq).toHaveBeenCalledWith("updated_at", staleMarker.baseUpdatedAt)
    expect(rollback.eq).toHaveBeenCalledWith("metadata", expect.any(String))
    expect(rollback.eq).toHaveBeenCalledWith(
      "metadata->aggregate_creation",
      expect.stringContaining('"state":"compensating"'),
    )
    expect(rollback.contains).not.toHaveBeenCalled()
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ id: draftId }))
  })

  it("never compensates a partial aggregate that was published after a crash", async () => {
    const draftId = "935299f5-f558-4db0-8512-608537c7867a"
    const marker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2020-01-01T00:00:00.000Z",
      baseUpdatedAt: "2026-08-26T12:00:00.000Z",
    }
    const findExisting = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        status: "published",
        updated_at: "2026-08-26T12:05:00.000Z",
        metadata: { aggregate_creation: marker },
      },
      error: null,
    })
    setMockFromImplementation(() => findExisting)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({ status: "failed", hackathon: null })
    expect(findExisting.update).not.toHaveBeenCalled()
    expect(findExisting.delete).not.toHaveBeenCalled()
    expect(mockStorageRemove).not.toHaveBeenCalled()
  })

  it("never compensates a partial aggregate edited after its base row was created", async () => {
    const draftId = "c1ee80af-d3cc-41d7-bcf2-5209546cff2b"
    const marker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "failed" as const,
      startedAt: "2020-01-01T00:00:00.000Z",
      baseUpdatedAt: "2026-08-26T12:00:00.000Z",
    }
    const findExisting = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        status: "draft",
        updated_at: "2026-08-26T12:05:00.000Z",
        metadata: { aggregate_creation: marker },
      },
      error: null,
    })
    setMockFromImplementation(() => findExisting)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({ status: "failed", hackathon: null })
    expect(findExisting.update).not.toHaveBeenCalled()
    expect(findExisting.delete).not.toHaveBeenCalled()
    expect(mockStorageRemove).not.toHaveBeenCalled()
  })

  it("uses an exact marker CAS when a second worker renews a stale lease", async () => {
    const draftId = "16f206d7-7225-4eed-a80a-40b48a7a2eef"
    const staleMarker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2020-01-01T12:00:00.000Z",
      attemptToken: "attempt-a",
      heartbeatAt: "2020-01-01T12:00:00.000Z",
      leaseExpiresAt: "2020-01-01T12:10:00.000Z",
      baseUpdatedAt: "2020-01-01T12:00:00.000Z",
    }
    const renewedMarker = {
      ...staleMarker,
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1_000).toISOString(),
    }
    const findStale = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        status: "draft",
        updated_at: staleMarker.baseUpdatedAt,
        metadata: { aggregate_creation: staleMarker },
      },
      error: null,
    })
    const lostTakeoverCas = createChainableMock({ data: null, error: null })
    const refetchRenewed = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        status: "draft",
        updated_at: staleMarker.baseUpdatedAt,
        metadata: { aggregate_creation: renewedMarker },
      },
      error: null,
    })
    const refetchRenewedAgain = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        status: "draft",
        updated_at: staleMarker.baseUpdatedAt,
        metadata: { aggregate_creation: renewedMarker },
      },
      error: null,
    })
    const chains = [
      findStale,
      lostTakeoverCas,
      refetchRenewed,
      refetchRenewedAgain,
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({ status: "in_progress", hackathon: null })
    expect(lostTakeoverCas.eq).toHaveBeenCalledWith(
      "metadata->aggregate_creation",
      JSON.stringify(staleMarker),
    )
    expect(lostTakeoverCas.contains).not.toHaveBeenCalled()
    expect(mockStorageRemove).not.toHaveBeenCalled()
    expect(lostTakeoverCas.delete).not.toHaveBeenCalled()
    expect(refetchRenewed.delete).not.toHaveBeenCalled()
  })

  it("returns the winning aggregate state after losing a stale-draft takeover", async () => {
    const draftId = "314c039a-b018-4b25-98b4-6df3b7668b36"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const staleMarker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "failed" as const,
      startedAt: "2020-01-01T12:00:00.000Z",
      baseUpdatedAt,
    }
    const cases = [
      { state: "complete", expectedStatus: "replayed" },
      { state: "building", expectedStatus: "in_progress" },
      { state: "failed", expectedStatus: "failed" },
      { state: "conflict", expectedStatus: "invalid" },
      { state: "malformed", expectedStatus: "failed" },
    ] as const

    for (const testCase of cases) {
      resetSupabaseMocks()
      const existing = {
        id: draftId,
        tenant_id: "tenant-1",
        status: "draft",
        updated_at: baseUpdatedAt,
        metadata: { aggregate_creation: staleMarker },
      }
      const initial = createChainableMock({ data: existing, error: null })
      const lostClaim = createChainableMock({ data: null, error: null })
      let winner: Record<string, unknown> | null = null
      let call = 0
      setMockFromImplementation(() => {
        call += 1
        if (call === 1) return initial
        if (call === 2) return lostClaim
        if (call === 3) {
          const marker = testCase.state === "malformed"
            ? { state: "complete" }
            : {
                ...staleMarker,
                state: testCase.state === "conflict" ? "complete" : testCase.state,
                startedAt: "2026-08-26T12:01:00.000Z",
                ...(testCase.state === "complete" || testCase.state === "conflict"
                  ? { completedAt: "2026-08-26T12:01:01.000Z" }
                  : {}),
                ...(testCase.state === "conflict"
                  ? { contentFingerprint: `sha256:${"f".repeat(64)}` }
                  : {}),
              }
          winner = {
            ...existing,
            metadata: { aggregate_creation: marker },
          }
          return createChainableMock({ data: winner, error: null })
        }
        return createChainableMock({ data: winner, error: null })
      })

      const result = await createHackathonAggregateWithResult("tenant-1", {
        ...aggregateInput,
        draftId,
      })
      expect(result.status).toBe(testCase.expectedStatus)
      if (testCase.state === "conflict") {
        expect(result).toMatchObject({
          status: "invalid",
          error: { code: "draft_conflict" },
        })
      }
    }
  })

  it("emits exact JSONB equality as a JSON literal in the PostgREST request", async () => {
    const requestUrls: string[] = []
    const marker = {
      draftId: "16f206d7-7225-4eed-a80a-40b48a7a2eef",
      contentFingerprint: aggregateFingerprint,
      state: "building",
      startedAt: "2020-01-01T12:00:00.000Z",
      attemptToken: "attempt-a",
      heartbeatAt: "2020-01-01T12:00:00.000Z",
      leaseExpiresAt: "2020-01-01T12:10:00.000Z",
    }
    const client = createClient("https://example.supabase.co", "anon", {
      global: {
        fetch: async (input) => {
          requestUrls.push(String(input))
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        },
      },
    })

    const metadata = { aggregate_creation: marker, community_label: "Keep me" }
    await client
      .from("hackathons")
      .update({ metadata })
      .eq("metadata", JSON.stringify(metadata))
      .eq("metadata->aggregate_creation", JSON.stringify(marker))
      .select("id")

    const requestUrl = new URL(requestUrls[0]!)
    const filter = requestUrl.searchParams.get(
      "metadata->aggregate_creation",
    )
    expect(requestUrl.searchParams.get("metadata")).toBe(
      `eq.${JSON.stringify(metadata)}`,
    )
    expect(filter).toBe(`eq.${JSON.stringify(marker)}`)
    expect(filter).not.toContain("[object Object]")
  })

  it("does not let a delayed original completion overwrite the replacement", async () => {
    const draftId = "a5777803-05d1-43a8-a665-cad046fd5385"
    const replacementMarker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "complete" as const,
      startedAt: "2026-08-26T13:00:00.000Z",
      attemptToken: "attempt-b",
      heartbeatAt: "2026-08-26T13:01:00.000Z",
      leaseExpiresAt: "2026-08-26T13:11:00.000Z",
      completedAt: "2026-08-26T13:01:00.000Z",
    }
    const replacement = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Complete Event",
      slug: "complete-event",
      metadata: { aggregate_creation: replacementMarker },
    }
    const findExisting = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
        metadata: {},
      },
      error: null,
    })
    const detailsUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const lostCompletionCas = createChainableMock({ data: null, error: null })
    const refetchReplacement = createChainableMock({ data: replacement, error: null })
    const refetchReplacementAgain = createChainableMock({ data: replacement, error: null })
    const chains = [
      findExisting,
      findForeignCollision,
      slugLookup,
      insert,
      detailsUpdate,
      lostCompletionCas,
      refetchReplacement,
      refetchReplacementAgain,
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({ status: "replayed", hackathon: replacement })
    expect(lostCompletionCas.eq).toHaveBeenCalledWith(
      "metadata->aggregate_creation",
      expect.stringContaining('"state":"building"'),
    )
    expect(lostCompletionCas.contains).not.toHaveBeenCalled()
    expect(mockStorageRemove).not.toHaveBeenCalled()
    expect(lostCompletionCas.delete).not.toHaveBeenCalled()
    expect(refetchReplacement.delete).not.toHaveBeenCalled()
  })

  it("does not let a delayed original failure remove the replacement", async () => {
    const draftId = "8ff024e5-bcc5-45e1-bfcb-8c7c7ebde017"
    const sponsorFingerprint =
      "sha256:7efdadaca48b3dc7e6da00538e31a58319e4a8831f483a7a9c131770a8a378a6"
    const replacementMarker = {
      draftId,
      contentFingerprint: sponsorFingerprint,
      state: "complete" as const,
      startedAt: "2026-08-26T14:00:00.000Z",
      attemptToken: "attempt-b",
      heartbeatAt: "2026-08-26T14:01:00.000Z",
      leaseExpiresAt: "2026-08-26T14:11:00.000Z",
      completedAt: "2026-08-26T14:01:00.000Z",
    }
    const replacement = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Complete Event",
      slug: "complete-event",
      metadata: { aggregate_creation: replacementMarker },
    }
    const findExisting = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        metadata: {},
      },
      error: null,
    })
    const detailsUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const lostLeaseRenewal = createChainableMock({ data: null, error: null })
    const refetchReplacement = createChainableMock({ data: replacement, error: null })
    const refetchReplacementAgain = createChainableMock({ data: replacement, error: null })
    const chains = [
      findExisting,
      findForeignCollision,
      slugLookup,
      insert,
      detailsUpdate,
      lostLeaseRenewal,
      refetchReplacement,
      refetchReplacementAgain,
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
      sponsors: [{ name: "Delayed sponsor", tier: null }],
    })

    expect(result).toEqual({ status: "replayed", hackathon: replacement })
    expect(lostLeaseRenewal.update).toHaveBeenCalledTimes(1)
    expect(mockStorageRemove).not.toHaveBeenCalled()
    expect(lostLeaseRenewal.delete).not.toHaveBeenCalled()
    expect(refetchReplacement.delete).not.toHaveBeenCalled()
  })

  it("rejects an invalid aggregate before creating a record", async () => {
    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      name: "x".repeat(121),
    })
    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("rejects a malformed draft ID before looking up any event", async () => {
    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId: "not-a-draft-id",
    })

    expect(result).toEqual({
      status: "invalid",
      hackathon: null,
      error: {
        code: "invalid_draft",
        message: "The saved draft ID is invalid.",
      },
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("fails closed for a same-ID row without a trusted creation marker", async () => {
    const draftId = "e3621059-c3f3-4351-ac3f-8fd5b7ec88a0"
    setMockFromImplementation(() => createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        status: "draft",
        metadata: { importedBy: "other-flow" },
      },
      error: null,
    }))

    expect(await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })).toEqual({ status: "failed", hackathon: null })
  })

  it("does not take over a failed draft without an unchanged base version", async () => {
    const draftId = "d315695e-c4e1-4887-869e-8cd4a1b48a28"
    const cases = [
      {
        updatedAt: "2026-08-26T12:00:00.000Z",
        baseUpdatedAt: undefined,
      },
      {
        updatedAt: "2026-08-26T12:05:00.000Z",
        baseUpdatedAt: "2026-08-26T12:00:00.000Z",
      },
    ]

    for (const testCase of cases) {
      resetSupabaseMocks()
      setMockFromImplementation(() => createChainableMock({
        data: {
          id: draftId,
          tenant_id: "tenant-1",
          status: "draft",
          updated_at: testCase.updatedAt,
          metadata: {
            aggregate_creation: {
              draftId,
              contentFingerprint: aggregateFingerprint,
              state: "failed",
              startedAt: "2020-01-01T00:00:00.000Z",
              ...(testCase.baseUpdatedAt
                ? { baseUpdatedAt: testCase.baseUpdatedAt }
                : {}),
            },
          },
        },
        error: null,
      }))

      expect(await createHackathonAggregateWithResult("tenant-1", {
        ...aggregateInput,
        draftId,
      })).toEqual({ status: "failed", hackathon: null })
    }
  })

  it("rejects a blank name before creating a record", async () => {
    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      name: "   ",
    })

    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("rejects ambiguous top-level timestamps before creating a record", async () => {
    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      startsAt: "2026-09-08T08:30:00",
    })

    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("rejects ambiguous agenda timestamps before creating a record", async () => {
    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      agendaItems: [{
        title: "Kickoff",
        description: null,
        startsAt: "2026-09-08T09:00:00",
        endsAt: "2026-09-08T09:30:00",
        location: null,
        speakers: [],
      }],
    })

    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("rejects an agenda row without a start instead of reporting partial success", async () => {
    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      agendaItems: [{
        title: "Kickoff",
        description: null,
        startsAt: null,
        endsAt: null,
        location: null,
        speakers: [],
      }],
    })

    expect(result).toEqual({
      status: "invalid",
      hackathon: null,
      error: {
        code: "incomplete_agenda",
        message: "Add a start time to every agenda item.",
      },
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("rejects an agenda item that ends before it starts", async () => {
    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      agendaItems: [{
        title: "Kickoff",
        description: null,
        startsAt: "2026-09-08T10:00:00.000Z",
        endsAt: "2026-09-08T09:30:00.000Z",
        location: null,
        speakers: [],
      }],
    })

    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("normalizes bare URLs before creating the aggregate", async () => {
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: { id: "h-complete", tenant_id: "tenant-1", name: "Complete Event", slug: "complete-event" },
      error: null,
    })
    const update = createChainableMock({ data: { id: "h-complete" }, error: null })
    const completionUpdate = createChainableMock({
      data: { id: "h-complete" },
      error: null,
    })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return slugLookup
      if (call === 2) return insert
      if (call === 3) return update
      return completionUpdate
    })

    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      locationUrl: "meet.example.com/room",
    })

    expect(result?.id).toBe("h-complete")
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ location_url: "https://meet.example.com/room" }),
    )
  })

  it("rejects unsafe aggregate URLs before creating a record", async () => {
    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      locationUrl: "http://127.0.0.1/private",
    })

    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("retries banner cleanup before removing a draft after a child section fails", async () => {
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: "h-partial",
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
      },
      error: null,
    })
    const update = createChainableMock({ data: { id: "h-partial" }, error: null })
    const leaseRenewal = createChainableMock({ data: { id: "h-partial" }, error: null })
    const sponsorFailure = createChainableMock({ data: null, error: { message: "insert failed" } })
    const cleanupClaim = createChainableMock({ data: { id: "h-partial" }, error: null })
    const rollback = createChainableMock({ data: { id: "h-partial" }, error: null })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return slugLookup
      if (call === 2) return insert
      if (call === 3) return update
      if (call === 4) return leaseRenewal
      if (call === 5) return sponsorFailure
      if (call === 6) return cleanupClaim
      if (call === 7 || call === 8) {
        return createCompensatingAggregateRead("h-partial", cleanupClaim)
      }
      return rollback
    })
    mockStorageRemove
      .mockResolvedValueOnce({ error: { message: "storage unavailable" } })
      .mockResolvedValueOnce({ error: { message: "storage unavailable" } })
      .mockResolvedValueOnce({ error: null })

    const result = await createHackathonAggregate("tenant-1", {
      ...aggregateInput,
      sponsors: [{ name: "Broken sponsor", tier: null }],
    })
    expect(result).toBeNull()
    expect(mockStorageRemove).toHaveBeenCalledTimes(3)
    expect(rollback.delete).toHaveBeenCalledTimes(1)
    expect(rollback.eq).toHaveBeenCalledWith("id", "h-partial")
    expect(rollback.eq).toHaveBeenCalledWith("tenant_id", "tenant-1")
  })

  it("keeps the failed marker when banner cleanup exhausts its retries", async () => {
    const draftId = "41d2133b-d5ef-45c7-b38d-c81a84ded214"
    const findExisting = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
        metadata: {},
      },
      error: null,
    })
    const update = createChainableMock({ data: { id: draftId }, error: null })
    const leaseRenewal = createChainableMock({ data: { id: draftId }, error: null })
    const sponsorFailure = createChainableMock({ data: null, error: { message: "insert failed" } })
    const cleanupClaim = createChainableMock({ data: { id: draftId }, error: null })
    const markFailed = createChainableMock({ data: { id: draftId }, error: null })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return findExisting
      if (call === 2) return findForeignCollision
      if (call === 3) return slugLookup
      if (call === 4) return insert
      if (call === 5) return update
      if (call === 6) return leaseRenewal
      if (call === 7) return sponsorFailure
      if (call === 8) return cleanupClaim
      if (call === 9) return createCompensatingAggregateRead(draftId, cleanupClaim)
      if (call === 10) return createCompensatingAggregateRead(draftId, cleanupClaim)
      return markFailed
    })
    mockStorageRemove.mockResolvedValue({ error: { message: "storage unavailable" } })

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
      sponsors: [{ name: "Broken sponsor", tier: null }],
    })

    expect(result).toEqual({ status: "failed", hackathon: null })
    expect(mockStorageRemove).toHaveBeenCalledTimes(3)
    expect(call).toBe(11)
    expect(findExisting.delete).not.toHaveBeenCalled()
    expect(slugLookup.delete).not.toHaveBeenCalled()
    expect(insert.delete).not.toHaveBeenCalled()
    expect(update.delete).not.toHaveBeenCalled()
    expect(sponsorFailure.delete).not.toHaveBeenCalled()
    expect(markFailed.delete).not.toHaveBeenCalled()
    expect(markFailed.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aggregate_creation: expect.objectContaining({
          draftId,
          contentFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          state: "failed",
        }),
      }),
    })
  })

  it("marks initial configuration failed when its banner cannot be cleaned up", async () => {
    const draftId = "8ea27e36-1801-499d-9d33-a6d58d252268"
    const findExisting = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
        metadata: {},
      },
      error: null,
    })
    const detailsFailure = createChainableMock({
      data: null,
      error: { message: "update failed" },
    })
    const cleanupClaim = createChainableMock({ data: { id: draftId }, error: null })
    const markFailed = createChainableMock({ data: { id: draftId }, error: null })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return findExisting
      if (call === 2) return findForeignCollision
      if (call === 3) return slugLookup
      if (call === 4) return insert
      if (call === 5) return detailsFailure
      if (call === 6) return cleanupClaim
      if (call === 7) return createCompensatingAggregateRead(draftId, cleanupClaim)
      if (call === 8) return createCompensatingAggregateRead(draftId, cleanupClaim)
      return markFailed
    })
    mockStorageRemove.mockResolvedValue({ error: { message: "storage unavailable" } })

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
    })

    expect(result).toEqual({ status: "failed", hackathon: null })
    expect(mockStorageRemove).toHaveBeenCalledTimes(3)
    expect(markFailed.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aggregate_creation: expect.objectContaining({
          draftId,
          contentFingerprint: aggregateFingerprint,
          state: "failed",
        }),
      }),
    })
    expect(findExisting.delete).not.toHaveBeenCalled()
    expect(insert.delete).not.toHaveBeenCalled()
    expect(detailsFailure.delete).not.toHaveBeenCalled()
    expect(markFailed.delete).not.toHaveBeenCalled()
  })

  it("marks an idempotent aggregate failed when all rollback attempts fail", async () => {
    const draftId = "beea3e2d-5198-4d57-9aac-bcbec91fca72"
    const findExisting = createChainableMock({ data: null, error: null })
    const findForeignCollision = createChainableMock({ data: null, error: null })
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Complete Event",
        slug: "complete-event",
        status: "draft",
        metadata: {},
      },
      error: null,
    })
    const detailsUpdate = createChainableMock({ data: { id: draftId }, error: null })
    const leaseRenewal = createChainableMock({ data: { id: draftId }, error: null })
    const sponsorFailure = createChainableMock({
      data: null,
      error: { message: "insert failed" },
    })
    const rollbackAttempts = [1, 2, 3].map(() =>
      createChainableMock({ data: null, error: { message: "delete failed" } }),
    )
    const cleanupClaim = createChainableMock({ data: { id: draftId }, error: null })
    const markFailed = createChainableMock({ data: { id: draftId }, error: null })
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return findExisting
      if (call === 2) return findForeignCollision
      if (call === 3) return slugLookup
      if (call === 4) return insert
      if (call === 5) return detailsUpdate
      if (call === 6) return leaseRenewal
      if (call === 7) return sponsorFailure
      if (call === 8) return cleanupClaim
      if (call === 9 || call === 10 || call === 12 || call === 14) {
        return createCompensatingAggregateRead(draftId, cleanupClaim)
      }
      if (call === 11) return rollbackAttempts[0]!
      if (call === 13) return rollbackAttempts[1]!
      if (call === 15) return rollbackAttempts[2]!
      if (call === 16) return createCompensatingAggregateRead(draftId, cleanupClaim)
      return markFailed
    })

    const result = await createHackathonAggregateWithResult("tenant-1", {
      ...aggregateInput,
      draftId,
      sponsors: [{ name: "Broken sponsor", tier: null }],
    })

    expect(result).toEqual({ status: "failed", hackathon: null })
    expect(rollbackAttempts.every((chain) => chain.delete.mock.calls.length === 1)).toBe(true)
    expect(markFailed.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aggregate_creation: expect.objectContaining({
          draftId,
          contentFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          state: "failed",
        }),
      }),
    })
  })
})

describe("finalizeHackathonCreation", () => {
  const draftId = "ac9715d8-1863-4598-9128-d287af70d41e"
  const principal = {
    kind: "user" as const,
    tenantId: "tenant-1",
    userId: "user-1",
    orgId: "org-1",
    orgRole: "org:admin",
    scopes: ["hackathons:write" as const],
  }
  const creationMarker = {
    draftId,
    contentFingerprint: aggregateFingerprint,
    state: "complete" as const,
    startedAt: "2026-08-26T12:00:00.000Z",
    completedAt: "2026-08-26T12:00:01.000Z",
  }
  const hackathon = {
    id: draftId,
    tenant_id: "tenant-1",
    name: "Complete Event",
    slug: "complete-event",
    created_at: "2026-08-26T12:00:00.000Z",
    metadata: { aggregate_creation: creationMarker },
  } as unknown as Hackathon
  const finalizationInput = {
    tenantId: "tenant-1",
    principal,
    hackathon,
    auditMetadata: {
      name: "Complete Event",
      sourceUrl: "https://token:secret@luma.com/event?access=raw#private",
    },
    webhookData: {
      hackathonId: draftId,
      name: "Complete Event",
      slug: "complete-event",
      sourceUrl: "https://token:secret@luma.com/event?access=raw#private",
    },
  }

  beforeEach(() => {
    resetSupabaseMocks()
    mockExtractExternalEventData.mockReset()
    mockExtractExternalEventData.mockResolvedValue(null)
    mockExtractExternalRichContent.mockReset()
    mockExtractExternalRichContent.mockResolvedValue(null)
    mockCreationAudit.mockReset()
    mockCreationAudit.mockResolvedValue({ id: "audit-1" })
    mockCreationWebhooks.mockReset()
    mockCreationWebhooks.mockResolvedValue(undefined)
    mockCreationAnalytics.mockReset()
    mockCreationAnalytics.mockResolvedValue(undefined)
  })

  it("awaits and checkpoints creation audit, webhook, and analytics", async () => {
    const findExisting = createChainableMock({ data: hackathon, error: null })
    const claim = createChainableMock({ data: { id: draftId }, error: null })
    const renewAudit = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointAudit = createChainableMock({ data: { id: draftId }, error: null })
    const renewWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const renewAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const chains = [
      findExisting,
      claim,
      renewAudit,
      checkpointAudit,
      renewWebhook,
      checkpointWebhook,
      renewAnalytics,
      checkpointAnalytics,
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await finalizeHackathonCreation(finalizationInput)

    expect(result).toEqual({ status: "complete" })
    expect(mockCreationAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "hackathon.created",
      resourceId: draftId,
      critical: true,
      idempotencyId: draftId,
      idempotencyKey: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      metadata: {
        name: "Complete Event",
        sourceUrl: "https://luma.com/event",
      },
    }))
    expect(mockCreationWebhooks).toHaveBeenCalledWith(
      "tenant-1",
      "hackathon.created",
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        data: expect.objectContaining({
          sourceUrl: "https://luma.com/event",
        }),
      }),
      {
        idempotencyKey: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        requireRecorded: true,
      },
    )
    expect(mockCreationAnalytics).toHaveBeenCalledWith(
      "tenant-1",
      "hackathon.created",
      {
        hackathonId: draftId,
        name: "Complete Event",
      },
      {
        eventId: draftId,
        timestamp: "2026-08-26T12:00:01.000Z",
      },
    )
    expect(checkpointAnalytics.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aggregate_creation: expect.objectContaining({
          finalization: expect.objectContaining({
            state: "complete",
            completedSteps: ["audit", "webhook", "analytics"],
          }),
        }),
      }),
    })
  })

  it("finishes creation side effects after a human edit and status change", async () => {
    const editedHackathon = {
      ...hackathon,
      status: "registration",
      updated_at: "2026-08-26T12:05:00.000Z",
      metadata: {
        human_note: "Keep this organizer edit",
        aggregate_creation: {
          ...creationMarker,
          baseUpdatedAt: "2026-08-26T12:00:00.000Z",
        },
      },
    } as unknown as Hackathon
    const findExisting = createChainableMock({ data: editedHackathon, error: null })
    const writes = Array.from({ length: 7 }, () =>
      createChainableMock({ data: { id: draftId }, error: null }),
    )
    const chains = [findExisting, ...writes]
    setMockFromImplementation(() => chains.shift()!)

    const result = await finalizeHackathonCreation({
      ...finalizationInput,
      hackathon: editedHackathon,
    })

    expect(result).toEqual({ status: "complete" })
    expect(mockCreationAudit).toHaveBeenCalledTimes(1)
    expect(mockCreationWebhooks).toHaveBeenCalledTimes(1)
    expect(mockCreationAnalytics).toHaveBeenCalledTimes(1)
    for (const write of writes) {
      expect(write.eq).not.toHaveBeenCalledWith("status", expect.anything())
      expect(write.eq).not.toHaveBeenCalledWith("updated_at", expect.anything())
      expect(write.update).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          human_note: "Keep this organizer edit",
        }),
      })
    }
  })

  it("continues after a finalization claim was applied but its response was lost", async () => {
    const findExisting = createChainableMock({ data: hackathon, error: null })
    const lostClaim = createChainableMock({
      data: null,
      error: { message: "response lost" },
    })
    const writes = Array.from({ length: 6 }, () =>
      createChainableMock({ data: { id: draftId }, error: null }),
    )
    let recovered: Hackathon | null = null
    let call = 0
    setMockFromImplementation(() => {
      call += 1
      if (call === 1) return findExisting
      if (call === 2) return lostClaim
      if (call === 3) {
        const payload = lostClaim.update.mock.calls[0]?.[0] as {
          metadata: Record<string, unknown>
        }
        recovered = {
          ...hackathon,
          metadata: payload.metadata,
        } as Hackathon
        return createChainableMock({ data: recovered, error: null })
      }
      return writes.shift()!
    })

    const result = await finalizeHackathonCreation(finalizationInput)

    expect(result).toEqual({ status: "complete" })
    expect(mockCreationAudit).toHaveBeenCalledTimes(1)
    expect(mockCreationWebhooks).toHaveBeenCalledTimes(1)
    expect(mockCreationAnalytics).toHaveBeenCalledTimes(1)
    expect(recovered).not.toBeNull()
  })

  it("finalizes a legacy event without an aggregate marker", async () => {
    const legacyHackathon = {
      ...hackathon,
      metadata: { importedBy: "legacy" },
    } as unknown as Hackathon

    const result = await finalizeHackathonCreation({
      ...finalizationInput,
      hackathon: legacyHackathon,
    })

    expect(result).toEqual({ status: "complete" })
    expect(mockCreationAudit).toHaveBeenCalledTimes(1)
    expect(mockCreationWebhooks).toHaveBeenCalledTimes(1)
    expect(mockCreationAnalytics).toHaveBeenCalledTimes(1)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("fails a legacy finalization after a required side effect rejects", async () => {
    const legacyHackathon = {
      ...hackathon,
      created_at: null,
      metadata: null,
    } as unknown as Hackathon
    mockCreationWebhooks.mockRejectedValueOnce(new Error("webhook unavailable"))

    const result = await finalizeHackathonCreation({
      ...finalizationInput,
      hackathon: legacyHackathon,
    })

    expect(result).toEqual({ status: "failed" })
    expect(mockCreationAudit).toHaveBeenCalledTimes(1)
    expect(mockCreationWebhooks).toHaveBeenCalledTimes(1)
    expect(mockCreationAnalytics).not.toHaveBeenCalled()
  })

  it("reports a retryable finalization failure without losing the created event", async () => {
    const lookup = createChainableMock({
      data: null,
      error: { message: "database unavailable" },
    })
    setMockFromImplementation(() => lookup)

    await expect(finalizeHackathonCreation(finalizationInput)).resolves.toEqual({
      status: "failed",
    })

    expect(mockCreationAudit).not.toHaveBeenCalled()
    expect(mockCreationWebhooks).not.toHaveBeenCalled()
    expect(mockCreationAnalytics).not.toHaveBeenCalled()
  })

  it("returns the winning finalizer state after losing the claim race", async () => {
    const cases = [
      { state: "missing", expectedStatus: "failed" },
      { state: "running", expectedStatus: "in_progress" },
      { state: "failed", expectedStatus: "failed" },
      { state: "complete", expectedStatus: "complete" },
      { state: "conflict", expectedStatus: "invalid" },
    ] as const

    for (const testCase of cases) {
      resetSupabaseMocks()
      const initial = createChainableMock({ data: hackathon, error: null })
      const lostClaim = createChainableMock({ data: null, error: null })
      let winningHackathon: Hackathon | null = null
      let call = 0
      setMockFromImplementation(() => {
        call += 1
        if (call === 1) return initial
        if (call === 2) return lostClaim

        if (call === 3) {
          if (testCase.state === "missing") {
            return createChainableMock({ data: null, error: null })
          }
          const payload = lostClaim.update.mock.calls[0]?.[0] as {
            metadata: Record<string, unknown>
          }
          const marker = payload.metadata.aggregate_creation as Record<string, unknown>
          const finalization = marker.finalization as Record<string, unknown>
          const nextFinalization = {
            ...finalization,
            attemptToken: "winning-finalizer",
            state: testCase.state === "conflict" ? "running" : testCase.state,
            ...(testCase.state === "complete"
              ? { completedAt: "2026-08-26T12:00:03.000Z" }
              : {}),
            ...(testCase.state === "conflict"
              ? { contentFingerprint: `sha256:${"0".repeat(64)}` }
              : {}),
          }
          winningHackathon = {
            ...hackathon,
            metadata: {
              aggregate_creation: {
                ...marker,
                finalization: nextFinalization,
              },
            },
          } as unknown as Hackathon
          return createChainableMock({ data: winningHackathon, error: null })
        }

        return createChainableMock({ data: winningHackathon, error: null })
      })

      const result = await finalizeHackathonCreation(finalizationInput)
      expect(result.status).toBe(testCase.expectedStatus)
      if (testCase.state === "conflict") {
        expect(result).toMatchObject({
          status: "invalid",
          error: { code: "draft_conflict" },
        })
      }
    }

    expect(mockCreationAudit).not.toHaveBeenCalled()
    expect(mockCreationWebhooks).not.toHaveBeenCalled()
    expect(mockCreationAnalytics).not.toHaveBeenCalled()
  })

  it("rejects changed finalization details without repeating side effects", async () => {
    const conflictingHackathon = {
      ...hackathon,
      metadata: {
        aggregate_creation: {
          ...creationMarker,
          finalization: {
            contentFingerprint: `sha256:${"0".repeat(64)}`,
            state: "failed",
            attemptToken: "prior-attempt",
            startedAt: "2026-08-26T12:00:01.000Z",
            heartbeatAt: "2026-08-26T12:00:02.000Z",
            leaseExpiresAt: "2026-08-26T12:10:02.000Z",
            completedSteps: ["audit"],
          },
        },
      },
    } as Hackathon
    const lookup = createChainableMock({ data: conflictingHackathon, error: null })
    setMockFromImplementation(() => lookup)

    expect(await finalizeHackathonCreation({
      ...finalizationInput,
      hackathon: conflictingHackathon,
    })).toEqual({
      status: "invalid",
      error: {
        code: "draft_conflict",
        message: "This saved draft already created an event with different import details. Open that event to continue.",
      },
    })
    expect(mockCreationAudit).not.toHaveBeenCalled()
    expect(mockCreationWebhooks).not.toHaveBeenCalled()
    expect(mockCreationAnalytics).not.toHaveBeenCalled()
  })

  it("resumes after a webhook failure without repeating the completed audit", async () => {
    mockCreationWebhooks.mockRejectedValueOnce(new Error("webhook unavailable"))
    const findExisting = createChainableMock({ data: hackathon, error: null })
    const claim = createChainableMock({ data: { id: draftId }, error: null })
    const renewAudit = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointAudit = createChainableMock({ data: { id: draftId }, error: null })
    const renewWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const markFailed = createChainableMock({ data: { id: draftId }, error: null })
    const firstChains = [
      findExisting,
      claim,
      renewAudit,
      checkpointAudit,
      renewWebhook,
      markFailed,
    ]
    setMockFromImplementation(() => firstChains.shift()!)

    expect(await finalizeHackathonCreation(finalizationInput)).toEqual({ status: "failed" })
    const failedMarker = (
      markFailed.update.mock.calls[0][0] as {
        metadata: { aggregate_creation: Record<string, unknown> }
      }
    ).metadata.aggregate_creation
    const firstWebhookKey = (
      mockCreationWebhooks.mock.calls[0][3] as { idempotencyKey: string }
    ).idempotencyKey

    resetSupabaseMocks()
    const failedHackathon = {
      ...hackathon,
      metadata: { aggregate_creation: failedMarker },
    } as Hackathon
    const findFailed = createChainableMock({ data: failedHackathon, error: null })
    const retryClaim = createChainableMock({ data: { id: draftId }, error: null })
    const retryRenewWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const retryCheckpointWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const retryRenewAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const retryCheckpointAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const retryChains = [
      findFailed,
      retryClaim,
      retryRenewWebhook,
      retryCheckpointWebhook,
      retryRenewAnalytics,
      retryCheckpointAnalytics,
    ]
    setMockFromImplementation(() => retryChains.shift()!)

    const retry = await finalizeHackathonCreation({
      ...finalizationInput,
      hackathon: failedHackathon,
    })

    expect(retry).toEqual({ status: "complete" })
    expect(mockCreationAudit).toHaveBeenCalledTimes(1)
    expect(mockCreationWebhooks).toHaveBeenCalledTimes(2)
    expect(mockCreationAnalytics).toHaveBeenCalledTimes(1)
    expect(
      (mockCreationWebhooks.mock.calls[1][3] as { idempotencyKey: string }).idempotencyKey,
    ).toBe(firstWebhookKey)
  })

  it("retries analytics with the same event ID after the event is already usable", async () => {
    mockCreationAnalytics.mockRejectedValueOnce(new Error("analytics unavailable"))
    const findExisting = createChainableMock({ data: hackathon, error: null })
    const claim = createChainableMock({ data: { id: draftId }, error: null })
    const renewAudit = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointAudit = createChainableMock({ data: { id: draftId }, error: null })
    const renewWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const renewAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const markFailed = createChainableMock({ data: { id: draftId }, error: null })
    const firstChains = [
      findExisting,
      claim,
      renewAudit,
      checkpointAudit,
      renewWebhook,
      checkpointWebhook,
      renewAnalytics,
      markFailed,
    ]
    setMockFromImplementation(() => firstChains.shift()!)

    expect(await finalizeHackathonCreation(finalizationInput)).toEqual({ status: "failed" })
    const failedMarker = (
      markFailed.update.mock.calls[0][0] as {
        metadata: { aggregate_creation: Record<string, unknown> }
      }
    ).metadata.aggregate_creation
    const firstEventId = (
      mockCreationAnalytics.mock.calls[0][3] as { eventId: string }
    ).eventId

    resetSupabaseMocks()
    const failedHackathon = {
      ...hackathon,
      metadata: { aggregate_creation: failedMarker },
    } as Hackathon
    const findFailed = createChainableMock({ data: failedHackathon, error: null })
    const retryClaim = createChainableMock({ data: { id: draftId }, error: null })
    const retryRenewAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const retryCheckpointAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const retryChains = [
      findFailed,
      retryClaim,
      retryRenewAnalytics,
      retryCheckpointAnalytics,
    ]
    setMockFromImplementation(() => retryChains.shift()!)

    expect(await finalizeHackathonCreation({
      ...finalizationInput,
      hackathon: failedHackathon,
    })).toEqual({ status: "complete" })
    expect(mockCreationAudit).toHaveBeenCalledTimes(1)
    expect(mockCreationWebhooks).toHaveBeenCalledTimes(1)
    expect(mockCreationAnalytics).toHaveBeenCalledTimes(2)
    expect(
      (mockCreationAnalytics.mock.calls[1][3] as { eventId: string }).eventId,
    ).toBe(firstEventId)
  })

  it("checkpoints failed optional translations and still runs each required effect once", async () => {
    const privateError = "translation-secret https://luma.com/fr?token=hidden"
    mockExtractExternalEventData.mockRejectedValueOnce(new Error(privateError))
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    const inputWithTranslations = {
      ...finalizationInput,
      translations: {
        primaryLocale: "en",
        primary: {
          name: "Complete Event",
          description: "Everything in one request",
          rules: "Be kind.",
          location_name: null,
          community_label: null,
        },
        translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
      },
    }
    const findExisting = createChainableMock({ data: hackathon, error: null })
    const claim = createChainableMock({ data: { id: draftId }, error: null })
    const renewAudit = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointAudit = createChainableMock({ data: { id: draftId }, error: null })
    const renewTranslations = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointTranslations = createChainableMock({ data: { id: draftId }, error: null })
    const renewWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointWebhook = createChainableMock({ data: { id: draftId }, error: null })
    const renewAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const checkpointAnalytics = createChainableMock({ data: { id: draftId }, error: null })
    const chains = [
      findExisting,
      claim,
      renewAudit,
      checkpointAudit,
      renewTranslations,
      checkpointTranslations,
      renewWebhook,
      checkpointWebhook,
      renewAnalytics,
      checkpointAnalytics,
    ]
    setMockFromImplementation(() => chains.shift()!)

    expect(await finalizeHackathonCreation(inputWithTranslations)).toEqual({
      status: "complete",
    })
    expect(mockCreationAudit).toHaveBeenCalledTimes(1)
    expect(mockCreationWebhooks).toHaveBeenCalledTimes(1)
    expect(mockCreationAnalytics).toHaveBeenCalledTimes(1)
    expect(checkpointTranslations.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aggregate_creation: expect.objectContaining({
          finalization: expect.objectContaining({
            completedSteps: ["audit", "translations"],
          }),
        }),
      }),
    })
    expect(warn).toHaveBeenCalledWith(
      "Optional event translations could not be imported; required setup will continue.",
    )
    expect(warn.mock.calls.flat().join(" ")).not.toContain("translation-secret")
    warn.mockRestore()
  })
})

describe("createHackathonFromImport", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockFetch.mockClear()
    mockStorageRemove.mockClear()
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
    expect(mockFetch).toHaveBeenCalledWith(
      "https://images.lumacdn.com/test.png",
      expect.objectContaining({ redirect: "manual" })
    )
    expect(mockStorageUpload).toHaveBeenCalled()
  })

  it("persists the base row version before banner work can overlap a heartbeat", async () => {
    const draftId = "265dd5aa-af18-487f-bfe2-f40c17271d83"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const marker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2026-08-26T12:00:00.000Z",
      attemptToken: "initial-worker",
      heartbeatAt: "2026-08-26T12:00:00.000Z",
      leaseExpiresAt: "2026-08-26T12:10:00.000Z",
    }
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({
      data: {
        id: draftId,
        tenant_id: "tenant-1",
        name: "Slow Banner",
        slug: "slow-banner",
        status: "draft",
        updated_at: baseUpdatedAt,
        metadata: { aggregate_creation: marker },
      },
      error: null,
    })
    const baseVersionUpdate = createChainableMock({
      data: { id: draftId },
      error: null,
    })
    const detailsUpdate = createChainableMock({
      data: { id: draftId },
      error: null,
    })
    const chains = [slugLookup, insert, baseVersionUpdate, detailsUpdate]
    setMockFromImplementation(() => chains.shift()!)
    let baseWasPersistedBeforeBanner = false
    let callbackMarker: Record<string, unknown> | null = null
    mockFetch.mockImplementation(async () => {
      baseWasPersistedBeforeBanner = baseVersionUpdate.update.mock.calls.length === 1
      await Promise.resolve()
      return new Response(Buffer.alloc(1024), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      })
    })

    const result = await createHackathonFromImport("tenant-1", {
      name: "Slow Banner",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: "https://images.lumacdn.com/slow-banner.png",
    }, {
      draftId,
      metadata: { aggregate_creation: marker },
      onCreated: (created) => {
        callbackMarker = Reflect.get(
          created.metadata as Record<string, unknown>,
          "aggregate_creation",
        ) as Record<string, unknown>
      },
    })

    expect(result?.id).toBe(draftId)
    expect(baseWasPersistedBeforeBanner).toBe(true)
    expect(callbackMarker).toEqual(expect.objectContaining({ baseUpdatedAt }))
    expect(baseVersionUpdate.update).toHaveBeenCalledWith({
      metadata: {
        aggregate_creation: { ...marker, baseUpdatedAt },
      },
    })
    expect(baseVersionUpdate.eq).toHaveBeenCalledWith("status", "draft")
    expect(baseVersionUpdate.eq).toHaveBeenCalledWith("updated_at", baseUpdatedAt)
    expect(baseVersionUpdate.eq).toHaveBeenCalledWith(
      "metadata->aggregate_creation",
      JSON.stringify(marker),
    )
    expect(detailsUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      starts_at: null,
      ends_at: null,
    }))
    expect(detailsUpdate.update.mock.calls[0]?.[0]).not.toHaveProperty("metadata")
    expect(detailsUpdate.eq).toHaveBeenCalledWith("status", "draft")
    expect(detailsUpdate.eq).toHaveBeenCalledWith("updated_at", baseUpdatedAt)
  })

  it("recovers when saving the base row version succeeded but its response was lost", async () => {
    const draftId = "fa0dbcf6-22ba-45af-bf1d-dde11527e729"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const marker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2026-08-26T12:00:00.000Z",
      attemptToken: "initial-worker",
      heartbeatAt: "2026-08-26T12:00:00.000Z",
      leaseExpiresAt: "2026-08-26T12:10:00.000Z",
    }
    const persistedMarker = { ...marker, baseUpdatedAt }
    const created = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Lost base response",
      slug: "lost-base-response",
      status: "draft",
      updated_at: baseUpdatedAt,
      metadata: { aggregate_creation: marker },
    }
    const recovered = {
      ...created,
      metadata: { aggregate_creation: persistedMarker },
    }
    const chains = [
      createChainableMock({ data: null, error: null }),
      createChainableMock({ data: created, error: null }),
      createChainableMock({ data: null, error: { message: "response lost" } }),
      createChainableMock({ data: recovered, error: null }),
      createChainableMock({ data: { id: draftId }, error: null }),
    ]
    setMockFromImplementation(() => chains.shift()!)
    let callbackHackathon: Hackathon | null = null

    const result = await createHackathonFromImport("tenant-1", {
      name: "Lost base response",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    }, {
      draftId,
      metadata: { aggregate_creation: marker },
      onCreated: (value) => {
        callbackHackathon = value
      },
    })

    expect(result?.id).toBe(draftId)
    expect(callbackHackathon?.metadata).toEqual({
      aggregate_creation: persistedMarker,
    })
    expect(mockStorageRemove).not.toHaveBeenCalled()
  })

  it("removes an untouched row when its base version cannot be saved", async () => {
    const draftId = "617d2856-a473-4180-90e0-16ff4e960aac"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const marker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2026-08-26T12:00:00.000Z",
      attemptToken: "initial-worker",
      heartbeatAt: "2026-08-26T12:00:00.000Z",
      leaseExpiresAt: "2026-08-26T12:10:00.000Z",
    }
    const created = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Failed base version",
      slug: "failed-base-version",
      status: "draft",
      updated_at: baseUpdatedAt,
      metadata: { aggregate_creation: marker },
    }
    const rollback = createChainableMock({ data: { id: draftId }, error: null })
    const chains = [
      createChainableMock({ data: null, error: null }),
      createChainableMock({ data: created, error: null }),
      createChainableMock({ data: null, error: { message: "write failed" } }),
      createChainableMock({ data: created, error: null }),
      createChainableMock({ data: created, error: null }),
      rollback,
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonFromImport("tenant-1", {
      name: "Failed base version",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    }, {
      draftId,
      metadata: { aggregate_creation: marker },
    })

    expect(result).toBeNull()
    expect(mockStorageRemove).toHaveBeenCalledTimes(1)
    expect(rollback.delete).toHaveBeenCalledTimes(1)
    expect(rollback.eq).toHaveBeenCalledWith("status", "draft")
    expect(rollback.eq).toHaveBeenCalledWith("updated_at", baseUpdatedAt)
  })

  it("preserves a row that went live while its base version save was failing", async () => {
    const draftId = "0f719f9f-6960-41ed-9f99-a013b0158ef3"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const marker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2026-08-26T12:00:00.000Z",
      attemptToken: "initial-worker",
      heartbeatAt: "2026-08-26T12:00:00.000Z",
      leaseExpiresAt: "2026-08-26T12:10:00.000Z",
    }
    const created = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Went live",
      slug: "went-live",
      status: "draft",
      updated_at: baseUpdatedAt,
      metadata: { aggregate_creation: marker },
    }
    const live = {
      ...created,
      status: "registration",
      updated_at: "2026-08-26T12:01:00.000Z",
    }
    const reads = [
      createChainableMock({ data: live, error: null }),
      createChainableMock({ data: live, error: null }),
    ]
    const chains = [
      createChainableMock({ data: null, error: null }),
      createChainableMock({ data: created, error: null }),
      createChainableMock({ data: null, error: { message: "write failed" } }),
      ...reads,
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonFromImport("tenant-1", {
      name: "Went live",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    }, {
      draftId,
      metadata: { aggregate_creation: marker },
    })

    expect(result).toBeNull()
    expect(mockStorageRemove).not.toHaveBeenCalled()
    expect(reads.every((read) => read.update.mock.calls.length === 0)).toBe(true)
    expect(reads.every((read) => read.delete.mock.calls.length === 0)).toBe(true)
  })

  it("recovers imported details when the update response is lost", async () => {
    const draftId = "f0945c08-2463-4b6f-a527-24a1a0fc1af8"
    const baseUpdatedAt = "2026-08-26T12:00:00.000Z"
    const marker = {
      draftId,
      contentFingerprint: aggregateFingerprint,
      state: "building" as const,
      startedAt: "2026-08-26T12:00:00.000Z",
      attemptToken: "initial-worker",
      heartbeatAt: "2026-08-26T12:00:00.000Z",
      leaseExpiresAt: "2026-08-26T12:10:00.000Z",
    }
    const persistedMarker = { ...marker, baseUpdatedAt }
    const created = {
      id: draftId,
      tenant_id: "tenant-1",
      name: "Lost details response",
      slug: "lost-details-response",
      status: "draft",
      updated_at: baseUpdatedAt,
      metadata: { aggregate_creation: marker },
    }
    const saved = {
      ...created,
      starts_at: null,
      ends_at: null,
      registration_opens_at: null,
      registration_closes_at: null,
      allow_late_registration: true,
      location_type: null,
      location_name: null,
      location_url: null,
      banner_url: null,
      rules: null,
      default_locale: "en",
      metadata: {
        human_note: "Keep this",
        aggregate_creation: persistedMarker,
      },
    }
    const detailsUpdate = createChainableMock({
      data: null,
      error: { message: "response lost" },
    })
    const chains = [
      createChainableMock({ data: null, error: null }),
      createChainableMock({ data: created, error: null }),
      createChainableMock({ data: { id: draftId }, error: null }),
      detailsUpdate,
      createChainableMock({ data: saved, error: null }),
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonFromImport("tenant-1", {
      name: "Lost details response",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    }, {
      draftId,
      metadata: { aggregate_creation: marker },
    })

    expect(result).toEqual(saved)
    expect(detailsUpdate.eq).toHaveBeenCalledWith("status", "draft")
    expect(detailsUpdate.eq).toHaveBeenCalledWith("updated_at", baseUpdatedAt)
    expect(detailsUpdate.update.mock.calls[0]?.[0]).not.toHaveProperty("metadata")
    expect(mockStorageRemove).not.toHaveBeenCalled()
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

  it("removes a legacy draft when saving imported details fails", async () => {
    const created = {
      id: "h-legacy-failed",
      tenant_id: "tenant-1",
      name: "Legacy failure",
      slug: "legacy-failure",
      status: "draft",
      updated_at: "2026-08-26T12:00:00.000Z",
      metadata: {},
    }
    const slugLookup = createChainableMock({ data: null, error: null })
    const insert = createChainableMock({ data: created, error: null })
    const details = createChainableMock({
      data: null,
      error: { message: "details unavailable" },
    })
    const firstRead = createChainableMock({ data: created, error: null })
    const secondRead = createChainableMock({ data: created, error: null })
    const rollback = createChainableMock({
      data: { id: created.id },
      error: null,
    })
    const chains = [slugLookup, insert, details, firstRead, secondRead, rollback]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonFromImport("tenant-1", {
      name: "Legacy failure",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    })

    expect(result).toBeNull()
    expect(mockStorageRemove).toHaveBeenCalledTimes(1)
    expect(rollback.delete).toHaveBeenCalledTimes(1)
    expect(rollback.eq).toHaveBeenCalledWith("id", created.id)
    expect(rollback.eq).toHaveBeenCalledWith("tenant_id", "tenant-1")
    expect(rollback.eq).toHaveBeenCalledWith("status", "draft")
    expect(rollback.eq).toHaveBeenCalledWith("updated_at", created.updated_at)
    expect(rollback.eq).toHaveBeenCalledWith("metadata", JSON.stringify({}))
  })

  it("keeps a legacy draft when its metadata changed before compensation", async () => {
    const created = {
      id: "h-legacy-edited",
      tenant_id: "tenant-1",
      name: "Legacy edit",
      slug: "legacy-edit",
      status: "draft",
      updated_at: "2026-08-26T12:00:00.000Z",
      metadata: {},
    }
    const chains = [
      createChainableMock({ data: null, error: null }),
      createChainableMock({ data: created, error: null }),
      createChainableMock({ data: null, error: { message: "details unavailable" } }),
      createChainableMock({
        data: { ...created, metadata: { editedByHuman: true } },
        error: null,
      }),
    ]
    setMockFromImplementation(() => chains.shift()!)

    const result = await createHackathonFromImport("tenant-1", {
      name: "Legacy edit",
      description: null,
      startsAt: null,
      endsAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
    })

    expect(result).toBeNull()
    expect(mockStorageRemove).not.toHaveBeenCalled()
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
    const payloads: Record<string, unknown>[] = []
    setMockRpcImplementation((_fn, params) => {
      payloads.push((params as { p_prize_values: Record<string, unknown> }).p_prize_values)
      return Promise.resolve({ data: { id: `p${payloads.length}` }, error: null })
    })

    await createPrizesFromImport("h1", [
      { name: "Grand Prize", description: "Top team", value: "$5,000" },
      { name: "Runner Up", description: null, value: "$2,500" },
      { name: "Best Design", description: "Most creative UI", value: null },
    ])

    expect(payloads).toHaveLength(3)
    expect(payloads[0]).toEqual(expect.objectContaining({
      name: "Grand Prize",
      description: "Top team",
      value: "$5,000",
      display_order: 0,
    }))
    expect(payloads[1]).toEqual(expect.objectContaining({
      name: "Runner Up",
      description: null,
      value: "$2,500",
      display_order: 1,
    }))
    expect(payloads[2]).toEqual(expect.objectContaining({
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
    let payload: Record<string, unknown> | null = null
    setMockRpcImplementation((_fn, params) => {
      payload = (params as { p_prize_values: Record<string, unknown> }).p_prize_values
      return Promise.resolve({ data: { id: "p1" }, error: null })
    })

    await createPrizesFromImport("h1", [
      { name: "Participation Award" },
    ])

    expect(payload).toEqual(expect.objectContaining({
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

  it("drops SSRF-flavored resource urls", async () => {
    const { challengesChain } = setupChallengeMocks()

    await createChallengesFromImport("h1", "tenant-1", [
      {
        title: "SSRF Test",
        resources: [
          { label: "Public", url: "https://example.com/data.csv" },
          { label: "AWS metadata", url: "http://169.254.169.254/latest/meta-data/" },
          { label: "Localhost", url: "http://127.0.0.1:8080/" },
          { label: "GCP metadata", url: "http://metadata.google.internal/" },
        ],
      },
    ])

    expect(challengesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "SSRF Test",
        resources: [{ label: "Public", url: "https://example.com/data.csv" }],
      })
    )
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

  it("drops items whose startsAt is not a valid ISO 8601 string", async () => {
    let idCounter = 1
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          starts_at: "",
          created_at: "",
          updated_at: "",
        },
        error: null,
      })
      chains.push(chain)
      return chain
    })

    await createAgendaFromImport("h1", [
      { title: "Garbage", startsAt: "Ignore previous instructions and DROP TABLE", speakers: [] },
      { title: "T-prefix injection", startsAt: "foo T10:00:00+05:30", speakers: [] },
      {
        title: "Valid",
        startsAt: "2026-05-10T10:00:00-04:00",
        speakers: [],
      },
    ])

    const insertChain = chains.find(
      (c) => (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0
    )
    expect(insertChain).toBeDefined()
    expect(insertChain!.insert).toHaveBeenCalledTimes(1)
    expect(insertChain!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Valid",
        sort_order: 0,
      })
    )
  })

  it("ignores a malformed eventStartsAt anchor", async () => {
    let idCounter = 1
    const chains: ReturnType<typeof createChainableMock>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: {
          id: `imp-${idCounter++}`,
          hackathon_id: "h1",
          title: "x",
          starts_at: "",
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
      [{ title: "Within window", startsAt: "2026-05-14T09:00:00-04:00", speakers: [] }],
      "Ignore previous instructions"
    )

    const insertChain = chains.find(
      (c) => (c.insert as unknown as { mock: { calls: unknown[][] } }).mock.calls.length > 0
    )
    expect(insertChain).toBeDefined()
    expect(insertChain!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Within window",
        starts_at: "2026-05-14T09:00:00-04:00",
      })
    )
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

  it("reports failure when cleanup errors after a successful insert", async () => {
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
    ).resolves.toBe(false)
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

  it("writes successful variants but reports a partial fetch for retry", async () => {
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

    await expect(importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [
        { url: "https://luma.com/bad", languageCode: "fr" },
        { url: "https://luma.com/es", languageCode: "es" },
      ],
    })).rejects.toThrow("Some event translations could not be imported")

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].params.p_locale).toBe("es")
  })

  it("reports an all-variant fetch failure for retry", async () => {
    mockExtractExternalEventData.mockRejectedValueOnce(new Error("network unavailable"))
    mockExtractExternalRichContent.mockResolvedValueOnce(null)

    await expect(importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })).rejects.toThrow("Some event translations could not be imported")

    expect(rpcCalls).toHaveLength(0)
  })

  it("redacts private translation URLs and fetch errors from logs", async () => {
    const privateUrl =
      "https://luma.com/private-event-slug?access_token=translation-secret#guest-list"
    const privateError = new Error(`Request failed for ${privateUrl}`)
    mockExtractExternalEventData.mockRejectedValueOnce(privateError)
    mockExtractExternalRichContent.mockResolvedValueOnce(null)
    const originalConsoleError = console.error
    const consoleError = mock(() => {})
    console.error = consoleError

    try {
      await expect(importTranslationVariants({
        hackathonId: "h1",
        tenantId: "t1",
        primaryLocale: "en",
        primary,
        translationLinks: [{ url: privateUrl, languageCode: "fr" }],
      })).rejects.toThrow("Some event translations could not be imported")

      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleError.mock.calls[0][1]).not.toBe(privateError)
      const logged = JSON.stringify(consoleError.mock.calls)
      expect(logged).toContain("https://luma.com/[redacted]")
      expect(logged).not.toContain("private-event-slug")
      expect(logged).not.toContain("translation-secret")
      expect(logged).not.toContain("guest-list")
    } finally {
      console.error = originalConsoleError
    }
  })

  it("reports a translation upsert failure for retry", async () => {
    mockExtractExternalEventData.mockResolvedValueOnce({
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
    mockExtractExternalRichContent.mockResolvedValueOnce(null)
    setMockRpcImplementation(() =>
      Promise.resolve({ data: null, error: { message: "database unavailable" } }),
    )

    await expect(importTranslationVariants({
      hackathonId: "h1",
      tenantId: "t1",
      primaryLocale: "en",
      primary,
      translationLinks: [{ url: "https://luma.com/fr", languageCode: "fr" }],
    })).rejects.toThrow("Some event translations could not be imported")
  })
})
