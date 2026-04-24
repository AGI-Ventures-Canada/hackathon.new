"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface SandboxEvent {
  id: number
  label: string
  at: number
}

interface SandboxContextValue {
  isLive: boolean
  record: (label: string) => void
  events: SandboxEvent[]
}

const SandboxContext = createContext<SandboxContextValue | null>(null)

export function SandboxProvider({
  isLive,
  children,
}: {
  isLive: boolean
  children: React.ReactNode
}) {
  const [events, setEvents] = useState<SandboxEvent[]>([])

  const record = useCallback((label: string) => {
    const entry: SandboxEvent = { id: Date.now() + Math.random(), label, at: Date.now() }
    setEvents((prev) => [entry, ...prev].slice(0, 10))
    console.info("[sandbox]", label)
  }, [])

  return (
    <SandboxContext.Provider value={{ isLive, record, events }}>
      {children}
      <SandboxBanner />
    </SandboxContext.Provider>
  )
}

export function useSandbox() {
  const ctx = useContext(SandboxContext)
  if (!ctx) throw new Error("useSandbox must be used inside a SandboxProvider")
  return ctx
}

export function useSandboxHandler<TArgs extends unknown[]>(label: string) {
  const { record } = useSandbox()
  return useCallback(
    async (...args: TArgs) => {
      record(`${label} ${args.length ? JSON.stringify(args).slice(0, 180) : ""}`.trim())
      return true
    },
    [label, record],
  )
}

function SandboxBanner() {
  const ctx = useContext(SandboxContext)
  if (!ctx) return null

  const latest = ctx.events[0]

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-none border bg-card px-3 py-2 text-xs shadow",
          ctx.isLive ? "border-destructive/50 text-destructive" : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            ctx.isLive ? "bg-destructive" : "bg-muted-foreground/60",
          )}
        />
        {ctx.isLive ? "Live mode — mutations hit the API" : "Sandbox mode — handlers are stubbed"}
      </div>
      {latest && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="pointer-events-auto max-w-sm truncate rounded-none border bg-card px-3 py-2 text-left text-xs shadow hover:bg-accent"
            >
              <span className="text-muted-foreground">Last action:</span> {latest.label}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 rounded-none p-2 text-xs">
            <div className="mb-1 font-medium">Recent sandbox events</div>
            <ul className="space-y-1">
              {ctx.events.map((e) => (
                <li key={e.id} className="truncate text-muted-foreground">
                  {e.label}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
