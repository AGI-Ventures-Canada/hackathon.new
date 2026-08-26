"use client"

import { useSyncExternalStore } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

const noop = () => () => {}
const getIsMac = () => navigator.userAgent.includes("Mac")
const getServerIsMac = () => false

interface CreateFlowProgressProps {
  currentStep: number
  totalSteps: number
  canSkip: boolean
  onSkip: () => void
  onClose: () => void
  skipLabel?: string
}

export function CreateFlowProgress({
  currentStep,
  totalSteps,
  canSkip,
  onSkip,
  onClose,
  skipLabel = "Skip to event page",
}: CreateFlowProgressProps) {
  const isMac = useSyncExternalStore(noop, getIsMac, getServerIsMac)

  return (
    <div className="flex items-center justify-between">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="size-8 text-muted-foreground"
      >
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </Button>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuenow={currentStep + 1}
        aria-valuemax={totalSteps}
        className="flex items-center gap-2"
      >
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 w-6 rounded-full transition-colors duration-500",
              i <= currentStep
                ? "bg-primary"
                : "bg-muted-foreground/15",
            )}
          />
        ))}
        <span className="sr-only">
          {currentStep + 1} / {totalSteps}
        </span>
      </div>

      {canSkip ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="gap-2 text-muted-foreground"
        >
          {skipLabel}
          <Kbd className="hidden sm:inline-flex">
            {isMac ? "⌘" : "Ctrl"}
            +Enter
          </Kbd>
        </Button>
      ) : (
        <div className="w-[140px]" />
      )}
    </div>
  )
}
