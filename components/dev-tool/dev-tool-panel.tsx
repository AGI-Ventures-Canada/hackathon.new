"use client"

import { useCallback, useEffect, useState } from "react"
import { FlaskConical, Loader2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { EventContext } from "./use-event-context"
import { useDevConfig } from "./use-dev-config"
import { useEventActions } from "./use-event-actions"
import { CommandPaletteList } from "./commands/command-list"
import { ContextStrip } from "./commands/context-strip"
import { InlineSettings } from "./commands/inline-settings"
import { InlineEventTools, type EventView } from "./commands/inline-event-tools"
import { buildCommands } from "./commands/registry"
import type { ScenarioDef } from "@/lib/dev/scenarios"

type Persona = { key: string; name: string; configured: boolean }

type ActiveScenario = {
  scenarioName: string
  hackathonId: string
  slug: string
  createdAt: string
}

type View =
  | { kind: "palette" }
  | { kind: "settings" }
  | { kind: "event"; view: EventView }

interface DevToolPanelProps {
  eventContext: EventContext | null
  onClose: () => void
  onSaveState: () => void
}

export function DevToolPanel({
  eventContext,
  onClose,
  onSaveState,
}: DevToolPanelProps) {
  const { config, updateConfig, clearConfig } = useDevConfig()
  const [view, setView] = useState<View>({ kind: "palette" })

  const [personas, setPersonas] = useState<Persona[]>([])
  const [activePersona, setActivePersona] = useState<Persona | null>(null)
  const [activeScenarios, setActiveScenarios] = useState<ActiveScenario[]>([])
  const [currentRoles, setCurrentRoles] = useState<string[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hackathonId = eventContext?.hackathonId ?? null

  const refreshContext = useCallback(() => {
    eventContext?.refetch()
  }, [eventContext])

  const eventActions = useEventActions(hackathonId, onSaveState, refreshContext)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (view.kind !== "palette") {
        e.preventDefault()
        setView({ kind: "palette" })
        return
      }
      onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [view.kind, onClose])

  useEffect(() => {
    fetch("/api/admin/scenario-personas")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.personas) {
          const configured = data.personas.filter((p: Persona) => p.configured)
          setPersonas(configured)
          if (data.activePersona) {
            const match =
              configured.find(
                (p: Persona) => p.key === data.activePersona
              ) ?? null
            setActivePersona(match)
          }
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch("/api/admin/scenario-active")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.scenarios) setActiveScenarios(data.scenarios)
      })
      .catch(() => {})
  }, [])

  const refreshRoles = useCallback(() => {
    if (!hackathonId) {
      setCurrentRoles([])
      return
    }
    fetch(`/api/dev/hackathons/${hackathonId}/my-roles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setCurrentRoles(data?.roles ?? [])
      })
      .catch(() => setCurrentRoles([]))
  }, [hackathonId])

  useEffect(() => {
    refreshRoles()
  }, [refreshRoles])

  const runScenario = useCallback(
    async (scenario: ScenarioDef) => {
      const id = `scenario:${scenario.name}`
      setRunningId(id)
      setError(null)
      try {
        const res = await fetch(
          `/api/admin/scenario-run/${scenario.name}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setError(data?.error ?? "Failed to run scenario")
          setRunningId(null)
          return
        }
        const data = await res.json()
        const redirect = scenario.defaultRoute(data.slug)
        const personaMap: Record<string, string> = {
          organizer: "organizer",
          participant: "user1",
          judge: "user1",
        }
        const targetRole = data.roles?.find(
          (r: { role: string; loginUrl: string }) =>
            r.role === scenario.defaultPersona
        )
        if (targetRole) {
          window.location.assign(targetRole.loginUrl)
          return
        }
        const switchRes = await fetch("/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona: personaMap[scenario.defaultPersona] ?? "organizer",
            redirect,
          }),
        })
        if (switchRes.ok) {
          const { loginUrl } = await switchRes.json()
          window.location.assign(loginUrl)
        } else {
          window.location.assign(redirect)
        }
      } catch {
        setError("Network error")
        setRunningId(null)
      }
    },
    []
  )

  const switchPersona = useCallback(async (persona: Persona) => {
    const id = `persona:${persona.key}`
    setRunningId(id)
    setError(null)
    try {
      const res = await fetch("/api/admin/scenario-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: persona.key,
          redirect: window.location.pathname,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Switch failed")
        setRunningId(null)
        return
      }
      const { loginUrl } = await res.json()
      window.location.assign(loginUrl)
    } catch {
      setError("Network error")
      setRunningId(null)
    }
  }, [])

  const assignRole = useCallback(
    async (role: string) => {
      if (!hackathonId) return
      const id = `role:${role}`
      const previous = currentRoles
      setCurrentRoles((prev) => (prev.includes(role) ? prev : [...prev, role]))
      setRunningId(id)
      setError(null)
      try {
        const res = await fetch(
          `/api/dev/hackathons/${hackathonId}/assign-role`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
          }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setError(data?.error ?? "Failed to assign role")
          setCurrentRoles(previous)
          return
        }
        refreshRoles()
      } catch {
        setError("Network error")
        setCurrentRoles(previous)
      } finally {
        setRunningId(null)
      }
    },
    [hackathonId, refreshRoles, currentRoles]
  )

  const removeRole = useCallback(
    async (role: string) => {
      if (!hackathonId) return
      const id = `role:${role}`
      const previous = currentRoles
      setCurrentRoles((prev) => prev.filter((r) => r !== role))
      setRunningId(id)
      setError(null)
      try {
        const res = await fetch(
          `/api/dev/hackathons/${hackathonId}/remove-role`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
          }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          setError(data?.error ?? "Failed to remove role")
          setCurrentRoles(previous)
          return
        }
        refreshRoles()
      } catch {
        setError("Network error")
        setCurrentRoles(previous)
      } finally {
        setRunningId(null)
      }
    },
    [hackathonId, refreshRoles, currentRoles]
  )

  const processAutoTransitions = useCallback(async () => {
    setRunningId("lifecycle:auto-transitions")
    setError(null)
    try {
      const res = await fetch("/api/dev/cron/transitions", { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? "Auto-transitions failed")
        return
      }
      refreshContext()
    } catch {
      setError("Network error")
    } finally {
      setRunningId(null)
    }
  }, [refreshContext])

  const commands = buildCommands({
    eventSlug: eventContext?.slug ?? null,
    eventHackathonId: hackathonId,
    eventName: eventContext?.name ?? null,
    eventStatus: eventContext?.status ?? null,
    eventPhase: eventContext?.phase ?? null,
    eventSeedStatus: eventActions.seedStatus,
    activeScenarios,
    personas,
    currentRoles,
    onRunScenario: runScenario,
    onSwitchPersona: switchPersona,
    onAssignRole: assignRole,
    onRemoveRole: removeRole,
    onEventAction: hackathonId ? eventActions.runAction : null,
    onProcessAutoTransitions: processAutoTransitions,
    onOpenSettings: () => setView({ kind: "settings" }),
    onOpenEventLifecycle: () => setView({ kind: "event", view: "lifecycle" }),
    onOpenEventSeed: () => setView({ kind: "event", view: "seed" }),
    onOpenEventResults: () => setView({ kind: "event", view: "results" }),
  })

  const backToPalette = () => setView({ kind: "palette" })

  const toastMessage = eventActions.toast ?? null
  const running = !!runningId || !!eventActions.pending

  return (
    <div className="flex w-[460px] max-w-[calc(100vw-2rem)] flex-col">
      <Header
        eventContext={eventContext}
        onClose={onClose}
        running={running}
      />

      {view.kind === "palette" && (
        <>
          <ContextStrip
            eventContext={eventContext}
            activePersona={activePersona}
            currentRoles={currentRoles}
          />
          {error && (
            <div
              role="alert"
              className="m-2 cursor-pointer rounded-md border border-destructive bg-destructive/10 px-3 py-1.5 text-xs text-destructive break-words"
              onClick={() => setError(null)}
            >
              {error}
            </div>
          )}
          {toastMessage && (
            <div className="m-2 rounded-md border bg-muted px-3 py-1.5 text-xs text-muted-foreground break-words">
              {toastMessage}
            </div>
          )}
          <CommandPaletteList commands={commands} runningId={runningId} />
        </>
      )}

      {view.kind === "settings" && (
        <InlineSettings
          config={config}
          onUpdateConfig={updateConfig}
          onClearConfig={clearConfig}
          onBack={backToPalette}
        />
      )}

      {view.kind === "event" && eventContext && (
        <InlineEventTools
          eventContext={eventContext}
          view={view.view}
          onBack={backToPalette}
          actions={eventActions}
        />
      )}
    </div>
  )
}

interface HeaderProps {
  eventContext: EventContext | null
  onClose: () => void
  running: boolean
}

function Header({ eventContext, onClose, running }: HeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold shrink-0">Dev Tools</span>
        {eventContext && (
          <Badge variant="outline" className="text-[10px] truncate">
            {eventContext.slug}
          </Badge>
        )}
        {running && (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>
      <Button size="sm" variant="ghost" className="size-7 p-0 shrink-0" onClick={onClose}>
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
