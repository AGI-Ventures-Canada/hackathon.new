"use client"

import { cn } from "@/lib/utils"

type RubricLevel = {
  id: string
  level_number: number
  label: string
  description: string | null
}

type Props = {
  levels: RubricLevel[]
  selectedLevel: number | null
  onSelect: (levelNumber: number | null) => void
  disabled?: boolean
}

export function RubricLevelSelector({ levels, selectedLevel, onSelect, disabled = false }: Props) {
  const sortedLevels = [...levels].sort((a, b) => b.level_number - a.level_number)

  return (
    <div className="flex flex-col gap-1">
      {sortedLevels.map((level) => (
        <button
          key={level.id}
          type="button"
          disabled={disabled}
          onClick={() =>
            onSelect(selectedLevel === level.level_number ? null : level.level_number)
          }
          className={cn(
            "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
            selectedLevel === level.level_number
              ? "border-primary bg-muted"
              : "border-border hover:bg-muted"
          )}
        >
          <span className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            selectedLevel === level.level_number
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}>
            {level.level_number}
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium">{level.label}</div>
            {level.description && (
              <div className="mt-0.5 text-xs text-muted-foreground">{level.description}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
