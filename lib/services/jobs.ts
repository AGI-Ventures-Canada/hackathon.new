/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — types.ts needs regeneration via `bun update-types` after DB migrations
import { supabase as getSupabase } from "@/lib/db/client"
import type { Job, JobStatus } from "@/lib/db/hackathon-types"
import type { Json } from "@/lib/db/types"

export type CreateJobInput = {
  tenantId: string
  type: string
  input?: Json
  createdByKeyId?: string
  idempotencyKey?: string
}

export async function createJob(input: CreateJobInput): Promise<Job | null> {
  if (input.idempotencyKey) {
    const { data: existing } = await getSupabase()
      .from("jobs")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .single()

    if (existing) {
      return existing as Job
    }
  }

  const { data, error } = await getSupabase()
    .from("jobs")
    .insert({
      tenant_id: input.tenantId,
      type: input.type,
      input: input.input,
      created_by_key_id: input.createdByKeyId,
      idempotency_key: input.idempotencyKey,
      status_cache: "queued",
    })
    .select()
    .single()

  if (error || !data) {
    if (error?.code === "23505" && input.idempotencyKey) {
      const { data: existing } = await getSupabase()
        .from("jobs")
        .select("*")
        .eq("tenant_id", input.tenantId)
        .eq("idempotency_key", input.idempotencyKey)
        .single()
      return existing as Job | null
    }
    console.error("Failed to create job:", error)
    return null
  }

  return data as Job
}

export async function getJobById(
  jobId: string,
  tenantId: string
): Promise<Job | null> {
  const { data } = await getSupabase()
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .single()

  return data as Job | null
}

export async function listJobs(
  tenantId: string,
  options: { limit?: number; offset?: number; status?: JobStatus } = {}
): Promise<Job[]> {
  let query = getSupabase()
    .from("jobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })

  if (options.status) {
    query = query.eq("status_cache", options.status)
  }
  if (options.limit) {
    query = query.limit(options.limit)
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1)
  }

  const { data } = await query

  return (data as Job[] | null) ?? []
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates: { result?: Json; error?: Json; workflowRunId?: string } = {}
): Promise<Job | null> {
  const updateData: Record<string, unknown> = {
    status_cache: status,
    updated_at: new Date().toISOString(),
  }

  if (updates.result !== undefined) {
    updateData.result = updates.result
  }
  if (updates.error !== undefined) {
    updateData.error = updates.error
  }
  if (updates.workflowRunId !== undefined) {
    updateData.workflow_run_id = updates.workflowRunId
  }
  if (status === "succeeded" || status === "failed" || status === "canceled") {
    updateData.completed_at = new Date().toISOString()
  }

  let query = getSupabase()
    .from("jobs")
    .update(updateData)
    .eq("id", jobId)

  if (status !== "canceled") query = query.neq("status_cache", "canceled")
  const { data, error } = await query.select().single()

  if (error || !data) {
    console.error("Failed to update job:", error)
    return null
  }

  return data as Job
}

export async function cancelJob(
  jobId: string,
  tenantId: string
): Promise<boolean> {
  const job = await getJobById(jobId, tenantId)
  if (!job) return false

  if (job.status_cache !== "queued" && job.status_cache !== "running") {
    return false
  }

  const { data, error } = await getSupabase()
    .from("jobs")
    .update({
      status_cache: "canceled",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .in("status_cache", ["queued", "running"])
    .select("id")
  if (error || (data ?? []).length !== 1) return false

  if (job.workflow_run_id && !job.workflow_run_id.startsWith("starting:")) {
    try {
      const { getRun } = await import("workflow/api")
      await getRun(job.workflow_run_id).cancel()
    } catch (workflowError) {
      console.error("Job canceled, but its workflow could not be stopped:", workflowError)
    }
  }
  return true
}

export async function startJobWorkflow(job: Job): Promise<string | null> {
  if (job.workflow_run_id) return job.workflow_run_id
  const claimMarker = `starting:${crypto.randomUUID()}`
  const { data: claimed, error: claimError } = await getSupabase()
    .from("jobs")
    .update({ workflow_run_id: claimMarker, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .is("workflow_run_id", null)
    .eq("status_cache", "queued")
    .select("id")
  if (claimError || (claimed ?? []).length === 0) return null

  let startedRunId: string | null = null
  try {
    const { start } = await import("workflow/api")
    const { runJobWorkflow } = await import("@/lib/workflows/jobs")

    const run = await start(runJobWorkflow, [
      {
        jobId: job.id,
        tenantId: job.tenant_id,
        type: job.type,
        input: job.input,
      },
    ])
    startedRunId = run.runId

    const { data: attached, error: updateError } = await getSupabase()
      .from("jobs")
      .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("workflow_run_id", claimMarker)
      .eq("status_cache", "queued")
      .select("id")
    if (updateError) throw updateError
    if (!attached || attached.length === 0) {
      try {
        const { getRun } = await import("workflow/api")
        await getRun(run.runId).cancel()
      } catch (cancelError) {
        console.error("Canceled job workflow could not be stopped:", cancelError)
      }
      return null
    }

    return run.runId
  } catch (err) {
    await getSupabase()
      .from("jobs")
      .update({ workflow_run_id: null, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("workflow_run_id", claimMarker)
    if (startedRunId) {
      try {
        const { getRun } = await import("workflow/api")
        await getRun(startedRunId).cancel()
      } catch (cancelError) {
        console.error("Failed to stop orphaned job workflow:", cancelError)
      }
    }
    console.error("Failed to start workflow:", err)
    return null
  }
}
