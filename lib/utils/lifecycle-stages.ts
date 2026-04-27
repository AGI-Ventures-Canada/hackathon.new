import { EyeOff, Globe, Zap, Lock, Trophy } from "lucide-react"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"
import type { ActionItem } from "@/lib/utils/organizer-actions"

export const LIFECYCLE_STAGES = [
  { key: "draft", label: "Draft", icon: EyeOff, badgeVariant: "secondary" },
  { key: "published", label: "Published", icon: Globe, badgeVariant: "default" },
  { key: "active", label: "Live", icon: Zap, badgeVariant: "default" },
  { key: "judging", label: "Judging", icon: Lock, badgeVariant: "default" },
  { key: "completed", label: "Completed", icon: Trophy, badgeVariant: "outline" },
] as const

export type StageKey = (typeof LIFECYCLE_STAGES)[number]["key"]

export const PHASE_LABELS: Record<HackathonPhase, string> = {
  build: "Building",
  submission_open: "Submissions Open",
  preliminaries: "Preliminary Judging",
  finals: "Grand Finals",
  results_pending: "Results Pending",
}

export function resolveStageIndex(status: HackathonStatus): number {
  switch (status) {
    case "draft":
      return 0
    case "published":
    case "registration_open":
      return 1
    case "active":
      return 2
    case "judging":
      return 3
    case "completed":
    case "archived":
      return 4
    default:
      return 0
  }
}

export function stageKeyForStatus(status: HackathonStatus): StageKey {
  return LIFECYCLE_STAGES[resolveStageIndex(status)].key
}

export const TRANSITION_CONFIRMATIONS: Record<string, { title: string; description: string }> = {
  "draft→published": {
    title: "Publish hackathon?",
    description: "Your hackathon will become visible and open for registration.",
  },
  "published→active": {
    title: "Start hackathon?",
    description: "The hackathon will go live and participants can start building.",
  },
  "active→judging": {
    title: "Close submissions?",
    description: "Submissions will close and the judging phase will begin.",
  },
  "judging→completed": {
    title: "Complete the event?",
    description: "The event will be marked as completed. Results will be calculated and published if possible.",
  },
  "published→draft": {
    title: "Take offline?",
    description: "Your hackathon will be hidden from the browse page and registration will close.",
  },
  "active→draft": {
    title: "Take offline?",
    description: "The hackathon will be taken offline and hidden from the browse page.",
  },
  "active→published": {
    title: "Revert to published?",
    description: "The hackathon will revert to the published phase.",
  },
  "judging→active": {
    title: "Reopen submissions?",
    description: "This will reopen the hackathon for submissions.",
  },
  "judging→published": {
    title: "Revert to published?",
    description: "The hackathon will revert to the published phase.",
  },
  "judging→draft": {
    title: "Revert to draft?",
    description: "The hackathon will be taken offline and hidden from the browse page.",
  },
  "completed→judging": {
    title: "Revert to judging?",
    description: "This will reopen the judging phase.",
  },
  "completed→active": {
    title: "Reopen submissions?",
    description: "Results will be unpublished and the hackathon will reopen for submissions.",
  },
  "completed→published": {
    title: "Revert to published?",
    description: "Results will be unpublished and the hackathon will revert to the published phase.",
  },
  "completed→draft": {
    title: "Revert to draft?",
    description: "Results will be unpublished and the hackathon will be taken offline.",
  },
}

export function getTransitionConfirmation(from: HackathonStatus, to: string) {
  const fromKey = stageKeyForStatus(from)
  return TRANSITION_CONFIRMATIONS[`${fromKey}→${to}`] ?? {
    title: `Switch to ${to}?`,
    description: `This will change the hackathon status to "${to}".`,
  }
}

const ACTIVE_REOPEN_EXTENSION_MS = 60 * 60 * 1000

export function applyOptimisticStage(
  baseStatus: HackathonStatus,
  optimisticStage: StageKey | null,
): HackathonStatus {
  return optimisticStage ?? baseStatus
}

export function shouldClearOptimisticStage(
  baseStatus: HackathonStatus,
  optimisticStage: StageKey | null,
): boolean {
  return !!optimisticStage && stageKeyForStatus(baseStatus) === optimisticStage
}

export function buildHackathonFingerprint(args: {
  status: HackathonStatus
  phase: HackathonPhase | null
  startsAt: string | null
  endsAt: string | null
  actionItems: ActionItem[]
}): string {
  return [
    args.status,
    args.phase ?? "",
    args.startsAt ?? "",
    args.endsAt ?? "",
    args.actionItems
      .map((i) => `${i.id}:${i.close.kind === "auto" ? i.close.isComplete : ""}`)
      .join(","),
  ].join("|")
}

export function buildStatusTransitionBody(
  targetStage: StageKey,
  endsAt: string | null | undefined,
): Record<string, unknown> {
  const dbStatus = targetStage === "published" ? "registration_open" : targetStage
  const body: Record<string, unknown> = { status: dbStatus }
  const now = Date.now()

  if (targetStage === "judging") {
    if (!endsAt || new Date(endsAt).getTime() > now) {
      body.endsAt = new Date(now).toISOString()
    }
  }
  if (targetStage === "active") {
    if (endsAt && new Date(endsAt).getTime() <= now) {
      body.endsAt = new Date(now + ACTIVE_REOPEN_EXTENSION_MS).toISOString()
    }
  }

  return body
}
