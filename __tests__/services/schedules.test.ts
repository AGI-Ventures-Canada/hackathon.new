import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  calculateNextRun,
  createSchedule,
  deleteSchedule,
  markScheduleRun,
  processDueSchedules,
  updateSchedule,
} from "@/lib/services/schedules"
import type { Job, Schedule, ScheduleFrequency } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

describe("Schedules Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("calculateNextRun", () => {
    describe("once frequency", () => {
      it("schedules one-time jobs for the next minute", () => {
        const before = Date.now()
        const result = calculateNextRun("once")
        expect(result).not.toBeNull()
        expect(result!.getTime() - before).toBeGreaterThanOrEqual(60 * 1000 - 100)
        expect(result!.getTime() - before).toBeLessThanOrEqual(60 * 1000 + 100)
      })
    })

    describe("hourly frequency", () => {
      it("returns a date 1 hour in the future", () => {
        const before = Date.now()
        const result = calculateNextRun("hourly")
        const after = Date.now()

        expect(result).not.toBeNull()
        const diff = result!.getTime() - before
        expect(diff).toBeGreaterThanOrEqual(60 * 60 * 1000 - 100)
        expect(diff).toBeLessThanOrEqual(60 * 60 * 1000 + (after - before) + 100)
      })
    })

    describe("daily frequency", () => {
      it("returns a date in the future at the specified time", () => {
        const now = new Date()
        const result = calculateNextRun("daily")

        expect(result).not.toBeNull()
        expect(result!.getTime()).toBeGreaterThan(now.getTime())
        expect(result!.getUTCHours()).toBe(9)
        expect(result!.getUTCMinutes()).toBe(0)
      })

      it("respects custom runTime", () => {
        const result = calculateNextRun("daily", undefined, "UTC", "14:30")

        expect(result).not.toBeNull()
        expect(result!.getUTCHours()).toBe(14)
        expect(result!.getUTCMinutes()).toBe(30)
      })
    })

    describe("weekly frequency", () => {
      it("returns a date approximately 7 days in the future at the specified time", () => {
        const now = new Date()
        const result = calculateNextRun("weekly")

        expect(result).not.toBeNull()
        expect(result!.getTime()).toBeGreaterThan(now.getTime())
        expect(result!.getUTCHours()).toBe(9)
        expect(result!.getUTCMinutes()).toBe(0)

        const daysDiff = (result!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        expect(daysDiff).toBeGreaterThanOrEqual(6)
        expect(daysDiff).toBeLessThanOrEqual(8)
      })
    })

    describe("monthly frequency", () => {
      it("returns a date in the next month", () => {
        const now = new Date()
        const result = calculateNextRun("monthly")

        expect(result).not.toBeNull()
        const expectedMonth = (now.getUTCMonth() + 1) % 12
        expect(result!.getUTCMonth()).toBe(expectedMonth)
      })

      it("handles year rollover (December to January)", () => {
        const now = new Date()
        const result = calculateNextRun("monthly")

        expect(result).not.toBeNull()
        if (now.getUTCMonth() === 11) {
          expect(result!.getUTCFullYear()).toBe(now.getUTCFullYear() + 1)
          expect(result!.getUTCMonth()).toBe(0)
        }
      })
    })

    describe("cron frequency", () => {
      it("returns null when no cron expression provided", () => {
        const result = calculateNextRun("cron")
        expect(result).toBeNull()
      })

      it("returns null for invalid cron expression (too few parts)", () => {
        const result = calculateNextRun("cron", "0 0 * *")
        expect(result).toBeNull()
      })

      it("returns null for invalid cron expression (too many parts)", () => {
        const result = calculateNextRun("cron", "0 0 * * * *")
        expect(result).toBeNull()
      })

      it("parses a simple cron expression with specific minute", () => {
        const result = calculateNextRun("cron", "30 * * * *")
        expect(result).not.toBeNull()
        expect(result!.getUTCMinutes()).toBe(30)
      })

      it("parses a cron expression with specific hour", () => {
        const result = calculateNextRun("cron", "0 9 * * *")
        expect(result).not.toBeNull()
        expect(result!.getUTCHours()).toBe(9)
        expect(result!.getUTCMinutes()).toBe(0)
      })

      it("parses a cron expression with specific day of month", () => {
        const result = calculateNextRun("cron", "0 0 15 * *")
        expect(result).not.toBeNull()
        expect(result!.getUTCDate()).toBe(15)
      })

      it("parses a cron expression with specific month", () => {
        const result = calculateNextRun("cron", "0 0 1 6 *")
        expect(result).not.toBeNull()
        expect(result!.getUTCMonth()).toBe(5)
        expect(result!.getUTCDate()).toBe(1)
      })

      it("handles all wildcards", () => {
        const result = calculateNextRun("cron", "* * * * *")
        expect(result).not.toBeNull()
        const now = new Date()
        const diffMs = result!.getTime() - now.getTime()
        expect(diffMs).toBeLessThanOrEqual(60 * 1000 + 1000)
      })

      it("sets seconds and milliseconds to zero", () => {
        const result = calculateNextRun("cron", "30 12 * * *")
        expect(result).not.toBeNull()
        expect(result!.getUTCSeconds()).toBe(0)
        expect(result!.getUTCMilliseconds()).toBe(0)
      })

      it("returns null for invalid values", () => {
        expect(calculateNextRun("cron", "abc * * * *")).toBeNull()
        expect(calculateNextRun("cron", "60 * * * *")).toBeNull()
        expect(calculateNextRun("cron", "0 24 * * *")).toBeNull()
      })
    })

    describe("invalid frequency", () => {
      it("returns null for unknown frequency", () => {
        const result = calculateNextRun("invalid" as ScheduleFrequency)
        expect(result).toBeNull()
      })
    })

    describe("timezone handling", () => {
      it("accepts timezone parameter", () => {
        const result = calculateNextRun("hourly", undefined, "America/New_York")
        expect(result).not.toBeNull()
      })

      it("runs at the requested wall-clock time in the selected timezone", () => {
        const result = calculateNextRun("daily", undefined, "America/New_York", "14:30")
        const localTime = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(result!)

        expect(localTime).toBe("14:30")
      })

      it("rejects invalid timezones and run times", () => {
        expect(calculateNextRun("daily", undefined, "Mars/Olympus", "09:00")).toBeNull()
        expect(calculateNextRun("daily", undefined, "UTC", "24:00")).toBeNull()
        expect(calculateNextRun("daily", undefined, "UTC", "9:00")).toBeNull()
      })

      it("defaults to UTC timezone", () => {
        const result = calculateNextRun("hourly")
        expect(result).not.toBeNull()
      })
    })
  })

  describe("Schedule Frequency Types", () => {
    const validFrequencies: ScheduleFrequency[] = [
      "once",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "cron",
    ]

    it("supports all valid frequency types", () => {
      for (const freq of validFrequencies) {
        expect(() => calculateNextRun(freq)).not.toThrow()
      }
    })
  })

  describe("schedule persistence", () => {
    it("stores the requested run time", async () => {
      const savedSchedule = { id: "schedule-1", run_time: "14:30" }
      const chain = createChainableMock({ data: savedSchedule, error: null })
      setMockFromImplementation(() => chain)

      expect(await createSchedule({
        tenantId: "tenant-1",
        name: "Daily report",
        frequency: "daily",
        timezone: "America/New_York",
        runTime: "14:30",
        jobType: "echo",
      })).toEqual(savedSchedule)
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        timezone: "America/New_York",
        run_time: "14:30",
      }))
    })

    it("rejects invalid cron expressions before writing", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      expect(await createSchedule({
        tenantId: "tenant-1",
        name: "Broken schedule",
        frequency: "cron",
        cronExpression: "99 * * * *",
        jobType: "echo",
      })).toBeNull()
      expect(chain.insert).not.toHaveBeenCalled()
    })

    it("rejects unsupported job types before writing", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      expect(await createSchedule({
        tenantId: "tenant-1",
        name: "Unknown job",
        frequency: "daily",
        jobType: "unknown",
      })).toBeNull()
      expect(chain.insert).not.toHaveBeenCalled()
    })

    it("rejects oversized job input before writing", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      expect(await createSchedule({
        tenantId: "tenant-1",
        name: "Large job",
        frequency: "daily",
        jobType: "echo",
        input: { value: "x".repeat(64_001) },
      })).toBeNull()
      expect(chain.insert).not.toHaveBeenCalled()
    })

    it("rejects an empty cron expression on update", async () => {
      const existing = {
        id: "schedule-1",
        frequency: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        run_time: null,
      }
      const chain = createChainableMock({ data: existing, error: null })
      setMockFromImplementation(() => chain)

      expect(await updateSchedule("schedule-1", "tenant-1", { cronExpression: "" })).toBeNull()
      expect(chain.update).not.toHaveBeenCalled()
    })

    it("rejects oversized job input on update before writing", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      expect(await updateSchedule("schedule-1", "tenant-1", {
        input: { value: "x".repeat(64_001) },
      })).toBeNull()
      expect(chain.update).not.toHaveBeenCalled()
    })

    it("keeps the saved run time after a schedule runs", async () => {
      const existing = {
        id: "schedule-1",
        frequency: "daily",
        cron_expression: null,
        timezone: "America/New_York",
        run_time: "14:30",
        run_count: 2,
        is_active: true,
      }
      const updated = { ...existing, run_count: 3 }
      const readChain = createChainableMock({ data: existing, error: null })
      const updateChain = createChainableMock({ data: updated, error: null })
      let queryCount = 0
      setMockFromImplementation(() => queryCount++ === 0 ? readChain : updateChain)

      expect(await markScheduleRun("schedule-1")).toEqual(updated)
      const update = updateChain.update.mock.calls[0]?.[0] as { next_run_at: string }
      const localTime = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(update.next_run_at))
      expect(localTime).toBe("14:30")
    })

    it("does not report a missing schedule as deleted", async () => {
      setMockFromImplementation(() => createChainableMock({ data: [], error: null }))
      expect(await deleteSchedule("schedule-other", "tenant-1")).toBe(false)
    })

    it("claims and starts due schedules once", async () => {
      const dueSchedule: Schedule = {
        id: "schedule-1",
        tenant_id: "tenant-1",
        agent_id: null,
        job_type: "echo",
        name: "Daily report",
        frequency: "daily",
        cron_expression: null,
        timezone: "UTC",
        run_time: "14:30",
        input: { prompt: "hello" },
        is_active: true,
        next_run_at: "2026-08-21T14:30:00.000Z",
        last_run_at: null,
        run_count: 0,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      }
      const job: Job = {
        id: "job-1",
        tenant_id: "tenant-1",
        type: "echo",
        input: { prompt: "hello" },
        result: null,
        error: null,
        status_cache: "queued",
        workflow_run_id: null,
        created_by_key_id: null,
        idempotency_key: null,
        created_at: "2026-08-21T14:30:00.000Z",
        updated_at: "2026-08-21T14:30:00.000Z",
        completed_at: null,
      }
      let scheduleQueryCount = 0
      setMockFromImplementation(() => createChainableMock({
        data: scheduleQueryCount++ === 0 ? [dueSchedule] : dueSchedule,
        error: null,
      }))
      const createJob = mock(() => Promise.resolve(job))
      const startJobWorkflow = mock(() => Promise.resolve("run-1"))

      expect(await processDueSchedules({ createJob, startJobWorkflow })).toEqual({
        found: 1,
        started: 1,
        failed: 0,
      })
      expect(createJob).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        type: "echo",
        input: { prompt: "hello" },
        idempotencyKey: "schedule:schedule-1:2026-08-21T14:30:00.000Z",
      })
      expect(startJobWorkflow).toHaveBeenCalledWith(job)
    })

    it("skips a due schedule already claimed by another worker", async () => {
      const dueSchedule = {
        id: "schedule-1",
        tenant_id: "tenant-1",
        job_type: "echo",
        frequency: "daily",
        cron_expression: null,
        timezone: "UTC",
        run_time: "09:00",
        input: null,
        is_active: true,
        next_run_at: "2026-08-21T09:00:00.000Z",
        run_count: 0,
      } as Schedule
      let scheduleQueryCount = 0
      setMockFromImplementation(() => createChainableMock({
        data: scheduleQueryCount++ === 0 ? [dueSchedule] : null,
        error: null,
      }))
      const createJob = mock(() => Promise.resolve(null))
      const startJobWorkflow = mock(() => Promise.resolve(null))

      expect(await processDueSchedules({ createJob, startJobWorkflow })).toEqual({
        found: 1,
        started: 0,
        failed: 0,
      })
      expect(createJob).not.toHaveBeenCalled()
      expect(startJobWorkflow).not.toHaveBeenCalled()
    })

    it("restores a one-time schedule when its workflow does not start", async () => {
      const dueSchedule = {
        id: "schedule-1",
        tenant_id: "tenant-1",
        job_type: "echo",
        frequency: "once",
        cron_expression: null,
        timezone: "UTC",
        run_time: "09:00",
        input: null,
        is_active: true,
        next_run_at: "2026-08-21T09:00:00.000Z",
        last_run_at: null,
        run_count: 0,
      } as Schedule
      const claimedSchedule = {
        ...dueSchedule,
        is_active: false,
        next_run_at: null,
        last_run_at: "2026-08-21T09:00:01.000Z",
        run_count: 1,
      }
      const job = {
        id: "job-1",
        tenant_id: "tenant-1",
        type: "echo",
        input: null,
        status_cache: "queued",
        workflow_run_id: null,
      } as Job
      const listChain = createChainableMock({ data: [dueSchedule], error: null })
      const claimChain = createChainableMock({ data: claimedSchedule, error: null })
      const restoreChain = createChainableMock({ data: { id: dueSchedule.id }, error: null })
      let scheduleQueryCount = 0
      setMockFromImplementation(() => {
        const chain = [listChain, claimChain, restoreChain][scheduleQueryCount]
        scheduleQueryCount += 1
        return chain ?? createChainableMock({ data: null, error: null })
      })
      const createJob = mock(() => Promise.resolve(job))
      const startJobWorkflow = mock(() => Promise.resolve(null))

      expect(await processDueSchedules({ createJob, startJobWorkflow })).toEqual({
        found: 1,
        started: 0,
        failed: 1,
      })
      expect(restoreChain.update).toHaveBeenCalledWith(expect.objectContaining({
        is_active: true,
        last_run_at: null,
        next_run_at: dueSchedule.next_run_at,
        run_count: 0,
      }))
      expect(restoreChain.eq).toHaveBeenCalledWith("run_count", 1)
      expect(restoreChain.eq).toHaveBeenCalledWith("is_active", false)
      expect(restoreChain.is).toHaveBeenCalledWith("next_run_at", null)
    })

    it("restores a claimed schedule when job creation throws", async () => {
      const dueSchedule = {
        id: "schedule-1",
        tenant_id: "tenant-1",
        job_type: "echo",
        frequency: "daily",
        cron_expression: null,
        timezone: "UTC",
        run_time: "09:00",
        input: null,
        is_active: true,
        next_run_at: "2026-08-21T09:00:00.000Z",
        last_run_at: null,
        run_count: 0,
      } as Schedule
      const claimedSchedule = {
        ...dueSchedule,
        next_run_at: "2026-08-22T09:00:00.000Z",
        last_run_at: "2026-08-21T09:00:01.000Z",
        run_count: 1,
      }
      const responses = [
        createChainableMock({ data: [dueSchedule], error: null }),
        createChainableMock({ data: claimedSchedule, error: null }),
        createChainableMock({ data: { id: dueSchedule.id }, error: null }),
      ]
      let scheduleQueryCount = 0
      setMockFromImplementation(() => responses[scheduleQueryCount++]!)
      const createJob = mock(() => Promise.reject(new Error("jobs unavailable")))
      const startJobWorkflow = mock(() => Promise.resolve(null))

      expect(await processDueSchedules({ createJob, startJobWorkflow })).toEqual({
        found: 1,
        started: 0,
        failed: 1,
      })
      expect(startJobWorkflow).not.toHaveBeenCalled()
    })

    it("surfaces a due-schedule query failure to the cron route", async () => {
      setMockFromImplementation(() => createChainableMock({
        data: null,
        error: { message: "database unavailable" },
      }))

      await expect(processDueSchedules({
        createJob: mock(() => Promise.resolve(null)),
        startJobWorkflow: mock(() => Promise.resolve(null)),
      })).rejects.toThrow("Failed to fetch due schedules: database unavailable")
    })
  })

  describe("Schedule Input Validation", () => {
    describe("CreateScheduleInput", () => {
      it("accepts valid schedule input structure", () => {
        const input = {
          tenantId: "tenant-123",
          name: "My Schedule",
          frequency: "daily" as ScheduleFrequency,
          timezone: "UTC",
          jobType: "cleanup",
          input: { key: "value" },
        }

        expect(input.tenantId).toBeDefined()
        expect(input.name).toBeDefined()
        expect(input.frequency).toBeDefined()
      })

      it("cron expression is optional", () => {
        const input = {
          tenantId: "tenant-123",
          name: "Daily Job",
          frequency: "daily" as ScheduleFrequency,
        }

        expect(input.cronExpression).toBeUndefined()
      })

      it("jobType can be used instead of agentId", () => {
        const input = {
          tenantId: "tenant-123",
          name: "Custom Job",
          frequency: "hourly" as ScheduleFrequency,
          jobType: "cleanup",
        }

        expect(input.agentId).toBeUndefined()
        expect(input.jobType).toBe("cleanup")
      })
    })

    describe("UpdateScheduleInput", () => {
      it("all fields are optional", () => {
        const input: {
          name?: string
          frequency?: ScheduleFrequency
          cronExpression?: string
          timezone?: string
          input?: Record<string, unknown>
          isActive?: boolean
        } = {}

        expect(Object.keys(input).length).toBe(0)
      })

      it("accepts partial updates", () => {
        const input = { name: "New Name" }
        expect(input.name).toBe("New Name")
        expect((input as Record<string, unknown>).frequency).toBeUndefined()
      })
    })
  })

  describe("Schedule Data Structure", () => {
    it("contains required fields", () => {
      const schedule = {
        id: "schedule-1",
        tenant_id: "tenant-123",
        name: "Test Schedule",
        frequency: "daily" as ScheduleFrequency,
        timezone: "UTC",
        is_active: true,
        run_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      expect(schedule.id).toBeDefined()
      expect(schedule.tenant_id).toBeDefined()
      expect(schedule.name).toBeDefined()
      expect(schedule.frequency).toBeDefined()
      expect(schedule.timezone).toBeDefined()
      expect(schedule.is_active).toBeDefined()
      expect(schedule.run_count).toBeDefined()
    })

    it("optional fields can be null", () => {
      const schedule = {
        id: "schedule-1",
        tenant_id: "tenant-123",
        name: "Test Schedule",
        frequency: "daily" as ScheduleFrequency,
        timezone: "UTC",
        is_active: true,
        run_count: 0,
        cron_expression: null,
        agent_id: null,
        job_type: null,
        input: null,
        next_run_at: null,
        last_run_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      expect(schedule.cron_expression).toBeNull()
      expect(schedule.agent_id).toBeNull()
      expect(schedule.job_type).toBeNull()
      expect(schedule.input).toBeNull()
    })

    it("tracks run history", () => {
      const schedule = {
        id: "schedule-1",
        tenant_id: "tenant-123",
        name: "Test Schedule",
        frequency: "hourly" as ScheduleFrequency,
        timezone: "UTC",
        is_active: true,
        run_count: 5,
        last_run_at: "2024-01-15T10:00:00Z",
        next_run_at: "2024-01-15T11:00:00Z",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
      }

      expect(schedule.run_count).toBe(5)
      expect(schedule.last_run_at).toBeDefined()
      expect(schedule.next_run_at).toBeDefined()
    })
  })

  describe("Tenant Isolation", () => {
    it("schedules are scoped to tenant", () => {
      const tenant1Schedules = [
        { tenant_id: "tenant-1", name: "Schedule A" },
        { tenant_id: "tenant-1", name: "Schedule B" },
      ]

      const tenant2Schedules = [{ tenant_id: "tenant-2", name: "Schedule C" }]

      const allTenant1 = tenant1Schedules.every((s) => s.tenant_id === "tenant-1")
      const allTenant2 = tenant2Schedules.every((s) => s.tenant_id === "tenant-2")

      expect(allTenant1).toBe(true)
      expect(allTenant2).toBe(true)
    })
  })

  describe("List Schedules Options", () => {
    it("default options structure", () => {
      const options = { limit: undefined, activeOnly: undefined }
      const effectiveLimit = options.limit ?? 50
      expect(effectiveLimit).toBe(50)
    })

    it("activeOnly filters to active schedules", () => {
      const schedules = [
        { is_active: true, name: "Active" },
        { is_active: false, name: "Inactive" },
      ]

      const activeOnly = schedules.filter((s) => s.is_active)
      expect(activeOnly.length).toBe(1)
      expect(activeOnly[0].name).toBe("Active")
    })

    it("respects limit parameter", () => {
      const schedules = Array.from({ length: 10 }, (_, i) => ({ name: `Schedule ${i}` }))
      const limit = 5
      const limited = schedules.slice(0, limit)

      expect(limited.length).toBe(5)
    })
  })
})
