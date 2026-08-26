import type { PreparedProjectDraft } from "@/lib/webmcp/event-attendee-tools"

export const PREPARE_PROJECT_EVENT = "oatmeal:webmcp:prepare-project"
export const PREPARE_TEAM_INVITE_EVENT = "oatmeal:webmcp:prepare-team-invite"

export type PrepareProjectActionResult =
  | { ok: true }
  | {
      ok: false
      error: {
        code: "storage_unavailable" | "preparation_unavailable"
        message: string
        retryable: false
      }
    }

type PrepareProjectActionDetail = {
  draft: PreparedProjectDraft
  acknowledge: (result: PrepareProjectActionResult) => void
}

export type PrepareProjectEvent = CustomEvent<PrepareProjectActionDetail>

export type PrepareTeamInviteActionResult =
  | { ok: true }
  | {
      ok: false
      error: {
        code: "preparation_unavailable"
        message: string
        retryable: false
      }
    }

type PrepareTeamInviteActionDetail = {
  email: string
  acknowledge: (result: PrepareTeamInviteActionResult) => void
}

export type PrepareTeamInviteEvent = CustomEvent<PrepareTeamInviteActionDetail>

export function dispatchPrepareProjectAction(
  draft: PreparedProjectDraft,
): PrepareProjectActionResult {
  let outcome: PrepareProjectActionResult | null = null
  window.dispatchEvent(new CustomEvent<PrepareProjectActionDetail>(PREPARE_PROJECT_EVENT, {
    detail: {
      draft,
      acknowledge: (result) => {
        if (outcome === null) outcome = result
      },
    },
  }))
  return outcome ?? {
    ok: false,
    error: {
      code: "preparation_unavailable",
      message: "The project form isn't ready. Reload the page and try again.",
      retryable: false,
    },
  }
}

export function dispatchPrepareTeamInviteAction(
  email: string,
): PrepareTeamInviteActionResult {
  let outcome: PrepareTeamInviteActionResult | null = null
  window.dispatchEvent(new CustomEvent<PrepareTeamInviteActionDetail>(PREPARE_TEAM_INVITE_EVENT, {
    detail: {
      email,
      acknowledge: (result) => {
        if (outcome === null) outcome = result
      },
    },
  }))
  return outcome ?? {
    ok: false,
    error: {
      code: "preparation_unavailable",
      message: "The team invite form isn't ready. Reload the page and try again.",
      retryable: false,
    },
  }
}
