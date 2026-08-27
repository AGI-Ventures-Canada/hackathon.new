import { describe, expect, it, beforeEach } from "bun:test"
import type { Job } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  createJob,
  getJobById,
  listJobs,
  updateJobStatus,
  cancelJob,
} = await import("@/lib/services/jobs")

const mockJob: Job = {
  id: "job-1",
  tenant_id: "tenant-123",
  type: "completion",
  status_cache: "queued",
  input: { prompt: "Hello" },
  result: null,
  error: null,
  workflow_run_id: null,
  created_by_key_id: "key-456",
  idempotency_key: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  completed_at: null,
}

describe("Jobs Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("createJob", () => {
    it("creates a new job with required fields", async () => {
      const chain = createChainableMock({
        data: mockJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createJob({
        tenantId: "tenant-123",
        type: "completion",
        input: { prompt: "Hello" },
        createdByKeyId: "key-456",
      })

      expect(result).not.toBeNull()
      expect(result?.type).toBe("completion")
      expect(result?.status_cache).toBe("queued")
      expect(result?.tenant_id).toBe("tenant-123")
    })

    it("creates job with idempotency key", async () => {
      const jobWithIdempotency = {
        ...mockJob,
        idempotency_key: "unique-key-123",
      }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: jobWithIdempotency, error: null })
      })

      const result = await createJob({
        tenantId: "tenant-123",
        type: "completion",
        idempotencyKey: "unique-key-123",
      })

      expect(result).not.toBeNull()
      expect(result?.idempotency_key).toBe("unique-key-123")
    })

    it("returns existing job for duplicate idempotency key", async () => {
      const existingJob = {
        ...mockJob,
        id: "existing-job",
        idempotency_key: "duplicate-key",
      }

      const chain = createChainableMock({
        data: existingJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createJob({
        tenantId: "tenant-123",
        type: "completion",
        idempotencyKey: "duplicate-key",
      })

      expect(result).not.toBeNull()
      expect(result?.id).toBe("existing-job")
    })

    it("returns null on database error", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({
          data: null,
          error: { message: "Database error" },
        })
      })

      const result = await createJob({
        tenantId: "tenant-123",
        type: "completion",
      })

      expect(result).toBeNull()
    })

    it("accepts complex JSON input", async () => {
      const complexInput = {
        messages: [{ role: "user", content: "Hi" }],
        config: { temperature: 0.7 },
        nested: { deep: { value: 123 } },
      }

      const jobWithComplexInput = {
        ...mockJob,
        input: complexInput,
      }

      const chain = createChainableMock({
        data: jobWithComplexInput,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createJob({
        tenantId: "tenant-123",
        type: "analysis",
        input: complexInput,
      })

      expect(result).not.toBeNull()
      expect(result?.input).toEqual(complexInput)
    })
  })

  describe("getJobById", () => {
    it("returns job when found", async () => {
      const chain = createChainableMock({
        data: mockJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getJobById("job-1", "tenant-123")

      expect(result).not.toBeNull()
      expect(result?.id).toBe("job-1")
      expect(result?.tenant_id).toBe("tenant-123")
    })

    it("returns null when job not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getJobById("nonexistent", "tenant-123")

      expect(result).toBeNull()
    })

    it("returns null when tenant does not match", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getJobById("job-1", "wrong-tenant")

      expect(result).toBeNull()
    })
  })

  describe("listJobs", () => {
    it("returns jobs for tenant", async () => {
      const jobs = [
        mockJob,
        { ...mockJob, id: "job-2", type: "analysis" },
      ]

      const chain = createChainableMock({
        data: jobs,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJobs("tenant-123")

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe("job-1")
      expect(result[1].id).toBe("job-2")
    })

    it("returns empty array when no jobs exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJobs("tenant-empty")

      expect(result).toEqual([])
    })

    it("filters by status", async () => {
      const runningJob = { ...mockJob, status_cache: "running" as const }

      const chain = createChainableMock({
        data: [runningJob],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJobs("tenant-123", { status: "running" })

      expect(result).toHaveLength(1)
      expect(result[0].status_cache).toBe("running")
    })

    it("respects limit option", async () => {
      const chain = createChainableMock({
        data: [mockJob],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJobs("tenant-123", { limit: 1 })

      expect(result).toHaveLength(1)
    })

    it("respects offset option for pagination", async () => {
      const chain = createChainableMock({
        data: [{ ...mockJob, id: "job-11" }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJobs("tenant-123", { limit: 10, offset: 10 })

      expect(result).toHaveLength(1)
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listJobs("tenant-error")

      expect(result).toEqual([])
    })
  })

  describe("updateJobStatus", () => {
    it("updates job to running status", async () => {
      const updatedJob = { ...mockJob, status_cache: "running" as const }

      const chain = createChainableMock({
        data: updatedJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateJobStatus("job-1", "running")

      expect(result).not.toBeNull()
      expect(result?.status_cache).toBe("running")
    })

    it("updates job to succeeded with result", async () => {
      const now = new Date().toISOString()
      const updatedJob = {
        ...mockJob,
        status_cache: "succeeded" as const,
        result: { text: "Success!" },
        completed_at: now,
      }

      const chain = createChainableMock({
        data: updatedJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateJobStatus("job-1", "succeeded", {
        result: { text: "Success!" },
      })

      expect(result).not.toBeNull()
      expect(result?.status_cache).toBe("succeeded")
      expect(result?.result).toEqual({ text: "Success!" })
      expect(result?.completed_at).not.toBeNull()
    })

    it("updates job to failed with error", async () => {
      const updatedJob = {
        ...mockJob,
        status_cache: "failed" as const,
        error: { message: "Model error", code: "MODEL_ERROR" },
        completed_at: "2024-01-01T00:05:00Z",
      }

      const chain = createChainableMock({
        data: updatedJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateJobStatus("job-1", "failed", {
        error: { message: "Model error", code: "MODEL_ERROR" },
      })

      expect(result).not.toBeNull()
      expect(result?.status_cache).toBe("failed")
      expect(result?.error).toEqual({ message: "Model error", code: "MODEL_ERROR" })
    })

    it("updates job to canceled", async () => {
      const updatedJob = {
        ...mockJob,
        status_cache: "canceled" as const,
        completed_at: "2024-01-01T00:05:00Z",
      }

      const chain = createChainableMock({
        data: updatedJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateJobStatus("job-1", "canceled")

      expect(result).not.toBeNull()
      expect(result?.status_cache).toBe("canceled")
      expect(result?.completed_at).not.toBeNull()
    })

    it("sets workflow_run_id when provided", async () => {
      const updatedJob = {
        ...mockJob,
        workflow_run_id: "run-123",
      }

      const chain = createChainableMock({
        data: updatedJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateJobStatus("job-1", "queued", {
        workflowRunId: "run-123",
      })

      expect(result).not.toBeNull()
      expect(result?.workflow_run_id).toBe("run-123")
    })

    it("returns null on database error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updateJobStatus("job-1", "running")

      expect(result).toBeNull()
    })
  })

  describe("cancelJob", () => {
    it("cancels queued job successfully", async () => {
      const queuedJob = { ...mockJob, status_cache: "queued" as const }
      const canceledJob = { ...queuedJob, status_cache: "canceled" as const }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: queuedJob, error: null })
        }
        return createChainableMock({ data: [{ id: canceledJob.id }], error: null })
      })

      const result = await cancelJob("job-1", "tenant-123")

      expect(result).toBe(true)
    })

    it("cancels running job successfully", async () => {
      const runningJob = { ...mockJob, status_cache: "running" as const }
      const canceledJob = { ...runningJob, status_cache: "canceled" as const }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: runningJob, error: null })
        }
        return createChainableMock({ data: [{ id: canceledJob.id }], error: null })
      })

      const result = await cancelJob("job-1", "tenant-123")

      expect(result).toBe(true)
    })

    it("returns false when job not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await cancelJob("nonexistent", "tenant-123")

      expect(result).toBe(false)
    })

    it("returns false when job already succeeded", async () => {
      const succeededJob = { ...mockJob, status_cache: "succeeded" as const }

      const chain = createChainableMock({
        data: succeededJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await cancelJob("job-1", "tenant-123")

      expect(result).toBe(false)
    })

    it("returns false when job already failed", async () => {
      const failedJob = { ...mockJob, status_cache: "failed" as const }

      const chain = createChainableMock({
        data: failedJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await cancelJob("job-1", "tenant-123")

      expect(result).toBe(false)
    })

    it("returns false when job already canceled", async () => {
      const canceledJob = { ...mockJob, status_cache: "canceled" as const }

      const chain = createChainableMock({
        data: canceledJob,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await cancelJob("job-1", "tenant-123")

      expect(result).toBe(false)
    })
  })

  describe("Job Status Transitions", () => {
    const validTransitions = [
      { from: "queued", to: "running" },
      { from: "queued", to: "canceled" },
      { from: "running", to: "succeeded" },
      { from: "running", to: "failed" },
      { from: "running", to: "canceled" },
    ]

    for (const { from, to } of validTransitions) {
      it(`allows ${from} -> ${to} transition`, async () => {
        const job = { ...mockJob, status_cache: from as Job["status_cache"] }
        const updatedJob = { ...job, status_cache: to as Job["status_cache"] }

        const chain = createChainableMock({
          data: updatedJob,
          error: null,
        })
        setMockFromImplementation(() => chain)

        const result = await updateJobStatus("job-1", to as Job["status_cache"])

        expect(result).not.toBeNull()
        expect(result?.status_cache).toBe(to)
      })
    }

    const terminalStatuses: Array<Job["status_cache"]> = ["succeeded", "failed", "canceled"]

    for (const status of terminalStatuses) {
      it(`${status} is a terminal status (cancelJob returns false)`, async () => {
        const terminalJob = { ...mockJob, status_cache: status }

        const chain = createChainableMock({
          data: terminalJob,
          error: null,
        })
        setMockFromImplementation(() => chain)

        const result = await cancelJob("job-1", "tenant-123")

        expect(result).toBe(false)
      })
    }
  })
})
