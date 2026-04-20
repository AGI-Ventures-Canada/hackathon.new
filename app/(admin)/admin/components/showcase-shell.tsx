"use client"

import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"
import { CoreShowcase } from "./showcases/core-showcase"
import { FormsShowcase } from "./showcases/forms-showcase"
import { OverlaysShowcase } from "./showcases/overlays-showcase"
import { DataShowcase } from "./showcases/data-showcase"
import { DatesShowcase } from "./showcases/dates-showcase"
import { NavShowcase } from "./showcases/nav-showcase"
import { AdvancedShowcase } from "./showcases/advanced-showcase"

const TABS = [
  { value: "core", label: "Core" },
  { value: "forms", label: "Forms" },
  { value: "overlays", label: "Overlays" },
  { value: "data", label: "Data" },
  { value: "dates", label: "Dates" },
  { value: "nav", label: "Navigation" },
  { value: "advanced", label: "Advanced" },
]

export function ShowcaseShell({ value }: { value: string }) {
  return (
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
      <TabsContent value="core" className="mt-6">
        <CoreShowcase />
      </TabsContent>
      <TabsContent value="forms" className="mt-6">
        <FormsShowcase />
      </TabsContent>
      <TabsContent value="overlays" className="mt-6">
        <OverlaysShowcase />
      </TabsContent>
      <TabsContent value="data" className="mt-6">
        <DataShowcase />
      </TabsContent>
      <TabsContent value="dates" className="mt-6">
        <DatesShowcase />
      </TabsContent>
      <TabsContent value="nav" className="mt-6">
        <NavShowcase />
      </TabsContent>
      <TabsContent value="advanced" className="mt-6">
        <AdvancedShowcase />
      </TabsContent>
    </TabsUrlSync>
  )
}
