import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"
import { getJudgingSetupStatus } from "@/lib/services/judging"
import { getJudgingCompletionReadiness } from "@/lib/services/lifecycle"
import {
  countFailedReminderEmails,
  getUnsentInvitationEmailCounts,
} from "@/lib/services/invitation-email-health"
import { buildOrganizerPollPayload } from "@/lib/services/organizer-polling"
import {
  getOrganizerActionItems,
  type ActionItem,
  type ActionSeverity,
} from "@/lib/utils/organizer-actions"
import {
  MAX_CUSTOM_ORGANIZER_ACTION_ITEMS,
  toOrganizerTask,
  type OrganizerTask,
  type OrganizerTaskPage,
  type OrganizerTaskState,
} from "@/lib/utils/organizer-action-board"

export type GeneratedOrganizerActionStateRow = {
  hackathon_id: string
  action_id: string
  item_kind: "generated"
  state: "completed" | "dismissed"
  item: unknown
  updated_at: string
}

export type CustomOrganizerActionItemRow = {
  id: string
  hackathon_id: string
  label: string
  severity: ActionSeverity
  completed_at: string | null
  updated_at: string
}

export type OrganizerActionStateSnapshot = {
  generated: GeneratedOrganizerActionStateRow[]
  custom: CustomOrganizerActionItemRow[]
}

export class OrganizerActionItemError extends Error {
  constructor(
    public readonly code:
      | "action_not_found"
      | "action_not_completable"
      | "action_not_dismissible"
      | "custom_action_not_found"
      | "custom_action_limit_reached"
      | "stale_action"
      | "task_board_unavailable",
    message: string,
  ) {
    super(message)
  }
}

const severityOrder: ActionSeverity[] = [
  "urgent",
  "warning",
  "scheduled",
  "info",
]

function isActionCompleted(item: ActionItem) {
  const close = (item as Partial<ActionItem>).close
  return close?.kind === "auto" && close.isComplete
}

function asActionItem(value: unknown): ActionItem | null {
  if (!value || typeof value !== "object") return null
  const item = value as Partial<ActionItem>
  if (
    typeof item.id !== "string" ||
    typeof item.label !== "string" ||
    !severityOrder.includes(item.severity as ActionSeverity) ||
    !item.close ||
    !["auto", "manual", "dismiss", "transition"].includes(item.close.kind)
  ) {
    return null
  }
  return item as ActionItem
}

function customRowToActionItem(row: CustomOrganizerActionItemRow): ActionItem {
  return {
    id: row.id,
    label: row.label,
    severity: row.severity,
    close: { kind: "manual" },
  }
}

function principalLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(0, 200)
}

async function loadGeneratedItems(hackathonId: string) {
  const [
    payload,
    judgingSetup,
    judgingCompletionReadiness,
    invitationEmailCounts,
    failedReminderCount,
  ] = await Promise.all([
    buildOrganizerPollPayload(hackathonId),
    getJudgingSetupStatus(hackathonId),
    getJudgingCompletionReadiness(hackathonId),
    getUnsentInvitationEmailCounts(hackathonId),
    countFailedReminderEmails(hackathonId),
  ])
  if (!payload) {
    throw new OrganizerActionItemError(
      "task_board_unavailable",
      "We couldn't load the event tasks. Try again.",
    )
  }
  return {
    event: { name: payload.name ?? "Event", slug: payload.slug ?? "" },
    items: getOrganizerActionItems({
      ...payload,
      judgingSetupReady: judgingSetup.isReady,
      requiresJudgeScoring: judgingSetup.requiresJudgeScoring,
      judgingCompletionReadiness,
      unsentInvitationEmailCount: invitationEmailCounts.total,
      unsentTeamInvitationEmailCount: invitationEmailCounts.teams,
      unsentJudgeInvitationEmailCount: invitationEmailCounts.judges,
      failedReminderCount,
    }),
  }
}

