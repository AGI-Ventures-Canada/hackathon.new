"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

type Props = {
  status: HackathonStatus
  registrationOpensAt: string | null
  registrationClosesAt: string | null
  startsAt: string | null
  endsAt: string | null
  submissionDeadline?: string | null
}

type Milestone = {
  label: string
  deadline: Date
  startRef: Date
}

function getMilestone(props: Props): Milestone | null {
  const now = new Date()

  if (props.status === "draft") {
    if (props.registrationOpensAt) {
      const d = new Date(props.registrationOpensAt)
      if (d > now) return { label: "Registration opens", deadline: d, startRef: now }
    }
    return null
  }

  if (props.status === "registration_open") {
    if (props.registrationClosesAt) {
      const d = new Date(props.registrationClosesAt)
      if (d > now) {
        const start = props.registrationOpensAt ? new Date(props.registrationOpensAt) : now
        return { label: "Registration closes", deadline: d, startRef: start }
      }
    }
    if (props.startsAt) {
      const d = new Date(props.startsAt)
      if (d > now) return { label: "Hackathon starts", deadline: d, startRef: now }
    }
    return null
  }

  if (props.status === "active") {
    const deadline = props.submissionDeadline ?? props.endsAt
    if (deadline) {
      const d = new Date(deadline)
      if (d > now) {
        const start = props.startsAt ? new Date(props.startsAt) : now
        return { label: "Submissions close", deadline: d, startRef: start }
      }
    }
    return null
  }

  return null
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Time's up"
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

export function TimeRemainingBar(props: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const sync = () => setNow(Date.now())
    const frame = requestAnimationFrame(sync)
    const interval = setInterval(sync, 60_000)
    return () => { cancelAnimationFrame(frame); clearInterval(interval) }
  }, [])

  const milestone = getMilestone(props)
  if (!milestone) return null

  const remaining = milestone.deadline.getTime() - now
  const total = milestone.deadline.getTime() - milestone.startRef.getTime()
  const elapsed = now - milestone.startRef.getTime()
  const progress = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0

  const isUrgent = remaining < 2 * 60 * 60 * 1000
  const isWarning = remaining < 24 * 60 * 60 * 1000

  return (
    <div className={cn(
      "rounded-lg border p-4",
      isUrgent && "border-destructive/50 bg-destructive/5",
      isWarning && !isUrgent && "border-primary/30 bg-primary/5",
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className={cn(
            "size-4",
            isUrgent ? "text-destructive" : isWarning ? "text-primary" : "text-muted-foreground",
          )} />
          <span className="text-sm font-medium">{milestone.label}</span>
        </div>
        <span className={cn(
          "text-sm font-medium tabular-nums",
          isUrgent ? "text-destructive" : isWarning ? "text-primary" : "text-muted-foreground",
        )}>
          {formatRemaining(remaining)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          suppressHydrationWarning
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            isUrgent ? "bg-destructive" : isWarning ? "bg-primary" : "bg-primary/60",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
