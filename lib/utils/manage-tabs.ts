export const VALID_TABS = ["action-items", "overview", "challenges", "edit", "teams", "miscs", "judging", "post-event", "event"] as const
export const VALID_ETABS = ["announcements", "mentors", "social", "email"] as const
export const VALID_MTABS = ["rooms", "activity"] as const
export const VALID_JTABS = ["data", "setup"] as const
export const VALID_PTABS = ["fulfillment", "feedback"] as const

export type ManageTab = (typeof VALID_TABS)[number]
export type ManageEtab = (typeof VALID_ETABS)[number]
export type ManageMtab = (typeof VALID_MTABS)[number]
export type ManageJtab = (typeof VALID_JTABS)[number]
export type ManagePtab = (typeof VALID_PTABS)[number]

export const DEFAULT_TAB: ManageTab = "action-items"
export const DEFAULT_MTAB: ManageMtab = "rooms"
export const DEFAULT_JTAB: ManageJtab = "data"
export const DEFAULT_PTAB: ManagePtab = "fulfillment"

export function resolveTab(tab: string | undefined, validTabs: readonly string[], fallback: string): string {
  if (tab === "judges" || tab === "prizes") return "judging"
  if (tab === "fulfillment") return "post-event"
  if (tab === "feedback") return "post-event"
  if (tab === "rooms") return "miscs"
  if (tab === "activity") return "miscs"
  if (tab === "submissions") return "teams"
  if (tab === "challenge") return "challenges"
  return tab && validTabs.includes(tab) ? tab : fallback
}

export function getJudgingRedirectUrl(slug: string): string {
  return `/e/${slug}/manage?tab=judging`
}