export async function listOrganizerActionState(
  hackathonId: string,
  currentItems: ActionItem[] = [],
): Promise<OrganizerActionStateSnapshot> {
  const client = getSupabase() as unknown as SupabaseClient
  const completedItems = currentItems.filter(isActionCompleted)
  if (completedItems.length > 0) {
    const { error } = await client
      .from("organizer_action_item_state")
      .upsert(
        completedItems.map((item) => ({
          hackathon_id: hackathonId,
          action_id: item.id,
          item_kind: "generated",
          state: "completed",
          item,
        })),
        { onConflict: "hackathon_id,action_id", ignoreDuplicates: true },
      )
    if (error) {
      throw new Error(`Failed to save completed event tasks: ${error.message}`)
    }
  }
  const [generatedResult, customResult] = await Promise.all([
    client
      .from("organizer_action_item_state")
      .select("hackathon_id, action_id, item_kind, state, item, updated_at")
      .eq("hackathon_id", hackathonId)
      .order("updated_at", { ascending: false }),
    client
      .from("organizer_custom_action_items")
      .select("id, hackathon_id, label, severity, completed_at, updated_at")
      .eq("hackathon_id", hackathonId)
      .order("created_at", { ascending: true })
      .limit(MAX_CUSTOM_ORGANIZER_ACTION_ITEMS + 1),
  ])

  if (generatedResult.error) {
    throw new Error(
      `Failed to load shared task state: ${generatedResult.error.message}`,
    )
  }
  if (customResult.error) {
    throw new Error(
      `Failed to load custom tasks: ${customResult.error.message}`,
    )
  }
  if ((customResult.data?.length ?? 0) > MAX_CUSTOM_ORGANIZER_ACTION_ITEMS) {
    throw new OrganizerActionItemError(
      "task_board_unavailable",
      "This event has too many custom tasks. Remove older tasks and try again.",
    )
  }

  return {
    generated: (generatedResult.data ?? []) as GeneratedOrganizerActionStateRow[],
    custom: (customResult.data ?? []) as CustomOrganizerActionItemRow[],
  }
}

type TaskEntry = {
  item: ActionItem
  state: OrganizerTaskState
  custom: boolean
  updatedAt: string | null
}

export async function getOrganizerTaskBoard(
  hackathonId: string,
  options: {
    offset?: number
    limit?: number
    state?: OrganizerTaskState | "all"
  } = {},
): Promise<OrganizerTaskPage> {
  const { event, items: generated } = await loadGeneratedItems(hackathonId)
  const stored = await listOrganizerActionState(hackathonId, generated)
  const storedById = new Map(stored.generated.map((row) => [row.action_id, row]))
  const currentIds = new Set(generated.map((item) => item.id))
  const entries: TaskEntry[] = generated.map((item) => {
    const saved = storedById.get(item.id)
    let state: OrganizerTaskState = isActionCompleted(item) ? "completed" : "pending"
    if (saved?.state === "completed" && item.close.kind === "manual") {
      state = "completed"
    } else if (saved?.state === "dismissed" && item.close.kind === "dismiss") {
      state = "dismissed"
    }
    return {
      item,
      state,
      custom: false,
      updatedAt: saved?.updated_at ?? null,
    }
  })

  for (const row of stored.generated) {
    if (currentIds.has(row.action_id) || row.state !== "completed") continue
    const item = asActionItem(row.item)
    if (!item) continue
    entries.push({
      item,
      state: "completed",
      custom: false,
      updatedAt: row.updated_at,
    })
  }

  for (const row of stored.custom) {
    entries.push({
      item: customRowToActionItem(row),
      state: row.completed_at ? "completed" : "pending",
      custom: true,
      updatedAt: row.updated_at,
    })
  }

  entries.sort((left, right) => {
    const stateOrder = { pending: 0, completed: 1, dismissed: 2 }
    const stateDifference = stateOrder[left.state] - stateOrder[right.state]
    if (stateDifference !== 0) return stateDifference
    const severityDifference =
      severityOrder.indexOf(left.item.severity) -
      severityOrder.indexOf(right.item.severity)
    if (severityDifference !== 0) return severityDifference
    return left.item.label.localeCompare(right.item.label)
  })

  const counts = entries.reduce(
    (result, entry) => {
      result[entry.state] += 1
      return result
    },
    { pending: 0, completed: 0, dismissed: 0 },
  )
  const state = options.state ?? "all"
  const filtered =
    state === "all" ? entries : entries.filter((entry) => entry.state === state)
  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.min(50, Math.max(1, options.limit ?? 20))
  const page = filtered.slice(offset, offset + limit)
  const items: OrganizerTask[] = page.map((entry) =>
    toOrganizerTask(event.slug, entry.item, entry.state, {
      custom: entry.custom,
      updatedAt: entry.updatedAt,
    }),
  )

  return {
    event,
    totalCount: filtered.length,
    pendingCount: counts.pending,
    completedCount: counts.completed,
    dismissedCount: counts.dismissed,
    offset,
    limit,
    hasMore: offset + page.length < filtered.length,
    nextOffset:
      offset + page.length < filtered.length ? offset + page.length : null,
    items,
  }
}

