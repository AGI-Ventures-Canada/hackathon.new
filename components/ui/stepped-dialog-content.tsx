"use client"

import { Check, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type StepItem = {
  key: string
  label: string
  complete?: boolean
  disabled?: boolean
  icon?: LucideIcon
  stateLabel?: string
}

type SteppedDialogContentProps = {
  children: ReactNode
  className?: string
  currentStep: number
  description: string
  onStepChange: (stepIndex: number) => void
  stepsLayout?: "grid" | "timeline"
  stepColumns?: 1 | 2 | 3 | 4 | 5 | 6
  steps: StepItem[]
  title: string
}

const STEP_COLUMN_CLASSES: Record<NonNullable<SteppedDialogContentProps["stepColumns"]>, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
}

export function SteppedDialogContent({
  children,
  className,
  currentStep,
  description,
  onStepChange,
  stepsLayout = "grid",
  stepColumns = 2,
  steps,
  title,
}: SteppedDialogContentProps) {
  return (
    <DialogContent className={className}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {stepsLayout === "timeline" ? (
          <>
            {steps.length > 1 && (
              <div className="flex w-full items-center justify-center">
                {steps.map((step, index) => {
                  const Icon = step.icon
                  const isCurrent = currentStep === index
                  const isComplete = step.complete
                  const isLast = index === steps.length - 1

                  return (
                    <div key={step.key} className={cn("flex items-center", !isLast && "flex-1")}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={step.disabled}
                            aria-label={`Go to ${step.label} step`}
                            aria-current={isCurrent ? "step" : undefined}
                            onClick={() => onStepChange(index)}
                          >
                            <span
                              className={cn(
                                "flex size-8 items-center justify-center rounded-full border text-xs transition-colors",
                                isCurrent
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : Icon && isComplete
                                    ? "border-primary bg-primary/10 text-primary"
                                    : !Icon && isComplete
                                      ? "border-foreground text-foreground"
                                      : "border-border text-muted-foreground"
                              )}
                            >
                              {Icon ? (
                                <Icon className="size-4" />
                              ) : isComplete ? (
                                <Check className="size-3.5" />
                              ) : (
                                index + 1
                              )}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{step.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {step.stateLabel ?? (isCurrent ? "Current" : step.complete ? "Filled" : "Empty")}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                      {!isLast && <span className="mx-1 h-px flex-1 bg-border" />}
                    </div>
                  )
                })}
              </div>
            )}

            {children}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Step {currentStep + 1} of {steps.length}
              </span>
              <span>{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
            </div>

            <div className={cn("grid grid-cols-2 gap-2", STEP_COLUMN_CLASSES[stepColumns])}>
              {steps.map((step, index) => {
                const isCurrent = currentStep === index

                return (
                  <Button
                    key={step.key}
                    type="button"
                    variant={isCurrent ? "secondary" : "outline"}
                    className="h-auto flex-col items-start gap-1 py-2"
                    aria-label={`Go to ${step.label} step`}
                    disabled={step.disabled}
                    onClick={() => onStepChange(index)}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      {step.complete ? <Check className="size-3.5" /> : <span>{index + 1}</span>}
                      <span>{step.label}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {step.stateLabel ?? (step.complete ? "Filled" : "Empty")}
                    </span>
                  </Button>
                )
              })}
            </div>

            {children}
          </>
        )}
      </div>
    </DialogContent>
  )
}
