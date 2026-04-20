"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseStack,
  ShowcaseLabel,
} from "../_section-layout"

const SECTIONS = [
  { id: "tabs", label: "Tabs" },
  { id: "accordion", label: "Accordion" },
  { id: "breadcrumb", label: "Breadcrumb" },
  { id: "scroll-area", label: "Scroll area" },
]

export function NavShowcase() {
  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection id="tabs" title="Tabs" description="Switch between views without leaving the page.">
        <ShowcaseStack>
          <ShowcaseLabel>Default</ShowcaseLabel>
          <Tabs defaultValue="one" className="max-w-md">
            <TabsList>
              <TabsTrigger value="one">Overview</TabsTrigger>
              <TabsTrigger value="two">Activity</TabsTrigger>
              <TabsTrigger value="three">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="mt-4 text-xs text-muted-foreground">
              Overview content.
            </TabsContent>
            <TabsContent value="two" className="mt-4 text-xs text-muted-foreground">
              Activity content.
            </TabsContent>
            <TabsContent value="three" className="mt-4 text-xs text-muted-foreground">
              Settings content.
            </TabsContent>
          </Tabs>
          <ShowcaseLabel>Line variant</ShowcaseLabel>
          <Tabs defaultValue="one" className="max-w-md">
            <TabsList variant="line">
              <TabsTrigger value="one">Write</TabsTrigger>
              <TabsTrigger value="two">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="mt-4 text-xs text-muted-foreground">
              Write view.
            </TabsContent>
            <TabsContent value="two" className="mt-4 text-xs text-muted-foreground">
              Preview view.
            </TabsContent>
          </Tabs>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="accordion" title="Accordion" description="A list of rows that open to reveal more.">
        <Accordion type="single" collapsible className="max-w-md">
          <AccordionItem value="a">
            <AccordionTrigger>What is Oatmeal?</AccordionTrigger>
            <AccordionContent>
              A platform for running hackathons end to end.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="b">
            <AccordionTrigger>Who is it for?</AccordionTrigger>
            <AccordionContent>
              Organizers, sponsors, judges, and attendees.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="c">
            <AccordionTrigger>How do I get started?</AccordionTrigger>
            <AccordionContent>
              Sign in and create your first event.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ShowcaseSection>

      <ShowcaseSection id="breadcrumb" title="Breadcrumb" description="A trail of links showing where the user is.">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Hackathons</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Spring Hack</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </ShowcaseSection>

      <ShowcaseSection
        id="scroll-area"
        title="Scroll area"
        description="A fixed-size area with a styled scrollbar."
      >
        <ScrollArea className="h-48 max-w-md rounded-none border p-4">
          <div className="space-y-2 text-xs">
            {Array.from({ length: 40 }, (_, i) => (
              <div key={i}>Line {i + 1}</div>
            ))}
          </div>
        </ScrollArea>
      </ShowcaseSection>
    </SectionLayout>
  )
}