async function findGeneratedAction(hackathonId: string, actionId: string) {
  const { items } = await loadGeneratedItems(hackathonId)
  return items.find((item) => item.id === actionId) ?? null
}

function staleAction(): OrganizerActionItemError {
  return new OrganizerActionItemError(
    "stale_action",
    "That task changed. Refresh the list and try again.",
  )
}

export async function setOrganizerActionItemState(
  hackathonId: string,
  actionId: string,
  state: "pending" | "completed" | "dismissed",
  principal: string | null,
  expectedUpdatedAt?: string,
): Promise<OrganizerTask> {
  const client = getSupabase() as unknown as SupabaseClient
  if (actionId.startsWith("custom-")) {
    if (state === "dismissed") {
      throw new OrganizerActionItemError(
        "action_not_dismissible",
        "Custom tasks can be completed or reopened, but not dismissed.",
      )
    }
    const now = new Date().toISOString()
    let update = client
      .from("organizer_custom_action_items")
      .update({
        completed_at: state === "completed" ? now : null,
        updated_at: now,
        updated_by_principal: principalLabel(principal),
      })
      .eq("hackathon_id", hackathonId)
      .eq("id", actionId)
    if (expectedUpdatedAt) update = update.eq("updated_at", expectedUpdatedAt)
    const { data, error } = await update
      .select("id, hackathon_id, label, severity, completed_at, updated_at")
      .maybeSingle()
    if (error) throw new Error(`Failed to update custom task: ${error.message}`)
    if (!data) {
      if (expectedUpdatedAt) throw staleAction()
      throw new OrganizerActionItemError(
        "custom_action_not_found",
        "That custom task no longer exists.",
      )
    }
    const event = await loadGeneratedItems(hackathonId)
    return toOrganizerTask(
      event.event.slug,
      customRowToActionItem(data as CustomOrganizerActionItemRow),
      state,
      { custom: true, updatedAt: data.updated_at },
    )
  }

  const item = await findGeneratedAction(hackathonId, actionId)
  if (!item) {
    throw new OrganizerActionItemError(
      "action_not_found",
      "That task is no longer on this event.",
    )
  }
  if (state === "completed" && item.close.kind !== "manual") {
    throw new OrganizerActionItemError(
      "action_not_completable",
      "Finish the work on this task. It will close on its own.",
    )
  }
  if (state === "dismissed" && item.close.kind !== "dismiss") {
    throw new OrganizerActionItemError(
      "action_not_dismissible",
      "This task can't be dismissed.",
    )
  }
  if (state === "pending" && !["manual", "dismiss"].includes(item.close.kind)) {
    throw new OrganizerActionItemError(
      "action_not_completable",
      "This task follows the event and can't be reopened by hand.",
    )
  }

  if (state === "pending") {
    let deletion = client
      .from("organizer_action_item_state")
      .delete()
      .eq("hackathon_id", hackathonId)
      .eq("action_id", actionId)
    if (expectedUpdatedAt) deletion = deletion.eq("updated_at", expectedUpdatedAt)
    const { data, error } = await deletion.select("action_id")
    if (error) throw new Error(`Failed to reopen task: ${error.message}`)
    if (expectedUpdatedAt && (!data || data.length === 0)) throw staleAction()
    const event = await loadGeneratedItems(hackathonId)
    return toOrganizerTask(event.event.slug, item, "pending")
  }

  const now = new Date().toISOString()
  const mutation = {
    hackathon_id: hackathonId,
    action_id: actionId,
    item_kind: "generated" as const,
    state,
    item,
    created_by_principal: principalLabel(principal),
    updated_by_principal: principalLabel(principal),
    updated_at: now,
  }
  const { data, error } = expectedUpdatedAt
    ? await client
        .from("organizer_action_item_state")
        .update({
          state,
          item,
          updated_by_principal: mutation.updated_by_principal,
          updated_at: now,
        })
        .eq("hackathon_id", hackathonId)
        .eq("action_id", actionId)
        .eq("updated_at", expectedUpdatedAt)
        .select("updated_at")
        .maybeSingle()
    : await client
        .from("organizer_action_item_state")
        .upsert(mutation, { onConflict: "hackathon_id,action_id" })
        .select("updated_at")
        .single()
  if (error) throw new Error(`Failed to update task: ${error.message}`)
  if (!data) throw staleAction()
  const event = await loadGeneratedItems(hackathonId)
  return toOrganizerTask(event.event.slug, item, state, {
    updatedAt: data.updated_at,
  })
}

