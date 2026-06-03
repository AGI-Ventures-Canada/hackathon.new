import { describe, it, expect, beforeEach } from "bun:test"
import type { Hackathon } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  mockMultiTableQuery,
} from "../lib/supabase-mock"

const { getPublicHackathon, listPublicHackathons, getHackathonByIdForOrganizer, checkHackathonOrganizer, updateHackathonSettings, updateHackathonTranslation, deleteHackathon } = await import(
  "@/lib/services/public-hackathons"
)

const mockHackathon: Hackathon = {
  id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "22222222-2222-2222-2222-222222222222",
  name: "Test Hackathon",
  slug: "test-hackathon",
  description: "A test hackathon",
  rules: "Some rules",
  starts_at: "2026-02-15T09:00:00Z",
  ends_at: "2026-02-17T18:00:00Z",
  registration_opens_at: "2026-02-01T00:00:00Z",
  registration_closes_at: "2026-02-14T23:59:59Z",
  max_participants: 100,
  min_team_size: 1,
  max_team_size: 5,
  allow_solo: true,
  require_team_approval: false,
  status: "registration_open",
  banner_url: "https://example.com/banner.png",
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const mockOrganizer = {
  id: "t1",
  name: "Test Org",
  slug: "test-org",
  logo_url: null,
}

describe("Public Hackathons Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getPublicHackathon", () => {
    it("returns hackathon with organizer and sponsors", async () => {
      mockMultiTableQuery({
        hackathons: { data: { ...mockHackathon, organizer: mockOrganizer }, error: null },
        hackathon_sponsors: {
          data: [{
            id: "s1",
            name: "Sponsor",
            tier: "gold",
            sponsor_tenant_id: null,
            tenant_sponsor_id: null,
            use_org_assets: false,
            logo_url: null,
            logo_url_dark: null,
            website_url: null,
            display_order: 0,
            created_at: "2026-01-01T00:00:00Z",
            tenant: null,
          }],
          error: null,
        },
      })

      const result = await getPublicHackathon("test-hackathon")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Hackathon")
      expect(result?.organizer.name).toBe("Test Org")
      expect(result?.sponsors).toHaveLength(1)
    })

    it("returns null when hackathon not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Not found", code: "PGRST116" },
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicHackathon("nonexistent")

      expect(result).toBeNull()
    })
  })

  describe("listPublicHackathons", () => {
    it("returns list of public hackathons", async () => {
      const chain = createChainableMock({
        data: [{ ...mockHackathon, organizer: mockOrganizer }],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      const result = await listPublicHackathons()

      expect(result.hackathons).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.hackathons[0].name).toBe("Test Hackathon")
      expect(result.hackathons[0].organizer.name).toBe("Test Org")
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listPublicHackathons()

      expect(result).toEqual({ hackathons: [], total: 0 })
    })

    it("applies search filter when search option provided", async () => {
      const chain = createChainableMock({
        data: [{ ...mockHackathon, organizer: mockOrganizer }],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      const result = await listPublicHackathons({ search: "test" })

      expect(result.hackathons).toHaveLength(1)
      expect(chain.or).toHaveBeenCalled()
    })

    it("skips search filter for short queries", async () => {
      const chain = createChainableMock({
        data: [{ ...mockHackathon, organizer: mockOrganizer }],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      const result = await listPublicHackathons({ search: "a" })

      expect(result.hackathons).toHaveLength(1)
      expect(chain.or).not.toHaveBeenCalled()
    })

    it("sanitizes special characters in search", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
        count: 0,
      })
      setMockFromImplementation(() => chain)

      const result = await listPublicHackathons({ search: "%()" })

      expect(result).toEqual({ hackathons: [], total: 0 })
      expect(chain.or).not.toHaveBeenCalled()
    })

    it("paginates results with SQL-level limit/offset", async () => {
      const pageItems = Array.from({ length: 6 }, (_, i) => ({
        ...mockHackathon,
        id: `id-${i + 9}`,
        name: `Hackathon ${i + 9}`,
        organizer: mockOrganizer,
      }))
      const chain = createChainableMock({ data: pageItems, error: null, count: 15 })
      setMockFromImplementation(() => chain)

      const result = await listPublicHackathons({ page: 2, limit: 9 })

      expect(result.total).toBe(15)
      expect(result.hackathons).toHaveLength(6)
    })
  })

  describe("getHackathonByIdForOrganizer", () => {
    it("returns hackathon when tenant owns it", async () => {
      const chain = createChainableMock({
        data: mockHackathon,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getHackathonByIdForOrganizer("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Hackathon")
    })

    it("returns null when hackathon not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Not found" },
      })
      setMockFromImplementation(() => chain)

      const result = await getHackathonByIdForOrganizer("11111111-1111-1111-1111-111111111111", "wrong-tenant")

      expect(result).toBeNull()
    })
  })

  describe("checkHackathonOrganizer", () => {
    it("returns ok with hackathon when tenant owns it", async () => {
      const chain = createChainableMock({
        data: mockHackathon,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await checkHackathonOrganizer("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")

      expect(result.status).toBe("ok")
      if (result.status === "ok") {
        expect(result.hackathon.name).toBe("Test Hackathon")
      }
    })

    it("returns not_found when hackathon does not exist", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Not found", code: "PGRST116" },
      })
      setMockFromImplementation(() => chain)

      const result = await checkHackathonOrganizer("99999999-9999-9999-9999-999999999999", "22222222-2222-2222-2222-222222222222")

      expect(result.status).toBe("not_found")
    })

    it("returns not_found for non-UUID IDs like 'draft'", async () => {
      const result = await checkHackathonOrganizer("draft", "22222222-2222-2222-2222-222222222222")
      expect(result.status).toBe("not_found")
    })

    it("returns not_authorized when tenant does not own hackathon", async () => {
      const chain = createChainableMock({
        data: mockHackathon,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await checkHackathonOrganizer("11111111-1111-1111-1111-111111111111", "wrong-tenant")

      expect(result.status).toBe("not_authorized")
    })
  })

  describe("updateHackathonSettings", () => {
    it("updates hackathon settings successfully", async () => {
      const chain = createChainableMock({
        data: { ...mockHackathon, name: "Updated Hackathon" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateHackathonSettings("h1", "t1", {
        name: "Updated Hackathon",
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Updated Hackathon")
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updateHackathonSettings("h1", "t1", {
        name: "Test",
      })

      expect(result).toBeNull()
    })

    it("handles partial updates", async () => {
      const chain = createChainableMock({
        data: { ...mockHackathon, banner_url: "https://new.com/banner.png" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateHackathonSettings("h1", "t1", {
        bannerUrl: "https://new.com/banner.png",
      })

      expect(result?.banner_url).toBe("https://new.com/banner.png")
    })

    it("updates team and participant settings", async () => {
      const chain = createChainableMock({
        data: {
          ...mockHackathon,
          max_participants: 200,
          min_team_size: 2,
          max_team_size: 4,
          allow_solo: false,
          require_team_approval: true,
        },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateHackathonSettings("h1", "t1", {
        maxParticipants: 200,
        minTeamSize: 2,
        maxTeamSize: 4,
        allowSolo: false,
        requireTeamApproval: true,
      })

      expect(result).not.toBeNull()
      expect(result?.max_participants).toBe(200)
      expect(result?.min_team_size).toBe(2)
      expect(result?.max_team_size).toBe(4)
      expect(result?.allow_solo).toBe(false)
      expect(result?.require_team_approval).toBe(true)
    })

    it("moves waiting teams to forming and notifies their members when team review is turned off", async () => {
      const hackathonChain = createChainableMock({
        data: { ...mockHackathon, require_team_approval: false },
        error: null,
      })
      const teamsChain = createChainableMock({
        data: [
          { id: "team-1", name: "Alpha", hackathon_participants: [{ clerk_user_id: "u1" }] },
          { id: "team-2", name: "Beta", hackathon_participants: [] },
        ],
        error: null,
      })
      setMockFromImplementation((table) => {
        if (table === "hackathons") return hackathonChain
        if (table === "teams") return teamsChain
        return createChainableMock({ data: null, error: null })
      })

      const result = await updateHackathonSettings("h1", "t1", {
        requireTeamApproval: false,
      })

      expect(result?.require_team_approval).toBe(false)
      expect(teamsChain.select).toHaveBeenCalledWith(
        "id, name, hackathon_participants(clerk_user_id)"
      )
      expect(teamsChain.update).toHaveBeenCalledWith({ status: "forming" })
      expect(teamsChain.eq).toHaveBeenCalledWith("hackathon_id", "h1")
      expect(teamsChain.eq).toHaveBeenCalledWith("status", "pending_approval")
    })

    it("still returns the saved hackathon when waiting teams cannot be moved after team review is turned off", async () => {
      const hackathonChain = createChainableMock({
        data: { ...mockHackathon, require_team_approval: false },
        error: null,
      })
      const teamsChain = createChainableMock({ data: null, error: { message: "DB error" } })
      setMockFromImplementation((table) => {
        if (table === "hackathons") return hackathonChain
        if (table === "teams") return teamsChain
        return createChainableMock({ data: null, error: null })
      })

      const result = await updateHackathonSettings("h1", "t1", {
        requireTeamApproval: false,
      })

      expect(result?.require_team_approval).toBe(false)
    })

    it("skips the auto-promote notify step when there are no waiting teams", async () => {
      const hackathonChain = createChainableMock({
        data: { ...mockHackathon, require_team_approval: false },
        error: null,
      })
      const teamsChain = createChainableMock({ data: [], error: null })
      setMockFromImplementation((table) => {
        if (table === "hackathons") return hackathonChain
        if (table === "teams") return teamsChain
        return createChainableMock({ data: null, error: null })
      })

      const result = await updateHackathonSettings("h1", "t1", {
        requireTeamApproval: false,
      })

      expect(result?.require_team_approval).toBe(false)
      expect(teamsChain.update).toHaveBeenCalledWith({ status: "forming" })
    })

    it("sets maxParticipants to null for unlimited", async () => {
      const chain = createChainableMock({
        data: { ...mockHackathon, max_participants: null },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateHackathonSettings("h1", "t1", {
        maxParticipants: null,
      })

      expect(result?.max_participants).toBeNull()
    })

    it("updates judging mode", async () => {
      const chain = createChainableMock({
        data: { ...mockHackathon, judging_mode: "subjective" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateHackathonSettings("h1", "t1", {
        judgingMode: "subjective",
      })

      expect(result?.judging_mode).toBe("subjective")
    })
  })

  describe("deleteHackathon", () => {
    it("returns true on successful delete", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      const result = await deleteHackathon("h1", "t1")

      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({ data: null, error: { message: "DB error" } })
      setMockFromImplementation(() => chain)

      const result = await deleteHackathon("h1", "t1")

      expect(result).toBe(false)
    })

    it("filters by both hackathon id and tenant id", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      await deleteHackathon("h1", "t1")

      expect(chain.eq).toHaveBeenCalledWith("id", "h1")
      expect(chain.eq).toHaveBeenCalledWith("tenant_id", "t1")
    })
  })

  describe("updateHackathonTranslation", () => {
    it("calls the upsert RPC with the provided fields and returns the updated row", async () => {
      const updatedRow = { ...mockHackathon, translations: { fr: { name: "Nom" } } }
      const rpcCalls: { fn: string; params: unknown }[] = []
      setMockRpcImplementation((fn, params) => {
        rpcCalls.push({ fn, params })
        return Promise.resolve({ data: [updatedRow], error: null })
      })

      const result = await updateHackathonTranslation("h1", "t1", "fr", {
        name: "Nom",
        description: "Description",
      })

      expect(result).toEqual(updatedRow as unknown as Hackathon)
      expect(rpcCalls).toHaveLength(1)
      expect(rpcCalls[0].fn).toBe("upsert_hackathon_translation")
      expect(rpcCalls[0].params).toEqual({
        p_hackathon_id: "h1",
        p_tenant_id: "t1",
        p_locale: "fr",
        p_fields: { name: "Nom", description: "Description" },
      })
    })

    it("forwards null values so the RPC can delete that field", async () => {
      const rpcCalls: { params: unknown }[] = []
      setMockRpcImplementation((_fn, params) => {
        rpcCalls.push({ params })
        return Promise.resolve({ data: [mockHackathon], error: null })
      })

      await updateHackathonTranslation("h1", "t1", "fr", { description: null })

      expect((rpcCalls[0].params as { p_fields: unknown }).p_fields).toEqual({ description: null })
    })

    it("skips undefined fields", async () => {
      const rpcCalls: { params: unknown }[] = []
      setMockRpcImplementation((_fn, params) => {
        rpcCalls.push({ params })
        return Promise.resolve({ data: [mockHackathon], error: null })
      })

      await updateHackathonTranslation("h1", "t1", "fr", {
        name: "Nom",
        description: undefined,
      })

      expect((rpcCalls[0].params as { p_fields: Record<string, unknown> }).p_fields).toEqual({
        name: "Nom",
      })
    })

    it("returns null when the RPC returns an error", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({ data: null, error: { message: "db error" } })
      )

      const result = await updateHackathonTranslation("h1", "t1", "fr", { name: "Nom" })
      expect(result).toBeNull()
    })

    it("returns null when the RPC yields no rows", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: [], error: null }))

      const result = await updateHackathonTranslation("h1", "t1", "fr", { name: "Nom" })
      expect(result).toBeNull()
    })
  })
})
