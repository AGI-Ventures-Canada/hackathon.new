"use client"

import { useMemo, useState } from "react"
import { LayoutGrid, List } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import {
  CATEGORY_HEADERS,
  CATEGORY_ORDER,
  type CommandCategory,
  type DevCommand,
} from "./registry"

type ViewMode = "list" | "tabs"

interface CommandPaletteListProps {
  commands: DevCommand[]
  runningId: string | null
  placeholder?: string
  autoFocus?: boolean
}

export function CommandPaletteList({
  commands,
  runningId,
  placeholder = "Search commands, scenarios, settings...",
  autoFocus = true,
}: CommandPaletteListProps) {
  const [query, setQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const grouped = groupByCategory(commands)
  const isSearching = query.trim().length > 0

  const availableCategories = useMemo(
    () => CATEGORY_ORDER.filter((cat) => (grouped[cat]?.length ?? 0) > 0),
    [grouped]
  )

  const [activeCategory, setActiveCategory] = useState<CommandCategory | null>(
    null
  )
  const effectiveActive: CommandCategory | null =
    activeCategory && availableCategories.includes(activeCategory)
      ? activeCategory
      : (availableCategories[0] ?? null)

  const renderItem = (cmd: DevCommand) => {
    const Icon = cmd.icon
    const isRunning = runningId === cmd.id
    return (
      <CommandItem
        key={cmd.id}
        value={`${cmd.title} ${cmd.subtitle ?? ""} ${cmd.keywords ?? ""}`}
        disabled={cmd.disabled || !!runningId}
        onSelect={() => cmd.run()}
        className="flex-col items-start gap-0.5 py-2 w-full min-w-0"
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <Icon
            className={cn(
              "size-3.5 shrink-0 mt-0.5",
              isRunning && "animate-pulse"
            )}
          />
          <span className="flex-1 min-w-0 text-xs font-medium break-words whitespace-normal">
            {cmd.title}
          </span>
          {cmd.badge && (
            <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
              {cmd.badge}
            </Badge>
          )}
          {isRunning && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              running…
            </span>
          )}
        </div>
        {cmd.subtitle && (
          <span className="ml-5 w-[calc(100%-1.25rem)] min-w-0 text-[10px] text-muted-foreground break-words whitespace-normal">
            {cmd.subtitle}
          </span>
        )}
      </CommandItem>
    )
  }

  const tabCommands =
    viewMode === "tabs" && effectiveActive && !isSearching
      ? (grouped[effectiveActive] ?? [])
      : commands

  return (
    <Command className="w-full min-w-0 bg-transparent overflow-hidden" shouldFilter>
      <div className="flex items-center justify-end gap-1 border-b px-2 py-1">
        <span className="mr-auto text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          View
        </span>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border bg-muted p-0.5">
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
            className="size-6 p-0"
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "tabs" ? "secondary" : "ghost"}
            size="sm"
            aria-label="Tab view"
            aria-pressed={viewMode === "tabs"}
            onClick={() => setViewMode("tabs")}
            className="size-6 p-0"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
        </div>
      </div>
      <CommandInput
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={query}
        onValueChange={setQuery}
      />
      {viewMode === "tabs" && !isSearching && availableCategories.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5">
          {availableCategories.map((cat) => {
            const isActive = cat === effectiveActive
            const count = grouped[cat]?.length ?? 0
            return (
              <Button
                key={cat}
                type="button"
                variant={isActive ? "default" : "ghost"}
                size="xs"
                aria-pressed={isActive}
                onClick={() => setActiveCategory(cat)}
                className="shrink-0 text-[11px]"
              >
                {CATEGORY_HEADERS[cat]}
                <span className="ml-1 opacity-60">{count}</span>
              </Button>
            )
          })}
        </div>
      )}
      <CommandList className="max-h-none w-full min-w-0 overflow-visible">
        <CommandEmpty>No commands match your search.</CommandEmpty>
        {viewMode === "tabs" ? (
          <CommandGroup
            className="w-full min-w-0"
            heading={
              !isSearching && effectiveActive
                ? CATEGORY_HEADERS[effectiveActive]
                : undefined
            }
          >
            {tabCommands.map(renderItem)}
          </CommandGroup>
        ) : isSearching ? (
          <CommandGroup className="w-full min-w-0">
            {commands.map(renderItem)}
          </CommandGroup>
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat]
            if (!items?.length) return null
            return (
              <CommandGroup
                key={cat}
                heading={CATEGORY_HEADERS[cat]}
                className="w-full min-w-0"
              >
                {items.map(renderItem)}
              </CommandGroup>
            )
          })
        )}
      </CommandList>
    </Command>
  )
}

function groupByCategory(commands: DevCommand[]): Record<CommandCategory, DevCommand[]> {
  const grouped = {} as Record<CommandCategory, DevCommand[]>
  for (const cmd of commands) {
    if (!grouped[cmd.category]) grouped[cmd.category] = []
    grouped[cmd.category].push(cmd)
  }
  return grouped
}
