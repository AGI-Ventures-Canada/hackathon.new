import { describe, expect, it, beforeEach } from "bun:test"
import type { UserPrincipal, ApiKeyPrincipal, AdminPrincipal } from "@/lib/auth/types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { logAudit, listAuditLogs, listAllAuditLogs, listHackathonAuditLogs } = await import("@/lib/services/audit")

const mockUserPrincipal: UserPrincipal = {
  kind: "user",
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["keys:read", "keys:write"],
}

const mockApiKeyPrincipal: ApiKeyPrincipal = {
  kind: "api_key",
  tenantId: "tenant-123",
  keyId: "key-456",
  scopes: ["hackathons:read", "hackathons:write"],
}

const mockAdminPrincipal: AdminPrincipal = {
  kind: "admin",
  userId: "admin-789",
  tenantId: "tenant-123",
  orgId: null,
  scopes: ["admin:read", "admin:write", "admin:scenarios"],
}

describe("Audit Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("logAudit", () => {
    it("creates audit log for user principal", async () => {
      const mockAuditLog = {
        id: "audit-1",
        tenant_id: "tenant-123",
        action: "api_key.created",
        actor_type: "user",
        actor_id: "user-456",
        resource_type: "api_key",
        resource_id: "key-789",
        metadata: { name: "My API Key" },
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockAuditLog,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await logAudit({
        principal: mockUserPrincipal,
        action: "api_key.created",
        resourceType: "api_key",
        resourceId: "key-789",
        metadata: { name: "My API Key" },
      })

      expect(result).not.toBeNull()
      expect(result?.action).toBe("api_key.created")
      expect(result?.actor_type).toBe("user")
      expect(result?.actor_id).toBe("user-456")
    })

    it("creates audit log for api_key principal", async () => {
      const mockAuditLog = {
        id: "audit-2",
        tenant_id: "tenant-123",
        action: "job.created",
        actor_type: "api_key",
        actor_id: "key-456",
        resource_type: "job",
        resource_id: "job-789",
        metadata: { type: "completion" },
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockAuditLog,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await logAudit({
        principal: mockApiKeyPrincipal,
        action: "job.created",
        resourceType: "job",
        resourceId: "job-789",
        metadata: { type: "completion" },
      })

      expect(result).not.toBeNull()
      expect(result?.action).toBe("job.created")
      expect(result?.actor_type).toBe("api_key")
      expect(result?.actor_id).toBe("key-456")
    })

    it("handles optional resource_id", async () => {
      const mockAuditLog = {
        id: "audit-3",
        tenant_id: "tenant-123",
        action: "hackathon.created",
        actor_type: "user",
        actor_id: "user-456",
        resource_type: "hackathon",
        resource_id: null,
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockAuditLog,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await logAudit({
        principal: mockUserPrincipal,
        action: "hackathon.created",
        resourceType: "hackathon",
      })

      expect(result).not.toBeNull()
      expect(result?.resource_id).toBeNull()
    })

    it("handles optional metadata", async () => {
      const mockAuditLog = {
        id: "audit-4",
        tenant_id: "tenant-123",
        action: "api_key.revoked",
        actor_type: "user",
        actor_id: "user-456",
        resource_type: "api_key",
        resource_id: "key-123",
        metadata: null,
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockAuditLog,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await logAudit({
        principal: mockUserPrincipal,
        action: "api_key.revoked",
        resourceType: "api_key",
        resourceId: "key-123",
      })

      expect(result).not.toBeNull()
      expect(result?.metadata).toBeNull()
    })

    it("creates audit log for admin principal with targetTenantId", async () => {
      const mockAuditLog = {
        id: "audit-admin-1",
        tenant_id: "target-tenant-123",
        action: "admin.hackathon.updated",
        actor_type: "user",
        actor_id: "admin-789",
        resource_type: "hackathon",
        resource_id: "h-123",
        metadata: { is_admin_action: true, admin_user_id: "admin-789", fields: ["status"] },
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockAuditLog,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await logAudit({
        principal: mockAdminPrincipal,
        action: "admin.hackathon.updated",
        resourceType: "hackathon",
        resourceId: "h-123",
        targetTenantId: "target-tenant-123",
        metadata: { fields: ["status"] },
      })

      expect(result).not.toBeNull()
      expect(result?.action).toBe("admin.hackathon.updated")
      expect(result?.actor_id).toBe("admin-789")
    })

    it("throws for admin principal without targetTenantId and no principal tenantId", async () => {
      const noTenantAdminPrincipal: AdminPrincipal = {
        kind: "admin",
        userId: "admin-789",
        tenantId: null,
        orgId: null,
        scopes: ["admin:read", "admin:write", "admin:scenarios"],
      }
      expect(
        logAudit({
          principal: noTenantAdminPrincipal,
          action: "admin.hackathon.updated",
          resourceType: "hackathon",
          resourceId: "h-123",
        })
      ).rejects.toThrow("Admin audit log requires targetTenantId")
    })

    it("returns null on database error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await logAudit({
        principal: mockUserPrincipal,
        action: "api_key.created",
        resourceType: "api_key",
        resourceId: "key-789",
      })

      expect(result).toBeNull()
    })

    it("returns the existing matching audit for a deterministic idempotency ID", async () => {
      const idempotencyId = "11111111-1111-4111-8111-111111111111"
      const insert = createChainableMock({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      })
      const existing = {
        id: idempotencyId,
        tenant_id: "tenant-123",
        action: "hackathon.created",
        actor_type: "user",
        actor_id: "user-456",
        resource_type: "hackathon",
        resource_id: idempotencyId,
        metadata: { idempotencyKey: "sha256:stable" },
        created_at: "2026-08-26T12:00:00.000Z",
      }
      const lookup = createChainableMock({ data: existing, error: null })
      const chains = [insert, lookup]
      setMockFromImplementation(() => chains.shift()!)

      const result = await logAudit({
        principal: mockUserPrincipal,
        action: "hackathon.created",
        resourceType: "hackathon",
        resourceId: idempotencyId,
        metadata: { name: "Stable Event" },
        idempotencyId,
        idempotencyKey: "sha256:stable",
        critical: true,
      })

      expect(result).toEqual(existing)
      expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
        id: idempotencyId,
        metadata: {
          name: "Stable Event",
          idempotencyKey: "sha256:stable",
        },
      }))
      expect(lookup.eq).toHaveBeenCalledWith("id", idempotencyId)
      expect(lookup.eq).toHaveBeenCalledWith("tenant_id", "tenant-123")
    })

    it("rejects a deterministic audit ID that belongs to another resource", async () => {
      const idempotencyId = "22222222-2222-4222-8222-222222222222"
      const insert = createChainableMock({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      })
      const lookup = createChainableMock({
        data: {
          id: idempotencyId,
          tenant_id: "tenant-123",
          action: "hackathon.deleted",
          resource_type: "hackathon",
          resource_id: idempotencyId,
        },
        error: null,
      })
      const chains = [insert, lookup]
      setMockFromImplementation(() => chains.shift()!)

      await expect(logAudit({
        principal: mockUserPrincipal,
        action: "hackathon.created",
        resourceType: "hackathon",
        resourceId: idempotencyId,
        idempotencyId,
        idempotencyKey: "sha256:stable",
        critical: true,
      })).rejects.toThrow("Audit idempotency ID is already in use")
    })

    it("handles complex metadata objects", async () => {
      const complexMetadata = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        string: "test",
      }

      const mockAuditLog = {
        id: "audit-5",
        tenant_id: "tenant-123",
        action: "hackathon.updated",
        actor_type: "api_key",
        actor_id: "key-456",
        resource_type: "hackathon",
        resource_id: "h-123",
        metadata: complexMetadata,
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockAuditLog,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await logAudit({
        principal: mockApiKeyPrincipal,
        action: "hackathon.updated",
        resourceType: "hackathon",
        resourceId: "h-123",
        metadata: complexMetadata,
      })

      expect(result).not.toBeNull()
      expect(result?.metadata).toEqual(complexMetadata)
    })
  })

  describe("listAuditLogs", () => {
    it("returns audit logs for tenant", async () => {
      const mockLogs = [
        {
          id: "audit-1",
          tenant_id: "tenant-123",
          action: "api_key.created",
          actor_type: "user",
          actor_id: "user-456",
          resource_type: "api_key",
          resource_id: "key-1",
          metadata: null,
          created_at: "2024-01-03T00:00:00Z",
        },
        {
          id: "audit-2",
          tenant_id: "tenant-123",
          action: "job.created",
          actor_type: "api_key",
          actor_id: "key-456",
          resource_type: "job",
          resource_id: "job-1",
          metadata: null,
          created_at: "2024-01-02T00:00:00Z",
        },
      ]

      const chain = createChainableMock({
        data: mockLogs,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listAuditLogs("tenant-123")

      expect(result).toHaveLength(2)
      expect(result[0].action).toBe("api_key.created")
      expect(result[1].action).toBe("job.created")
    })

    it("returns empty array when no logs exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listAuditLogs("tenant-empty")

      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listAuditLogs("tenant-error")

      expect(result).toEqual([])
    })

    it("respects limit option", async () => {
      const mockLogs = [
        {
          id: "audit-1",
          tenant_id: "tenant-123",
          action: "api_key.created",
          actor_type: "user",
          actor_id: "user-456",
          resource_type: "api_key",
          resource_id: "key-1",
          metadata: null,
          created_at: "2024-01-01T00:00:00Z",
        },
      ]

      const chain = createChainableMock({
        data: mockLogs,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listAuditLogs("tenant-123", { limit: 1 })

      expect(result).toHaveLength(1)
    })

    it("respects offset option for pagination", async () => {
      const mockLogs = [
        {
          id: "audit-3",
          tenant_id: "tenant-123",
          action: "job.canceled",
          actor_type: "api_key",
          actor_id: "key-456",
          resource_type: "job",
          resource_id: "job-3",
          metadata: null,
          created_at: "2024-01-01T00:00:00Z",
        },
      ]

      const chain = createChainableMock({
        data: mockLogs,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listAuditLogs("tenant-123", { limit: 10, offset: 20 })

      expect(result).toHaveLength(1)
    })
  })

  describe("listAllAuditLogs", () => {
    const sampleLogs = [
      {
        id: "log-1",
        tenant_id: "tenant-1",
        action: "hackathon.created",
        actor_type: "user",
        actor_id: "user-1",
        resource_type: "hackathon",
        resource_id: "h-1",
        metadata: null,
        created_at: "2024-01-03T00:00:00Z",
      },
      {
        id: "log-2",
        tenant_id: "tenant-1",
        action: "api_key.created",
        actor_type: "api_key",
        actor_id: "key-1",
        resource_type: "api_key",
        resource_id: "k-1",
        metadata: null,
        created_at: "2024-01-02T00:00:00Z",
      },
    ]

    it("returns logs with default pagination (limit 50, offset 0)", async () => {
      const chain = createChainableMock({
        data: sampleLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      const result = await listAllAuditLogs()

      expect(result.logs).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(chain.range).toHaveBeenCalledWith(0, 49)
    })

    it("respects custom limit and offset", async () => {
      const chain = createChainableMock({
        data: [sampleLogs[0]],
        error: null,
        count: 100,
      })
      setMockFromImplementation(() => chain)

      const result = await listAllAuditLogs({ limit: 10, offset: 20 })

      expect(result.logs).toHaveLength(1)
      expect(result.total).toBe(100)
      expect(chain.range).toHaveBeenCalledWith(20, 29)
    })

    it("clamps limit to max 100", async () => {
      const chain = createChainableMock({
        data: sampleLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ limit: 500 })

      expect(chain.range).toHaveBeenCalledWith(0, 99)
    })

    it("filters by tenantId", async () => {
      const chain = createChainableMock({
        data: sampleLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ tenantId: "tenant-1" })

      expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1")
    })

    it("filters by hackathonId using or()", async () => {
      const chain = createChainableMock({
        data: sampleLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ hackathonId: "h-1" })

      expect(chain.or).toHaveBeenCalledWith(
        "resource_id.eq.h-1,metadata->>hackathonId.eq.h-1"
      )
    })

    it("filters by action using ilike()", async () => {
      const chain = createChainableMock({
        data: [sampleLogs[0]],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ action: "hackathon" })

      expect(chain.ilike).toHaveBeenCalledWith("action", "%hackathon%")
    })

    it("filters by resourceType", async () => {
      const chain = createChainableMock({
        data: [sampleLogs[1]],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ resourceType: "api_key" })

      expect(chain.eq).toHaveBeenCalledWith("resource_type", "api_key")
    })

    it("filters by since date", async () => {
      const chain = createChainableMock({
        data: [sampleLogs[0]],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ since: "2024-01-02T12:00:00Z" })

      expect(chain.gte).toHaveBeenCalledWith("created_at", "2024-01-02T12:00:00Z")
    })

    it("filters by until date", async () => {
      const chain = createChainableMock({
        data: [sampleLogs[1]],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ until: "2024-01-02T12:00:00Z" })

      expect(chain.lte).toHaveBeenCalledWith("created_at", "2024-01-02T12:00:00Z")
    })

    it("sorts ascending when sort=asc", async () => {
      const chain = createChainableMock({
        data: sampleLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs({ sort: "asc" })

      expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: true })
    })

    it("defaults to descending sort", async () => {
      const chain = createChainableMock({
        data: sampleLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listAllAuditLogs()

      expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false })
    })

    it("throws on Supabase error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "connection refused" },
      })
      setMockFromImplementation(() => chain)

      expect(listAllAuditLogs()).rejects.toThrow(
        "Failed to list audit logs: connection refused"
      )
    })
  })

  describe("listHackathonAuditLogs", () => {
    const hackathonId = "11111111-1111-1111-1111-111111111111"
    const hackathonLogs = [
      {
        id: "hlog-1",
        tenant_id: "tenant-123",
        action: "hackathon.updated",
        actor_type: "user",
        actor_id: "user-1",
        resource_type: "hackathon",
        resource_id: hackathonId,
        metadata: null,
        created_at: "2024-03-01T10:00:00Z",
      },
      {
        id: "hlog-2",
        tenant_id: "tenant-123",
        action: "judge.added",
        actor_type: "user",
        actor_id: "user-1",
        resource_type: "judge",
        resource_id: "j-uuid-1",
        metadata: { hackathonId },
        created_at: "2024-02-15T10:00:00Z",
      },
    ]

    it("returns logs with default pagination", async () => {
      const chain = createChainableMock({
        data: hackathonLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      const result = await listHackathonAuditLogs("tenant-123", hackathonId)

      expect(result.logs).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-123")
      expect(chain.or).toHaveBeenCalledWith(
        `resource_id.eq.${hackathonId},metadata->>hackathonId.eq.${hackathonId}`
      )
      expect(chain.range).toHaveBeenCalledWith(0, 49)
    })

    it("respects custom limit and offset", async () => {
      const chain = createChainableMock({
        data: [hackathonLogs[0]],
        error: null,
        count: 20,
      })
      setMockFromImplementation(() => chain)

      const result = await listHackathonAuditLogs("tenant-123", hackathonId, {
        limit: 10,
        offset: 5,
      })

      expect(result.logs).toHaveLength(1)
      expect(result.total).toBe(20)
      expect(chain.range).toHaveBeenCalledWith(5, 14)
    })

    it("clamps limit to max 100", async () => {
      const chain = createChainableMock({
        data: hackathonLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listHackathonAuditLogs("tenant-123", hackathonId, { limit: 500 })

      expect(chain.range).toHaveBeenCalledWith(0, 99)
    })

    it("filters by action using ilike()", async () => {
      const chain = createChainableMock({
        data: [hackathonLogs[1]],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      await listHackathonAuditLogs("tenant-123", hackathonId, {
        action: "judge",
      })

      expect(chain.ilike).toHaveBeenCalledWith("action", "%judge%")
    })

    it("filters by resourceType", async () => {
      const chain = createChainableMock({
        data: [hackathonLogs[1]],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      await listHackathonAuditLogs("tenant-123", hackathonId, {
        resourceType: "judge",
      })

      expect(chain.eq).toHaveBeenCalledWith("resource_type", "judge")
    })

    it("filters by date range (since/until)", async () => {
      const chain = createChainableMock({
        data: [hackathonLogs[0]],
        error: null,
        count: 1,
      })
      setMockFromImplementation(() => chain)

      await listHackathonAuditLogs("tenant-123", hackathonId, {
        since: "2024-02-20T00:00:00Z",
        until: "2024-03-05T00:00:00Z",
      })

      expect(chain.gte).toHaveBeenCalledWith("created_at", "2024-02-20T00:00:00Z")
      expect(chain.lte).toHaveBeenCalledWith("created_at", "2024-03-05T00:00:00Z")
    })

    it("sorts ascending when sort=asc", async () => {
      const chain = createChainableMock({
        data: hackathonLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listHackathonAuditLogs("tenant-123", hackathonId, { sort: "asc" })

      expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: true })
    })

    it("defaults to descending sort", async () => {
      const chain = createChainableMock({
        data: hackathonLogs,
        error: null,
        count: 2,
      })
      setMockFromImplementation(() => chain)

      await listHackathonAuditLogs("tenant-123", hackathonId)

      expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false })
    })

    it("throws on Supabase error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "connection refused" },
      })
      setMockFromImplementation(() => chain)

      expect(
        listHackathonAuditLogs("tenant-123", hackathonId)
      ).rejects.toThrow("Failed to list hackathon audit logs: connection refused")
    })
  })

  describe("Audit Actions", () => {
    const testCases: Array<{ action: string; resourceType: string }> = [
      { action: "api_key.created", resourceType: "api_key" },
      { action: "api_key.revoked", resourceType: "api_key" },
      { action: "job.created", resourceType: "job" },
      { action: "job.canceled", resourceType: "job" },
      { action: "webhook.created", resourceType: "webhook" },
      { action: "webhook.deleted", resourceType: "webhook" },
      { action: "hackathon.created", resourceType: "hackathon" },
      { action: "hackathon.updated", resourceType: "hackathon" },
    ]

    for (const { action, resourceType } of testCases) {
      it(`logs ${action} action correctly`, async () => {
        const mockAuditLog = {
          id: "audit-test",
          tenant_id: "tenant-123",
          action,
          actor_type: "user",
          actor_id: "user-456",
          resource_type: resourceType,
          resource_id: "resource-123",
          metadata: null,
          created_at: "2024-01-01T00:00:00Z",
        }

        const chain = createChainableMock({
          data: mockAuditLog,
          error: null,
        })
        setMockFromImplementation(() => chain)

        const result = await logAudit({
          principal: mockUserPrincipal,
          action: action as Parameters<typeof logAudit>[0]["action"],
          resourceType,
          resourceId: "resource-123",
        })

        expect(result).not.toBeNull()
        expect(result?.action).toBe(action)
        expect(result?.resource_type).toBe(resourceType)
      })
    }
  })
})
