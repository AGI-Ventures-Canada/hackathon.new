"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { JsonViewer } from "@/components/ui/json-viewer"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { MarkdownContent } from "@/components/ui/markdown-content"
import { CopyButton } from "@/components/ui/copy-button"
import { CopyableId } from "@/components/ui/copyable-id"
import { TabCount } from "@/components/ui/tab-count"
import { Button } from "@/components/ui/button"
import {
  SectionLayout,
  ShowcaseSection,
  ShowcaseRow,
  ShowcaseStack,
  ShowcaseLabel,
} from "../_section-layout"

const SECTIONS = [
  { id: "card", label: "Card" },
  { id: "table", label: "Table" },
  { id: "pagination", label: "Pagination" },
  { id: "json-viewer", label: "JSON viewer" },
  { id: "carousel", label: "Carousel" },
  { id: "markdown", label: "Markdown" },
  { id: "copy-button", label: "Copy button" },
  { id: "copyable-id", label: "Copyable id" },
  { id: "tab-count", label: "Tab count" },
]

const SAMPLE_JSON = {
  event: {
    name: "Spring Hack",
    startsAt: "2026-05-01T09:00:00Z",
    organizers: ["Alex", "Jamie"],
    stats: { registered: 124, teams: 28, submissions: 21 },
    sponsors: [
      { name: "Acme", tier: "gold" },
      { name: "Globex", tier: "silver" },
    ],
  },
  public: true,
}

const SAMPLE_MARKDOWN = `## Welcome to Spring Hack

You're about to build something fun. A few things to know:

- Teams of **1 to 4**
- Submissions due by Sunday at 5pm
- Prizes announced the Monday after

Need help? [Message an organizer](#) or check the schedule.

\`\`\`ts
const greet = (name: string) => \`Hi, \${name}!\`
\`\`\`
`

const SAMPLE_ROWS = [
  { id: "u_001", name: "Alex Ivany", role: "Organizer", status: "Active" },
  { id: "u_002", name: "Jamie Lin", role: "Judge", status: "Pending" },
  { id: "u_003", name: "Sam Reed", role: "Attendee", status: "Active" },
  { id: "u_004", name: "Morgan Park", role: "Sponsor", status: "Active" },
  { id: "u_005", name: "Casey Wu", role: "Attendee", status: "Removed" },
]

export function DataShowcase() {
  return (
    <SectionLayout sections={SECTIONS}>
      <ShowcaseSection id="card" title="Card" description="A box that groups related content.">
        <ShowcaseStack>
          <ShowcaseLabel>Default</ShowcaseLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Total teams</CardTitle>
                <CardDescription>Across all hackathons.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">248</p>
              </CardContent>
              <CardFooter>
                <Button variant="link">View teams</Button>
              </CardFooter>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Pending invites</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">12</p>
              </CardContent>
            </Card>
          </div>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="table" title="Table" description="Rows and columns of data.">
        <Table>
          <TableCaption>A list of recent people.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_ROWS.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.role}</TableCell>
                <TableCell>{row.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ShowcaseSection>

      <ShowcaseSection id="pagination" title="Pagination" description="Controls to move between pages.">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">20</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </ShowcaseSection>

      <ShowcaseSection id="json-viewer" title="JSON viewer" description="An expandable view of a JSON object.">
        <div className="max-w-2xl rounded-none border bg-muted/30 p-4">
          <JsonViewer data={SAMPLE_JSON} defaultExpanded />
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="carousel" title="Carousel" description="A row of cards you can swipe through.">
        <div className="mx-12 max-w-lg">
          <Carousel>
            <CarouselContent>
              {[1, 2, 3, 4].map((i) => (
                <CarouselItem key={i} className="md:basis-1/2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Slide {i}</CardTitle>
                      <CardDescription>Short blurb for slide {i}.</CardDescription>
                    </CardHeader>
                    <CardContent className="py-6 text-center text-2xl font-semibold">
                      {i}
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="markdown" title="Markdown" description="Renders markdown from strings stored in the database.">
        <div className="max-w-2xl rounded-none border p-4">
          <MarkdownContent>{SAMPLE_MARKDOWN}</MarkdownContent>
        </div>
      </ShowcaseSection>

      <ShowcaseSection id="copy-button" title="Copy button" description="A button that copies text when clicked.">
        <ShowcaseStack>
          <ShowcaseRow>
            <CopyButton value="Hello from the component library" />
            <CopyButton value="abc-123" size="icon" />
            <CopyButton value={{ hello: "world" }} showLabel={false} />
          </ShowcaseRow>
        </ShowcaseStack>
      </ShowcaseSection>

      <ShowcaseSection id="copyable-id" title="Copyable id" description="An id that copies to the clipboard when clicked.">
        <ShowcaseRow>
          <CopyableId id="hack_01HZX7ABCDEF" />
        </ShowcaseRow>
      </ShowcaseSection>

      <ShowcaseSection id="tab-count" title="Tab count" description="A small number shown next to a tab label.">
        <ShowcaseRow>
          <span className="text-xs">Pending</span>
          <TabCount>3</TabCount>
          <span className="text-xs">Archived</span>
          <TabCount>24</TabCount>
        </ShowcaseRow>
      </ShowcaseSection>
    </SectionLayout>
  )
}
