"use client"

import { Badge } from "@/components/ui/badge"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { getTimelineState } from "@/lib/utils/timeline"
import type { EventContext } from "../use-event-context"
import type { EventActionsApi } from "../use-event-actions"
import { EventLifecycleSection } from "../tabs/event-lifecycle-section"
import { EventSeedSection } from "../tabs/event-seed-section"
import { EventResultsSection } from "../tabs/event-results-section"
import { BackHeader } from "./inline-settings"

export type EventView = "lifecycle" | "seed" | "results"

interface InlineEventToolsProps {
  eventContext: EventContext
  view: EventView
  onBack: () => void
  actions: EventActionsApi
}

export function InlineEventTools({
  eventContext,
  view,
  onBack,
  actions,
}: InlineEventToolsProps) {
  const {
    hackathonId,
    status,
    phase,
    startsAt,
    endsAt,
    registrationOpensAt,
    registrationClosesAt,
  } = eventContext

  const timelineState = getTimelineState({
    status: status as HackathonStatus,
    registration_opens_at: registrationOpensAt,
    registration_closes_at: registrationClosesAt,
    starts_at: startsAt,
    ends_at: endsAt,
  })

  const titles: Record<EventView, string> = {
    lifecycle: "Event lifecycle",
    seed: "Event seed data",
    results: "Event results",
  }

  return (
    <div className="space-y-3 p-3">
      <BackHeader onBack={onBack} title={titles[view]} />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground truncate">{eventContext.name}</span>
        <Badge variant={timelineState.variant} className="text-xs shrink-0">
          {timelineState.label}
        </Badge>
      </div>

      {view === "lifecycle" && (
        <EventLifecycleSection
          hackathonId={hackathonId}
          status={status}
          phase={phase}
          pending={actions.pending}
          setPending={actions.setPending}
          showToast={actions.showToast}
          devAction={actions.runAction}
          onRefresh={() => {
            eventContext.refetch()
          }}
        />
      )}
      {view === "seed" && (
        <EventSeedSection
          seedStatus={actions.seedStatus}
          pending={actions.pending}
          devAction={actions.runAction}
        />
      )}
      {view === "results" && (
        <EventResultsSection
          seedStatus={actions.seedStatus}
          pending={actions.pending}
          devAction={actions.runAction}
        />
      )}
    </div>
  )
}
