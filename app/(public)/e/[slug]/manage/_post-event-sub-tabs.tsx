"use client"

import { type ReactNode } from "react"
import { Gift, MessageSquare, Download } from "lucide-react"
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabsUrlSync } from "@/components/ui/tabs-url-sync"

interface PostEventSubTabsProps {
  activePtab: string
  showExports: boolean
  children: [ReactNode, ReactNode, ReactNode]
}

export function PostEventSubTabs({ activePtab, showExports, children }: PostEventSubTabsProps) {
  const [fulfillmentContent, feedbackContent, exportsContent] = children

  return (
    <TabsUrlSync paramKey="ptab" value={activePtab} className="space-y-6">
      <div className="overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
        <TabsList>
          <TabsTrigger value="fulfillment" aria-label="Prizes"><Gift className="size-4" /><span className="hidden sm:inline">Prizes</span></TabsTrigger>
          <TabsTrigger value="feedback" aria-label="Feedback"><MessageSquare className="size-4" /><span className="hidden sm:inline">Feedback</span></TabsTrigger>
          {showExports && (
            <TabsTrigger value="exports" aria-label="Exports"><Download className="size-4" /><span className="hidden sm:inline">Exports</span></TabsTrigger>
          )}
        </TabsList>
      </div>

      <TabsContent value="fulfillment" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="fulfillment">
        {fulfillmentContent}
      </TabsContent>

      <TabsContent value="feedback" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="feedback">
        {feedbackContent}
      </TabsContent>

      {showExports && (
        <TabsContent value="exports" forceMount className="data-[state=inactive]:hidden" data-webmcp-section="exports">
          {exportsContent}
        </TabsContent>
      )}
    </TabsUrlSync>
  )
}
