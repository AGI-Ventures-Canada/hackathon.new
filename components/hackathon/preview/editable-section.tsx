"use client"

import { Pencil } from "lucide-react"
import { useEdit, type EditSection } from "./edit-context"
import { cn } from "@/lib/utils"

interface EditableSectionProps {
  section: EditSection
  children: React.ReactNode
  isEmpty?: boolean
  emptyLabel?: string
  className?: string
  onClick?: () => void
}

export function EditableSection({
  section,
  children,
  isEmpty = false,
  emptyLabel = "Click to add content",
  className,
  onClick,
}: EditableSectionProps) {
  const { isEditable, editMode, openSection } = useEdit()

  if (!isEditable || !editMode) {
    if (isEmpty) return null
    return <>{children}</>
  }

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      openSection(section)
    }
  }

  if (isEmpty) {
    return (
      <button
        type="button"
        onClick={handleClick}
        data-edit-section={section}
        className={cn(
          "group relative w-full cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 scroll-mt-24",
          className
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Pencil className="size-5" />
          <span className="text-sm">{emptyLabel}</span>
        </div>
      </button>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick()
        }
      }}
      data-edit-section={section}
      className={cn(
        "group relative cursor-pointer rounded-lg transition-all scroll-mt-24",
        "outline outline-2 outline-transparent hover:outline-primary/50",
        "ring-0 hover:ring-2 hover:ring-primary/20",
        "[&_a]:pointer-events-none",
        className
      )}
    >
      {children}
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-accent-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <Pencil className="size-3" />
        <span className="text-xs font-medium">Edit</span>
      </div>
    </div>
  )
}
