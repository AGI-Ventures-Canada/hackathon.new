"use client"

import Link from "next/link"
import {
  Users,
  UsersRound,
  FolderOpen,
  Scale,
  MessageCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { OverviewAnnouncements } from "@/components/hackathon/overview-announcements"
import { OverviewSchedule } from "@/components/hackathon/overview-schedule"
import type { Announcement } from "@/lib/services/announcements"
import type { ScheduleItem } from "@/lib/services/schedule-items"

type QuickStats = {
  participantCount: number
  teamCount: number
  submissionCount: number
  judgingProgress: { totalAssignments: number; completedAssignments: number }
  mentorQueue: { open: number }
}

type Props = {
  slug: string
  hackathonId: string
  stats: QuickStats
  announcements: Announcement[]
  scheduleItems: ScheduleItem[]
  challengeReleasedAt: string | null
  challengeExists: boolean
}

function StatCard({ icon: Icon, value, label, href }: { icon: typeof Users; value: string; label: string; href?: string }) {
  const inner = (
    <div className={cn("rounded-lg border p-4", href && "transition-colors hover:bg-muted/50")}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="size-4" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

export function OrganizerOverview({ slug, hackathonId, stats, announcements, scheduleItems, challengeReleasedAt, challengeExists }: Props) {
  const judgingValue = stats.judgingProgress.totalAssignments > 0
    ? `${Math.round((stats.judgingProgress.completedAssignments / stats.judgingProgress.totalAssignments) * 100)}%`
    : "—"

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} value={String(stats.participantCount)} label="Registered" href={`/e/${slug}/manage?tab=teams`} />
        <StatCard icon={UsersRound} value={String(stats.teamCount)} label="Teams" href={`/e/${slug}/manage?tab=teams`} />
        <StatCard icon={FolderOpen} value={String(stats.submissionCount)} label="Submissions" href={`/e/${slug}/manage?tab=submissions`} />
        <StatCard icon={Scale} value={judgingValue} label="Judged" href={`/e/${slug}/manage?tab=judging`} />
      </div>

      {stats.mentorQueue.open > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <MessageCircle className="size-4 text-primary" />
          <span className="text-sm font-medium">
            {stats.mentorQueue.open} mentor request{stats.mentorQueue.open !== 1 ? "s" : ""} pending
          </span>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <OverviewSchedule
            hackathonId={hackathonId}
            scheduleItems={scheduleItems}
            challengeReleasedAt={challengeReleasedAt}
            challengeExists={challengeExists}
          />
        </div>
        <OverviewAnnouncements slug={slug} hackathonId={hackathonId} announcements={announcements} />
      </div>
    </div>
  )
}
