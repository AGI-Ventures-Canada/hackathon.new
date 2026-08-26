"use client"

import { useState } from "react"
import { Calendar } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabCount } from "@/components/ui/tab-count"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription } from "@/components/ui/card"
import { HackathonGrid } from "@/components/org/hackathon-grid"
import { getTimelineStateAt } from "@/lib/utils/timeline"
import type { HackathonWithRole } from "@/components/org/hackathon-grid"

const COMPLETED_LABELS = new Set(["Judging", "Completed", "Archived"])

type Props = {
  allHackathons: HackathonWithRole[]
  organizedHackathons: HackathonWithRole[]
  sponsoredHackathons: HackathonWithRole[]
  totalUniqueEvents: number
  timelineReferenceTime: string
}

export function OrgEventTabs({
  allHackathons,
  organizedHackathons,
  sponsoredHackathons,
  totalUniqueEvents,
  timelineReferenceTime,
}: Props) {
  const [showCompleted, setShowCompleted] = useState(false)
  const referenceTime = new Date(timelineReferenceTime)

  const isActive = (h: HackathonWithRole) =>
    !COMPLETED_LABELS.has(getTimelineStateAt(h, referenceTime).label)

  const hasCompleted = allHackathons.some((h) => !isActive(h))

  const visibleAllCount = showCompleted
    ? totalUniqueEvents
    : allHackathons.filter(isActive).length
  const visibleOrganizedCount = showCompleted
    ? organizedHackathons.length
    : organizedHackathons.filter(isActive).length
  const visibleSponsoredCount = showCompleted
    ? sponsoredHackathons.length
    : sponsoredHackathons.filter(isActive).length

  return (
    <Tabs defaultValue="all" className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList variant="line">
            <TabsTrigger value="all">All<TabCount>{visibleAllCount}</TabCount></TabsTrigger>
            <TabsTrigger value="organized">
              Organizing<TabCount>{visibleOrganizedCount}</TabCount>
            </TabsTrigger>
            <TabsTrigger value="sponsored">
              Sponsoring<TabCount>{visibleSponsoredCount}</TabCount>
            </TabsTrigger>
          </TabsList>
        </div>

        {hasCompleted && (
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              id="show-completed"
              checked={showCompleted}
              onCheckedChange={setShowCompleted}
            />
            <Label htmlFor="show-completed" className="text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
              Show completed
            </Label>
          </div>
        )}
      </div>

      <TabsContent value="all">
        <HackathonGrid
          hackathons={allHackathons}
          showCompleted={showCompleted}
          timelineReferenceTime={timelineReferenceTime}
        />
      </TabsContent>

      <TabsContent value="organized">
        {visibleOrganizedCount > 0 ? (
          <HackathonGrid
            hackathons={organizedHackathons}
            showCompleted={showCompleted}
            timelineReferenceTime={timelineReferenceTime}
          />
        ) : (
          <EmptyState message="This organization hasn't organized any public events yet." />
        )}
      </TabsContent>

      <TabsContent value="sponsored">
        {visibleSponsoredCount > 0 ? (
          <HackathonGrid
            hackathons={sponsoredHackathons}
            showCompleted={showCompleted}
            timelineReferenceTime={timelineReferenceTime}
          />
        ) : (
          <EmptyState message="This organization hasn't sponsored any public events yet." />
        )}
      </TabsContent>
    </Tabs>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="size-10 text-muted-foreground mb-4" />
        <CardDescription>{message}</CardDescription>
      </CardContent>
    </Card>
  )
}
