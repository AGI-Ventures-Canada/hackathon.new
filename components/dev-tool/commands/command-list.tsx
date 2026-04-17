"use client"

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
  const grouped = groupByCategory(commands)

  return (
    <Command className="bg-transparent" shouldFilter>
      <CommandInput placeholder={placeholder} autoFocus={autoFocus} />
      <CommandList className="max-h-[55vh]">
        <CommandEmpty>No commands match your search.</CommandEmpty>
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat]
          if (!items?.length) return null
          return (
            <CommandGroup key={cat} heading={CATEGORY_HEADERS[cat]}>
              {items.map((cmd) => {
                const Icon = cmd.icon
                const isRunning = runningId === cmd.id
                return (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.title} ${cmd.subtitle ?? ""} ${cmd.keywords ?? ""}`}
                    disabled={cmd.disabled || !!runningId}
                    onSelect={() => cmd.run()}
                    className="flex-col items-start gap-0.5 py-2"
                  >
                    <div className="flex w-full items-center gap-2">
                      <Icon
                        className={cn(
                          "size-3.5 shrink-0",
                          isRunning && "animate-pulse"
                        )}
                      />
                      <span className="flex-1 truncate text-xs font-medium">
                        {cmd.title}
                      </span>
                      {cmd.badge && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          {cmd.badge}
                        </Badge>
                      )}
                      {isRunning && (
                        <span className="text-[10px] text-muted-foreground">
                          running…
                        </span>
                      )}
                    </div>
                    {cmd.subtitle && (
                      <span className="ml-5 truncate text-[10px] text-muted-foreground">
                        {cmd.subtitle}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )
        })}
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
