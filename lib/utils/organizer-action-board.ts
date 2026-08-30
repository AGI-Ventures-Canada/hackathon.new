import type { ActionItem, ActionSeverity } from "@/lib/utils/organizer-actions"
import {
  ORGANIZER_SECTION_CONFIG,
  type OrganizerSection,
} from "@/lib/webmcp/organizer-parity"

export type OrganizerTaskState = "pending" | "completed" | "dismissed"

export const MAX_CUSTOM_ORGANIZER_ACTION_ITEMS = 500

export type OrganizerTask = {
  taskRef: string
  label: string
  hint: string | null
  tooltip: string | null
  severity: ActionSeverity
  state: OrganizerTaskState
  completionPolicy: ActionItem["close"]["kind"]
  custom: boolean
  destination: OrganizerSection
  inspectUrl: string
  ctaLabel: string | null
  blocksProgress: boolean
  updatedAt: string | null
}

export type OrganizerTaskPage = {
  event: { name: string; slug: string }
  totalCount: number
  pendingCount: number
  completedCount: number
  dismissedCount: number
  offset: number
  limit: number
  hasMore: boolean
  nextOffset: number | null
  items: OrganizerTask[]
}

function judgingSection(item: ActionItem): OrganizerSection {
  if (item.subtabKey !== "jtab") return "judging"
  if (item.subtab === "setup") return "judging_setup"
  if (item.subtab === "judges") return "judges"
  if (item.subtab === "rounds") return "rounds"
  if (item.subtab === "prizes") return "prizes"
  if (item.subtab === "assignments") return "assignments"
  if (item.subtab === "results") return "results"
  return "judging"
}

function postEventSection(item: ActionItem): OrganizerSection {
  if (item.subtabKey !== "ptab") return "post_event"
  if (item.subtab === "fulfillment") return "fulfillment"
  if (item.subtab === "feedback") return "feedback"
  if (item.subtab === "exports") return "exports"
  return "post_event"
}

export function organizerSectionForActionItem(
  item: ActionItem,
): OrganizerSection {
  if (item.tab === "judging") return judgingSection(item)
  if (item.tab === "post-event") return postEventSection(item)
  if (item.tab === "event") {
    if (item.subtab === "announcements") return "announcements"
    if (item.subtab === "mentors") return "mentors"
    if (item.subtab === "social") return "social"
    if (item.subtab === "email") return "email"
    return "communications"
  }
  if (item.tab === "miscs") {
    if (item.subtab === "rooms") return "rooms"
    if (item.subtab === "activity") return "activity"
    if (item.subtab === "terms") return "terms"
    return "miscs"
  }
  if (item.tab === "edit") return "event_page"
  if (item.tab === "challenges") return "challenges"
  if (item.tab === "perks") return "perks"
  if (item.tab === "teams") return "teams"
  if (item.tab === "people") return "people"
  if (item.action === "open-agenda-dialog") return "schedule"
  return "action_items"
}

export function organizerTaskInspectUrl(
  slug: string,
  item: ActionItem,
): string {
  const section = organizerSectionForActionItem(item)
  return `/e/${slug}/manage?${ORGANIZER_SECTION_CONFIG[section].params}`
}

export function toOrganizerTask(
  slug: string,
  item: ActionItem,
  state: OrganizerTaskState,
  options: { custom?: boolean; updatedAt?: string | null } = {},
): OrganizerTask {
  const destination = organizerSectionForActionItem(item)
  return {
    taskRef: item.id,
    label: item.label,
    hint: item.hint ?? null,
    tooltip: item.tooltip ?? null,
    severity: item.severity,
    state,
    completionPolicy: item.close.kind,
    custom: options.custom ?? item.id.startsWith("custom-"),
    destination,
    inspectUrl: organizerTaskInspectUrl(slug, item),
    ctaLabel: item.ctaLabel ?? null,
    blocksProgress:
      state === "pending" &&
      (item.severity === "urgent" || item.close.kind === "transition"),
    updatedAt: options.updatedAt ?? null,
  }
}
