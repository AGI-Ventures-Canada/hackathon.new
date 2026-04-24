"use client"

import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"
import { OrganizerShowcase } from "./showcases/organizer-showcase"
import { JudgeShowcase } from "./showcases/judge-showcase"
import { AttendeeShowcase } from "./showcases/attendee-showcase"
import { SponsorShowcase } from "./showcases/sponsor-showcase"
import { AdvancedShowcase } from "./showcases/advanced-showcase"
import { SandboxProvider } from "./_sandbox"
import type { ShowcaseData } from "./_mock-data"

const TABS = [
  { value: "organizer", label: "Organizer" },
  { value: "judge", label: "Judge" },
  { value: "attendee", label: "Attendee" },
  { value: "sponsor", label: "Sponsor" },
  { value: "advanced", label: "Advanced" },
]

export function ShowcaseShell({ value, data }: { value: string; data: ShowcaseData }) {
  return (
    <SandboxProvider isLive={data.isLive}>
      <TabsUrlSync paramKey="tab" value={value}>
        <div className="overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="organizer" className="mt-6">
          <OrganizerShowcase data={data} />
        </TabsContent>
        <TabsContent value="judge" className="mt-6">
          <JudgeShowcase data={data} />
        </TabsContent>
        <TabsContent value="attendee" className="mt-6">
          <AttendeeShowcase data={data} />
        </TabsContent>
        <TabsContent value="sponsor" className="mt-6">
          <SponsorShowcase data={data} />
        </TabsContent>
        <TabsContent value="advanced" className="mt-6">
          <AdvancedShowcase />
        </TabsContent>
      </TabsUrlSync>
    </SandboxProvider>
  )
}
