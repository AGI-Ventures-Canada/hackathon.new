"use client"

import { type ReactNode } from "react"
import { Gift, MessageSquare, Download } from "lucide-react"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"

interface PostEventSubTabsProps {
  activePtab: string
  children: [ReactNode, ReactNode, ReactNode]
}

export function PostEventSubTabs({ activePtab, children }: PostEventSubTabsProps) {
  const [fulfillmentContent, feedbackContent, exportsContent] = children

  return (
    <TabsUrlSync paramKey="ptab" value={activePtab} className="space-y-6">
      <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
        <TabsList>
          <TabsTrigger value="fulfillment"><Gift className="size-4" /><span className="hidden sm:inline">Prizes</span></TabsTrigger>
          <TabsTrigger value="feedback"><MessageSquare className="size-4" /><span className="hidden sm:inline">Feedback</span></TabsTrigger>
          <TabsTrigger value="exports"><Download className="size-4" /><span className="hidden sm:inline">Exports</span></TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="fulfillment" forceMount className="data-[state=inactive]:hidden">
        {fulfillmentContent}
      </TabsContent>

      <TabsContent value="feedback" forceMount className="data-[state=inactive]:hidden">
        {feedbackContent}
      </TabsContent>

      <TabsContent value="exports" forceMount className="data-[state=inactive]:hidden">
        {exportsContent}
      </TabsContent>
    </TabsUrlSync>
  )
}