export async function createOrganizerCustomActionItem(
  hackathonId: string,
  label: string,
  severity: ActionSeverity,
  principal: string | null,
  requestedId?: string,
): Promise<OrganizerTask> {
  const cleanLabel = label.trim()
  if (!cleanLabel || cleanLabel.length > 200) {
    throw new Error("Task names must be between 1 and 200 characters.")
  }
  if (!severityOrder.includes(severity)) {
    throw new Error("Choose a valid task priority.")
  }
  const client = getSupabase() as unknown as SupabaseClient
  const id = requestedId ?? `custom-${crypto.randomUUID()}`
  if (!/^custom-[A-Za-z0-9_-]+$/.test(id) || id.length > 160) {
    throw new Error("Use a valid custom task reference.")
  }
  const actor = principalLabel(principal)
  const { data, error } = await client
    .from("organizer_custom_action_items")
    .upsert(
      {
        id,
        hackathon_id: hackathonId,
        label: cleanLabel,
        severity,
        created_by_principal: actor,
        updated_by_principal: actor,
      },
      { onConflict: "hackathon_id,id", ignoreDuplicates: true },
    )
    .select("id, hackathon_id, label, severity, completed_at, updated_at")
    .maybeSingle()
  if (error) {
    if (
      error.code === "23514" &&
      error.message.includes("organizer_custom_action_items_limit")
    ) {
      throw new OrganizerActionItemError(
        "custom_action_limit_reached",
        `An event can have up to ${MAX_CUSTOM_ORGANIZER_ACTION_ITEMS} custom tasks. Remove one before adding another.`,
      )
    }
    throw new Error(`Failed to add task: ${error.message}`)
  }
  let row = data as CustomOrganizerActionItemRow | null
  if (!row) {
    const existing = await client
      .from("organizer_custom_action_items")
      .select("id, hackathon_id, label, severity, completed_at, updated_at")
      .eq("hackathon_id", hackathonId)
      .eq("id", id)
      .maybeSingle()
    if (existing.error) {
      throw new Error(`Failed to load the existing task: ${existing.error.message}`)
    }
    row = existing.data as CustomOrganizerActionItemRow | null
  }
  if (!row || row.label !== cleanLabel || row.severity !== severity) {
    throw new OrganizerActionItemError(
      "stale_action",
      "That task reference is already used. Refresh the list and try again.",
    )
  }
  const event = await loadGeneratedItems(hackathonId)
  return toOrganizerTask(
    event.event.slug,
    customRowToActionItem(row),
    row.completed_at ? "completed" : "pending",
    { custom: true, updatedAt: row.updated_at },
  )
}

