"use client"

import { useCallback, useEffect, useState } from "react"
import { FlaskConical, Loader2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { EventContext } from "./use-event-context"
import { useDevConfig } from "./use-dev-config"
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

  const hackathonId = eventContext?.hackathonId ?? null

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
          return
        }
        refreshRoles()
      } catch {
        setError("Network error")
      } finally {
        setRunningId(null)
      }
    },
    [hackathonId, refreshRoles]
  )

  const removeRole = useCallback(
    async (role: string) => {
      if (!hackathonId) return
      const id = `role:${role}`
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
          return
        }
        refreshRoles()
      } catch {
        setError("Network error")
      } finally {
        setRunningId(null)
      }
    },
    [hackathonId, refreshRoles]
  )

  const commands = buildCommands({
    eventSlug: eventContext?.slug ?? null,
    eventHackathonId: hackathonId,
    eventName: eventContext?.name ?? null,
    activeScenarios,
    personas,
    currentRoles,
    onRunScenario: runScenario,
    onSwitchPersona: switchPersona,
    onAssignRole: assignRole,
    onRemoveRole: removeRole,
    onOpenSettings: () => setView({ kind: "settings" }),
    onOpenEventLifecycle: () => setView({ kind: "event", view: "lifecycle" }),
    onOpenEventSeed: () => setView({ kind: "event", view: "seed" }),
    onOpenEventResults: () => setView({ kind: "event", view: "results" }),
  })

  const backToPalette = () => setView({ kind: "palette" })

  return (
    <div className="flex w-[460px] flex-col">
      <Header
        eventContext={eventContext}
        onClose={onClose}
        running={!!runningId}
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
              className="m-2 cursor-pointer rounded-md border border-destructive bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
              onClick={() => setError(null)}
            >
              {error}
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
          onSaveState={onSaveState}
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
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Dev Tools</span>
        {eventContext && (
          <Badge variant="outline" className="text-[10px]">
            {eventContext.slug}
          </Badge>
        )}
        {running && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      <Button size="sm" variant="ghost" className="size-7 p-0" onClick={onClose}>
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
