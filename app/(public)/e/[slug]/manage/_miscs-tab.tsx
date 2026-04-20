"use client"

import { DoorOpen, Activity } from "lucide-react"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"
import { RoomsTab } from "./_rooms-tab"
import { ActivityTab } from "./_activity-tab"

interface MiscsTabContentProps {
  hackathonId: string
  activeMtab: string
}

export function MiscsTabContent({ hackathonId, activeMtab }: MiscsTabContentProps) {
  return (
    <TabsUrlSync paramKey="mtab" value={activeMtab} className="space-y-6">
      <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
        <TabsList>
          <TabsTrigger value="rooms"><DoorOpen className="size-4" /><span className="hidden sm:inline">Rooms</span></TabsTrigger>
          <TabsTrigger value="activity"><Activity className="size-4" /><span className="hidden sm:inline">Activity</span></TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="rooms" forceMount className="data-[state=inactive]:hidden">
        <RoomsTab hackathonId={hackathonId} />
      </TabsContent>

      <TabsContent value="activity" forceMount className="data-[state=inactive]:hidden">
        <ActivityTab hackathonId={hackathonId} />
      </TabsContent>
    </TabsUrlSync>
  )
}
