"use client"

import { useState, useRef, useEffect } from "react"
import {
  Loader2,
  Clock,
  Check,
  Play,
  Square,
  RefreshCw,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"
import { dispatchDevStatusChanged } from "../events"
import { Section } from "./event-shared"

const ALL_STAGES: { status: HackathonStatus; label: string }[] = [
  { status: "draft", label: "Draft" },
  { status: "published", label: "Published" },
  { status: "registration_open", label: "Reg. Open" },
  { status: "active", label: "Active" },
  { status: "judging", label: "Judging" },
  { status: "completed", label: "Completed" },
  { status: "archived", label: "Archived" },
]

const ALL_PHASES: { phase: HackathonPhase | null; label: string }[] = [
  { phase: null, label: "None" },
  { phase: "build", label: "Build" },
  { phase: "submission_open", label: "Submit" },
  { phase: "preliminaries", label: "Prelims" },
  { phase: "finals", label: "Finals" },
  { phase: "results_pending", label: "Results" },
]

const TIMELINE_PRESETS = [
  { label: "Started 2h ago, ends in 6h", startsAt: -2, endsAt: 6 },
  { label: "Started 1h ago, ends in 30m", startsAt: -1, endsAt: 0.5 },
  { label: "Starts in 1h, ends in 24h", startsAt: 1, endsAt: 24 },
  { label: "Ended 1h ago", startsAt: -8, endsAt: -1 },
]

const LIFECYCLE_ORDER: HackathonStatus[] = [
  "draft", "published", "registration_open", "active", "judging", "completed", "archived",
]

interface EventLifecycleSectionProps {
  hackathonId: string
  status: string
  phase: string | null
  pending: string | null
  setPending: (v: string | null) => void
  showToast: (msg: string) => void
  devAction: (path: string, method?: string, body?: unknown) => Promise<unknown>
  onRefresh: () => void
}

export function EventLifecycleSection({
  hackathonId,
  status,
  phase,
  pending,
  setPending,
  showToast,
  devAction,
  onRefresh,
}: EventLifecycleSectionProps) {
  const [simActive, setSimActive] = useState(false)
  const [simStatus, setSimStatus] = useState<HackathonStatus | null>(null)
  const [simStep, setSimStep] = useState(0)
  const [simTotal, setSimTotal] = useState(0)
  const simActiveRef = useRef(false)

  const displayStatus = simStatus ?? status
  const isLoading = !!pending

  useEffect(() => {
    return () => { simActiveRef.current = false }
  }, [])

  async function runSimulation() {
    const total = LIFECYCLE_ORDER.length - 1

    setSimActive(true)
    simActiveRef.current = true
    setSimStep(0)
    setSimTotal(total)

    // Always reset to draft first
    await fetch(`/api/dev/hackathons/${hackathonId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: LIFECYCLE_ORDER[0] }),
    })
    setSimStatus(LIFECYCLE_ORDER[0])
    dispatchDevStatusChanged(LIFECYCLE_ORDER[0])

    for (let i = 1; i < LIFECYCLE_ORDER.length; i++) {
      await new Promise((r) => setTimeout(r, 3500))
      if (!simActiveRef.current) return
      await fetch(`/api/dev/hackathons/${hackathonId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: LIFECYCLE_ORDER[i] }),
      })
      setSimStatus(LIFECYCLE_ORDER[i])
      setSimStep(i)
      dispatchDevStatusChanged(LIFECYCLE_ORDER[i])
    }

    await new Promise((r) => setTimeout(r, 2000))
    setSimActive(false)
    simActiveRef.current = false
    onRefresh()
  }

  function stopSimulation() {
    simActiveRef.current = false
    setSimActive(false)
    onRefresh()
  }

  async function switchStatus(newStatus: HackathonStatus) {
    await devAction("/status", "PATCH", { status: newStatus })
  }

  async function switchPhase(newPhase: HackathonPhase | null) {
    await devAction("/phase", "PATCH", { phase: newPhase })
  }

  async function setTimeline(preset: (typeof TIMELINE_PRESETS)[number]) {
    const now = Date.now()
    await devAction("/timeline", "PATCH", {
      startsAt: new Date(now + preset.startsAt * 3600000).toISOString(),
      endsAt: new Date(now + preset.endsAt * 3600000).toISOString(),
      registrationOpensAt: new Date(now - 7 * 86400000).toISOString(),
      registrationClosesAt: new Date(now + preset.startsAt * 3600000).toISOString(),
    })
  }

  async function processAutoTransitions() {
    if (pending) return
    setPending("cron")
    try {
      const res = await fetch("/api/dev/cron/transitions", { method: "POST" })
      if (!res.ok) throw new Error("Failed")
      const data = await res.json()
      showToast(data.processed > 0 ? `${data.processed} transition(s) processed` : "No transitions needed")
      if (data.processed > 0) {
        dispatchDevStatusChanged()
        onRefresh()
      }
    } catch {
      showToast("Action failed")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-3">
      <Section label="Status">
        <div className="flex flex-wrap gap-1.5">
          {ALL_STAGES.map(({ status: s, label }) => {
            const isCurrent = s === displayStatus
            const isPast = simActive && LIFECYCLE_ORDER.indexOf(s) < LIFECYCLE_ORDER.indexOf(displayStatus as HackathonStatus)
            return (
              <Button
                key={s}
                size="sm"
                variant={isCurrent ? "default" : isPast ? "secondary" : "outline"}
                disabled={isLoading || simActive}
                onClick={() => switchStatus(s)}
                className={`h-7 text-xs transition-all duration-300 ${isCurrent && simActive ? "ring-2 ring-primary ring-offset-1 scale-105" : ""}`}
              >
                {isPast && <Check className="size-3 mr-1" />}
                {pending === "/statusPATCH" && s === status && (
                  <Loader2 className="size-3 animate-spin mr-1" />
                )}
                {label}
              </Button>
            )
          })}
        </div>
      </Section>

      <div className="rounded-md border border-dashed p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="size-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">Simulate Lifecycle</p>
            <p className="text-[10px] text-muted-foreground">
              Steps through each status using the real transition pipeline (notifications, webhooks, audit).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {simActive ? (
            <Button size="sm" variant="destructive" onClick={stopSimulation} className="h-7 text-xs">
              <Square className="size-3 mr-1" /> Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={runSimulation}
              className="h-7 text-xs"
            >
              <Play className="size-3 mr-1" /> Start
            </Button>
          )}
          {simActive && simTotal > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Step {simStep}/{simTotal}: {ALL_STAGES.find((s) => s.status === simStatus)?.label}
            </span>
          )}
        </div>
      </div>

      <Section label="Phase">
        <div className="flex flex-wrap gap-1.5">
          {ALL_PHASES.map(({ phase: p, label }) => (
            <Button
              key={label}
              size="sm"
              variant={p === phase ? "default" : "outline"}
              disabled={isLoading || simActive}
              onClick={() => switchPhase(p)}
              className="h-7 text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      </Section>

      <Section label="Timeline">
        <div className="flex flex-wrap gap-1.5">
          {TIMELINE_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              disabled={isLoading || simActive}
              onClick={() => setTimeline(preset)}
              className="h-7 text-xs"
            >
              <Clock className="size-3 mr-1" />
              {preset.label}
            </Button>
          ))}
        </div>
      </Section>

      <Section label="Judging time">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Open now, due in 2 days", open: -1, close: 48 },
            { label: "Opens in 1 day", open: 24, close: 72 },
            { label: "Due in 30 minutes", open: -24, close: 0.5 },
            { label: "Closed 1 hour ago", open: -48, close: -1 },
          ].map((preset) => <Button key={preset.label} size="sm" variant="outline" disabled={isLoading || simActive} onClick={() => {
            const now = Date.now()
            void devAction("/timeline", "PATCH", { judgingOpensAt: new Date(now + preset.open * 3_600_000).toISOString(), judgingClosesAt: new Date(now + preset.close * 3_600_000).toISOString() })
          }}>{preset.label}</Button>)}
        </div>
      </Section>

      <Section label="Auto-Transitions">
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading || simActive}
          onClick={processAutoTransitions}
          className="h-8 text-xs"
        >
          {pending === "cron" ? (
            <Loader2 className="size-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="size-3 mr-1" />
          )}
          Process Auto-Transitions
        </Button>
        <p className="text-[10px] text-muted-foreground mt-1">
          Checks if stored status disagrees with timeline dates and fires real transitions.
        </p>
      </Section>
    </div>
  )
}
