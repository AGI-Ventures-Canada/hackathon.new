"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
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
  const grouped = groupByCategory(commands)
  const isSearching = query.trim().length > 0

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

  return (
    <Command className="w-full min-w-0 bg-transparent overflow-hidden" shouldFilter>
      <CommandInput
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[55vh] w-full min-w-0 overflow-x-hidden overflow-y-auto">
        <CommandEmpty>No commands match your search.</CommandEmpty>
        {isSearching ? (
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
