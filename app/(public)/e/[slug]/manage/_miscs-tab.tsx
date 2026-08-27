"use client"

import { DoorOpen, Activity, FileText } from "lucide-react"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"
import { RoomsTab } from "./_rooms-tab"
import { ActivityTab } from "./_activity-tab"
import { TermsTab } from "./_terms-tab"

interface MiscsTabContentProps {
  hackathonId: string
  activeMtab: string
  requireTermsAcceptance: boolean
  termsContent: string | null
}

export function MiscsTabContent({
  hackathonId,
  activeMtab,
  requireTermsAcceptance,
  termsContent,
}: MiscsTabContentProps) {
  return (
    <TabsUrlSync paramKey="mtab" value={activeMtab} className="space-y-6">
      <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
        <TabsList>
          <TabsTrigger value="rooms" aria-label="Rooms"><DoorOpen className="size-4" /><span className="hidden sm:inline">Rooms</span></TabsTrigger>
          <TabsTrigger value="activity" aria-label="Activity"><Activity className="size-4" /><span className="hidden sm:inline">Activity</span></TabsTrigger>
          <TabsTrigger value="terms" aria-label="Terms and conditions"><FileText className="size-4" /><span className="hidden sm:inline">Terms &amp; Conditions</span></TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="rooms" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="rooms">
        <RoomsTab hackathonId={hackathonId} />
      </TabsContent>

      <TabsContent value="activity" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="activity">
        <ActivityTab hackathonId={hackathonId} />
      </TabsContent>

      <TabsContent value="terms" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="terms">
        <TermsTab
          hackathonId={hackathonId}
          initialRequireTermsAcceptance={requireTermsAcceptance}
          initialTermsContent={termsContent}
        />
      </TabsContent>
    </TabsUrlSync>
  )
}