export async function deleteOrganizerCustomActionItem(
  hackathonId: string,
  actionId: string,
  expectedUpdatedAt?: string,
): Promise<void> {
  if (!actionId.startsWith("custom-")) {
    throw new OrganizerActionItemError(
      "custom_action_not_found",
      "Only custom tasks can be removed.",
    )
  }
  const client = getSupabase() as unknown as SupabaseClient
  let deletion = client
    .from("organizer_custom_action_items")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("id", actionId)
  if (expectedUpdatedAt) deletion = deletion.eq("updated_at", expectedUpdatedAt)
  const { data, error } = await deletion
    .select("id")
  if (error) throw new Error(`Failed to remove custom task: ${error.message}`)
  if (!data || data.length === 0) {
    if (expectedUpdatedAt) throw staleAction()
    throw new OrganizerActionItemError(
      "custom_action_not_found",
      "That custom task no longer exists.",
    )
  }
}

export type LegacyOrganizerActionImport = {
  completedIds: string[]
  dismissedIds: string[]
  customItems: Array<{
    id: string
    label: string
    severity: ActionSeverity
  }>
  completedSnapshots: Record<string, unknown>
}

export async function importLegacyOrganizerActionState(
  hackathonId: string,
  legacy: LegacyOrganizerActionImport,
  principal: string | null,
) {
  const client = getSupabase() as unknown as SupabaseClient
  const { items: currentItems } = await loadGeneratedItems(hackathonId)
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  const completedIds = new Set(legacy.completedIds.slice(0, 200))
  const dismissedIds = new Set(legacy.dismissedIds.slice(0, 200))
  const actor = principalLabel(principal)
  const now = new Date().toISOString()

  const customRows = legacy.customItems
    .slice(0, 100)
    .filter(
      (item) =>
        /^custom-[A-Za-z0-9_-]+$/.test(item.id) &&
        item.id.length <= 160 &&
        item.label.trim().length > 0 &&
        item.label.trim().length <= 200 &&
        severityOrder.includes(item.severity),
    )
    .map((item) => ({
      id: item.id,
      hackathon_id: hackathonId,
      label: item.label.trim(),
      severity: item.severity,
      completed_at: completedIds.has(item.id) ? now : null,
      created_by_principal: actor,
      updated_by_principal: actor,
    }))

  if (customRows.length > 0) {
    const { error } = await client
      .from("organizer_custom_action_items")
      .upsert(customRows, {
        onConflict: "hackathon_id,id",
        ignoreDuplicates: true,
      })
    if (error) throw new Error(`Failed to import custom tasks: ${error.message}`)
  }

  const generatedRows: Array<Record<string, unknown>> = []
  for (const actionId of completedIds) {
    if (actionId.startsWith("custom-")) continue
    const current = currentById.get(actionId)
    const snapshot = asActionItem(legacy.completedSnapshots[actionId])
    const historicalSnapshot = snapshot && (
      snapshot.close.kind === "manual" ||
      (snapshot.close.kind === "auto" && snapshot.close.isComplete)
    )
      ? snapshot
      : null
    const item = current ?? historicalSnapshot
    if (!item) continue
    if (current && current.close.kind !== "manual" && !isActionCompleted(current)) continue
    generatedRows.push({
      hackathon_id: hackathonId,
      action_id: actionId,
      item_kind: "generated",
      state: "completed",
      item,
      created_by_principal: actor,
      updated_by_principal: actor,
    })
  }
  for (const actionId of dismissedIds) {
    const item = currentById.get(actionId)
    if (!item || item.close.kind !== "dismiss") continue
    generatedRows.push({
      hackathon_id: hackathonId,
      action_id: actionId,
      item_kind: "generated",
      state: "dismissed",
      item,
      created_by_principal: actor,
      updated_by_principal: actor,
    })
  }

  if (generatedRows.length > 0) {
    const { error } = await client
      .from("organizer_action_item_state")
      .upsert(generatedRows, {
        onConflict: "hackathon_id,action_id",
        ignoreDuplicates: true,
      })
    if (error) throw new Error(`Failed to import task history: ${error.message}`)
  }

  return {
    customCount: customRows.length,
    generatedCount: generatedRows.length,
  }
}
