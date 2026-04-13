"use client"

import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Check } from "lucide-react"
import { useActionItems } from "./action-items-context"
import { LIFECYCLE_STAGES, PHASE_LABELS, resolveStageIndex } from "@/lib/utils/lifecycle-stages"

export function StatusBadgeMenu() {
  const { hackathonStatus, hackathonPhase, triggerTransition } = useActionItems()

  const currentIndex = resolveStageIndex(hackathonStatus)
  const currentStage = LIFECYCLE_STAGES[currentIndex]
  const phaseLabel = hackathonPhase ? PHASE_LABELS[hackathonPhase] : null
  const badgeLabel = phaseLabel ? `${currentStage.label} · ${phaseLabel}` : currentStage.label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">
          <Badge variant={currentStage.badgeVariant} className="cursor-pointer">
            {badgeLabel}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {LIFECYCLE_STAGES.map((stage, index) => {
          const Icon = stage.icon
          const isCurrent = index === currentIndex
          const isPast = index < currentIndex

          return (
            <DropdownMenuItem
              key={stage.key}
              disabled={isCurrent || isPast}
              onClick={() => !isCurrent && !isPast && triggerTransition(stage.key)}
              className="gap-2"
            >
              <Icon className="size-4 shrink-0" />
              <span className={isPast ? "text-muted-foreground" : undefined}>
                {stage.label}
              </span>
              {isCurrent && <Check className="size-3.5 ml-auto shrink-0" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
