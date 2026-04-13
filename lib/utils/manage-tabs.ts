export const VALID_TABS = ["action-items", "overview", "edit", "teams", "rooms", "submissions", "judging", "post-event", "event", "activity"] as const
export const VALID_ETABS = ["challenge", "announcements", "mentors", "social", "email"] as const

export type ManageTab = (typeof VALID_TABS)[number]
export type ManageEtab = (typeof VALID_ETABS)[number]

export const DEFAULT_TAB: ManageTab = "action-items"

export function resolveTab(tab: string | undefined, validTabs: readonly string[], fallback: string): string {
  if (tab === "judges" || tab === "prizes") return "judging"
  if (tab === "fulfillment") return "post-event"
  return tab && validTabs.includes(tab) ? tab : fallback
}

export function getJudgingRedirectUrl(slug: string): string {
  return `/e/${slug}/manage?tab=judging`
}
