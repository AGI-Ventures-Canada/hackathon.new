import { supabase as getSupabase } from "@/lib/db/client"
import type { Job, Schedule, ScheduleFrequency } from "@/lib/db/hackathon-types"
import type { Json, TablesUpdate } from "@/lib/db/types"
import { CronExpressionParser } from "cron-parser"

export type CreateScheduleInput = {
  tenantId: string
  name: string
  frequency: ScheduleFrequency
  cronExpression?: string
  timezone?: string
  runTime?: string // HH:MM format
  jobType: string
  input?: Json
}

export type UpdateScheduleInput = {
  name?: string
  frequency?: ScheduleFrequency
  cronExpression?: string
  timezone?: string
  runTime?: string // HH:MM format
  input?: Json
  isActive?: boolean
}

export async function createSchedule(
  input: CreateScheduleInput
): Promise<Schedule | null> {
  if (!input.jobType) {
    console.error("jobType must be provided")
    return null
  }

  const timezone = input.timezone ?? "UTC"
  if (!isValidTimezone(timezone)) return null

  const nextRunAt = calculateNextRun(
    input.frequency,
    input.cronExpression,
    timezone,
    input.runTime
  )
  if (nextRunAt === null) return null

  const { data, error } = await getSupabase()
    .from("schedules")
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      frequency: input.frequency,
      cron_expression: input.cronExpression ?? null,
      timezone,
      run_time: input.runTime ?? null,
      job_type: input.jobType,
      input: input.input ?? null,
      next_run_at: nextRunAt?.toISOString() ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to create schedule:", error)
    return null
  }

  return data as Schedule
}

export async function getScheduleById(
  scheduleId: string,
  tenantId: string
): Promise<Schedule | null> {
  const { data } = await getSupabase()
    .from("schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("tenant_id", tenantId)
    .single()

  return data as Schedule | null
}

export async function listSchedules(
  tenantId: string,
  options: { limit?: number; activeOnly?: boolean } = {}
): Promise<Schedule[]> {
  let query = getSupabase()
    .from("schedules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })

  if (options.activeOnly) {
    query = query.eq("is_active", true)
  }
  if (options.limit) {
    query = query.limit(options.limit)
  }

  const { data } = await query

  return (data as Schedule[] | null) ?? []
}

export async function updateSchedule(
  scheduleId: string,
  tenantId: string,
  updates: UpdateScheduleInput
): Promise<Schedule | null> {
  if (updates.timezone !== undefined && !isValidTimezone(updates.timezone)) return null

  const updateData: TablesUpdate<"schedules"> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.frequency !== undefined) updateData.frequency = updates.frequency
  if (updates.cronExpression !== undefined) updateData.cron_expression = updates.cronExpression
  if (updates.timezone !== undefined) updateData.timezone = updates.timezone
  if (updates.runTime !== undefined) updateData.run_time = updates.runTime
  if (updates.input !== undefined) updateData.input = updates.input
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive

  if (
    updates.frequency !== undefined ||
    updates.cronExpression !== undefined ||
    updates.timezone !== undefined ||
    updates.runTime !== undefined
  ) {
    const schedule = await getScheduleById(scheduleId, tenantId)
    if (schedule) {
      const nextRunAt = calculateNextRun(
        updates.frequency ?? schedule.frequency,
        updates.cronExpression ?? schedule.cron_expression ?? undefined,
        updates.timezone ?? schedule.timezone,
        updates.runTime ?? schedule.run_time ?? undefined
      )
      if (nextRunAt === null) return null
      updateData.next_run_at = nextRunAt?.toISOString() ?? null
    }
  }

  const { data, error } = await getSupabase()
    .from("schedules")
    .update(updateData)
    .eq("id", scheduleId)
    .eq("tenant_id", tenantId)
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to update schedule:", error)
    return null
  }

  return data as Schedule
}

export async function deleteSchedule(
  scheduleId: string,
  tenantId: string
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("tenant_id", tenantId)
    .select("id")

  return !error && (data ?? []).length > 0
}

