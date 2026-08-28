import type { PreparedProjectDraft } from "@/lib/webmcp/event-attendee-tools"

export const PREPARE_PROJECT_EVENT = "oatmeal:webmcp:prepare-project"
export const PREPARE_TEAM_INVITE_EVENT = "oatmeal:webmcp:prepare-team-invite"
export const PREPARE_SPONSOR_EVENT = "oatmeal:webmcp:prepare-sponsor"

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
  slug: string
  target?: string
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

export type PrepareSponsorActionResult =
  | { ok: true }
  | {
      ok: false
      error: {
        code: "preparation_unavailable"
        message: string
        retryable: false
      }
    }

type PrepareSponsorActionDetail = {
  name: string
  acknowledge: (result: PrepareSponsorActionResult) => void
}

export type PrepareSponsorEvent = CustomEvent<PrepareSponsorActionDetail>

export function dispatchPrepareProjectAction(
  slug: string,
  draft: PreparedProjectDraft,
  target?: string,
): PrepareProjectActionResult {
  let outcome: PrepareProjectActionResult | null = null
  window.dispatchEvent(new CustomEvent<PrepareProjectActionDetail>(PREPARE_PROJECT_EVENT, {
    detail: {
      slug,
      target,
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

export function dispatchPrepareSponsorAction(
  name: string,
): PrepareSponsorActionResult {
  let outcome: PrepareSponsorActionResult | null = null
  window.dispatchEvent(new CustomEvent<PrepareSponsorActionDetail>(PREPARE_SPONSOR_EVENT, {
    detail: {
      name,
      acknowledge: (result) => {
        if (outcome === null) outcome = result
      },
    },
  }))
  return outcome ?? {
    ok: false,
    error: {
      code: "preparation_unavailable",
      message: "The sponsor editor isn't ready. Reload the page and try again.",
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
