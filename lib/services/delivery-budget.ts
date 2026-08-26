import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"
import { sha256Fingerprint } from "@/lib/utils/hash"

const PROGRESS_TTL_MS = 30 * 24 * 60 * 60 * 1_000

export type DeliveryBudget = {
  remainingRecipients: number
  deadlineAt: number
}

export function createDeliveryBudget(
  remainingRecipients: number,
  deadlineAt: number,
): DeliveryBudget {
  return {
    remainingRecipients: Math.max(0, Math.floor(remainingRecipients)),
    deadlineAt,
  }
}

export function hasDeliveryCapacity(budget?: DeliveryBudget): boolean {
  return !budget || (
    budget.remainingRecipients > 0 &&
    Date.now() < budget.deadlineAt
  )
}

export function consumeDeliverySlot(budget?: DeliveryBudget): boolean {
  if (!hasDeliveryCapacity(budget)) return false
  if (budget) budget.remainingRecipients--
  return true
}

async function progressKey(workKey: string, taskKey: string): Promise<string> {
  const [workFingerprint, taskFingerprint] = await Promise.all([
    sha256Fingerprint(workKey, 32),
    sha256Fingerprint(taskKey, 32),
  ])
  return `delivery-progress:${workFingerprint}:${taskFingerprint}`
}

export type DeliveryTaskSelection<T> = {
  tasks: T[]
  deferred: boolean
}

export async function selectPendingDeliveryTasks<T>(
  workKey: string,
  tasks: T[],
  getTaskKey: (task: T) => string,
  budget?: DeliveryBudget,
): Promise<DeliveryTaskSelection<T>> {
  if (tasks.length === 0) return { tasks: [], deferred: false }
  if (budget && !hasDeliveryCapacity(budget)) {
    return { tasks: [], deferred: tasks.length > 0 }
  }

  const client = getSupabase() as unknown as SupabaseClient
  const selected: T[] = []
  const limit = budget?.remainingRecipients ?? tasks.length
  const now = Date.now()

  for (let offset = 0; offset < tasks.length; offset += 100) {
    if (budget && !hasDeliveryCapacity(budget)) {
      return { tasks: selected, deferred: true }
    }

    const page = tasks.slice(offset, offset + 100)
    const keyed = await Promise.all(page.map(async (task) => ({
      task,
      progressKey: await progressKey(workKey, getTaskKey(task)),
    })))
    const { data, error } = await client
      .from("rate_limits")
      .select("key, reset_at")
      .in("key", keyed.map((entry) => entry.progressKey))

    if (error) throw new Error("Failed to load email delivery progress.")
    const completed = new Set(
      (data ?? [])
        .filter((row) => row.reset_at > now)
        .map((row) => row.key),
    )

    for (let index = 0; index < keyed.length; index++) {
      const entry = keyed[index]
      if (completed.has(entry.progressKey)) continue
      if (selected.length === limit) {
        return { tasks: selected, deferred: true }
      }
      selected.push(entry.task)
      if (selected.length === limit) {
        const pageHasMore = keyed
          .slice(index + 1)
          .some((candidate) => !completed.has(candidate.progressKey))
        return {
          tasks: selected,
          deferred: pageHasMore || offset + page.length < tasks.length,
        }
      }
    }
  }

  return { tasks: selected, deferred: false }
}

export async function hasPendingDeliveryTasks<T>(
  workKey: string,
  tasks: T[],
  getTaskKey: (task: T) => string,
  budget?: DeliveryBudget,
): Promise<boolean> {
  if (tasks.length === 0) return false
  const selection = await selectPendingDeliveryTasks(
    workKey,
    tasks,
    getTaskKey,
    budget
      ? { remainingRecipients: 1, deadlineAt: budget.deadlineAt }
      : { remainingRecipients: 1, deadlineAt: Number.POSITIVE_INFINITY },
  )
  return selection.tasks.length > 0 || selection.deferred
}

export async function markDeliveryTaskComplete(
  workKey: string,
  taskKey: string,
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client.from("rate_limits").upsert({
    key: await progressKey(workKey, taskKey),
    count: 1,
    reset_at: Date.now() + PROGRESS_TTL_MS,
  })

  if (error) throw new Error("Failed to save email delivery progress.")
}

export async function runWithinDeliveryDeadline<T>(
  budget: DeliveryBudget | undefined,
  work: () => Promise<T>,
): Promise<{ completed: true; value: T } | { completed: false }> {
  if (!budget) return { completed: true, value: await work() }

  const remaining = budget.deadlineAt - Date.now()
  if (remaining <= 0) return { completed: false }

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work().then((value) => ({ completed: true as const, value })),
      new Promise<{ completed: false }>((resolve) => {
        timeout = setTimeout(() => resolve({ completed: false }), remaining)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