export async function getNextDueSchedules(limit: number = 100): Promise<Schedule[]> {
  const now = new Date().toISOString()

  const { data, error } = await getSupabase()
    .from("schedules")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch due schedules: ${error.message}`)
  }

  return (data as Schedule[] | null) ?? []
}

export async function markScheduleRun(scheduleId: string): Promise<Schedule | null> {
  const schedule = await getSupabase()
    .from("schedules")
    .select("*")
    .eq("id", scheduleId)
    .single()

  if (!schedule.data) return null

  return claimScheduleRun(schedule.data as Schedule)
}

async function claimScheduleRun(schedule: Schedule): Promise<Schedule | null> {
  const s = schedule
  const nextRunAt = calculateNextRun(
    s.frequency,
    s.cron_expression ?? undefined,
    s.timezone,
    s.run_time ?? undefined
  )
  if (nextRunAt === null && s.frequency !== "once") return null

  let query = getSupabase()
    .from("schedules")
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: s.frequency === "once" ? null : nextRunAt?.toISOString() ?? null,
      run_count: (s.run_count ?? 0) + 1,
      is_active: s.frequency === "once" ? false : s.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", s.id)
    .eq("is_active", true)

  if (s.next_run_at) query = query.eq("next_run_at", s.next_run_at)

  const { data, error } = await query
    .select()
    .maybeSingle()

  if (error) {
    console.error("Failed to mark schedule run:", error)
    return null
  }
  if (!data) return null

  return data as Schedule
}

async function restoreScheduleRun(
  schedule: Schedule,
  claimed: Schedule,
): Promise<boolean> {
  let query = getSupabase()
    .from("schedules")
    .update({
      last_run_at: schedule.last_run_at,
      next_run_at: schedule.next_run_at,
      run_count: schedule.run_count ?? 0,
      is_active: schedule.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schedule.id)
    .eq("run_count", claimed.run_count ?? 0)
    .eq("is_active", claimed.is_active)

  if (claimed.next_run_at === null) {
    query = query.is("next_run_at", null)
  } else {
    query = query.eq("next_run_at", claimed.next_run_at)
  }

  const { data, error } = await query.select("id").maybeSingle()
  if (error || !data) {
    console.error("Failed to restore schedule after job start failure:", error)
    return false
  }
  return true
}

export type ProcessDueSchedulesResult = {
  found: number
  started: number
  failed: number
}

type ScheduleProcessorDependencies = {
  createJob: (input: {
    tenantId: string
    type: string
    input?: Json
    idempotencyKey?: string
  }) => Promise<Job | null>
  startJobWorkflow: (job: Job) => Promise<string | null>
}

export async function processDueSchedules(
  dependencies?: ScheduleProcessorDependencies
): Promise<ProcessDueSchedulesResult> {
  const schedules = await getNextDueSchedules()
  const jobService = dependencies ?? await import("@/lib/services/jobs")
  let started = 0
  let failed = 0

  for (const schedule of schedules) {
    if (!schedule.job_type) {
      failed += 1
      continue
    }

    const claimed = await claimScheduleRun(schedule)
    if (!claimed) continue

    try {
      const job = await jobService.createJob({
        tenantId: schedule.tenant_id,
        type: schedule.job_type,
        input: schedule.input ?? undefined,
        idempotencyKey: `schedule:${schedule.id}:${schedule.next_run_at}`,
      })
      if (!job) {
        await restoreScheduleRun(schedule, claimed)
        failed += 1
        continue
      }

      if (!job.workflow_run_id && !(await jobService.startJobWorkflow(job))) {
        await restoreScheduleRun(schedule, claimed)
        failed += 1
        continue
      }

      started += 1
    } catch (error) {
      console.error(`Failed to start scheduled job ${schedule.id}:`, error)
      await restoreScheduleRun(schedule, claimed)
      failed += 1
    }
  }

  return { found: schedules.length, started, failed }
}

export function calculateNextRun(
  frequency: ScheduleFrequency,
  cronExpression?: string,
  timezone: string = "UTC",
  runTime?: string
): Date | null {
  const now = new Date()
  if (!isValidTimezone(timezone)) return null

  const parsedRunTime = parseRunTime(runTime)
  if (!parsedRunTime) return null
  const [hours, minutes] = parsedRunTime

  switch (frequency) {
    case "once":
      return new Date(now.getTime() + 60 * 1000)

    case "hourly":
      return new Date(now.getTime() + 60 * 60 * 1000)

    case "daily": {
      return parseCronExpression(`${minutes} ${hours} * * *`, timezone, now)
    }

    case "weekly": {
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
      }).format(now)
      return parseCronExpression(
        `${minutes} ${hours} * * ${weekday.toLowerCase()}`,
        timezone,
        new Date(now.getTime() + 24 * 60 * 60 * 1000)
      )
    }

    case "monthly": {
      return parseCronExpression(`${minutes} ${hours} 1 * *`, timezone, now)
    }

    case "cron":
      if (!cronExpression) return null
      return parseCronExpression(cronExpression, timezone, now)

    default:
      return null
  }
}

function parseCronExpression(
  expression: string,
  timezone: string,
  currentDate: Date
): Date | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null

  try {
    return CronExpressionParser.parse(expression, {
      currentDate,
      tz: timezone,
    }).next().toDate()
  } catch {
    return null
  }
}

function parseRunTime(runTime?: string): [number, number] | null {
  if (runTime === undefined) return [9, 0]
  const match = /^(\d{2}):(\d{2})$/.exec(runTime)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return [hours, minutes]
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}
