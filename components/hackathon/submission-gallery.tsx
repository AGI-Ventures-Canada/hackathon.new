"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { getVideoEmbedInfo } from "@/lib/utils/video-embed"
import { SubmissionMedia } from "@/components/hackathon/submission-media"
import { SubmissionLinks } from "@/components/hackathon/submission-links"

export type GallerySubmission = {
  id: string
  title: string
  description: string | null
  githubUrl: string | null
  liveAppUrl: string | null
  demoVideoUrl: string | null
  screenshotUrl: string | null
  screenshotUrls?: string[]
  submitter: string
  createdAt: string
}

interface SubmissionGalleryProps {
  submissions: GallerySubmission[]
}

const PAGE_SIZE = 5

export function SubmissionGallery({ submissions }: SubmissionGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)

  const filteredSubmissions = submissions.filter((submission) => {
    const query = searchQuery.toLowerCase()
    return (
      submission.title.toLowerCase().includes(query) ||
      submission.submitter.toLowerCase().includes(query) ||
      submission.description?.toLowerCase().includes(query)
    )
  })

  const totalPages = Math.ceil(filteredSubmissions.length / PAGE_SIZE)
  const safePage = Math.min(page, totalPages || 1)
  const paged = filteredSubmissions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  if (submissions.length === 0) {
    return null
  }

  return (
    <section className="py-12 border-t">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-xl font-bold mb-6">Submissions</h2>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search submissions..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
            className="pl-10"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
        </div>

        <div className="text-xs text-muted-foreground mb-4">
          {filteredSubmissions.length} submission{filteredSubmissions.length !== 1 ? "s" : ""}
        </div>

        {filteredSubmissions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No submissions found matching &quot;{searchQuery}&quot;
          </div>
        ) : (
          <div className="relative">
            <Accordion type="single" collapsible className="w-full">
              {paged.map((submission, index) => (
                <AccordionItem key={submission.id} value={submission.id} className="group/accordion">
                  <AccordionTrigger className="py-4 text-sm hover:no-underline">
                    <div className="flex items-center gap-4 text-left">
                      <span className="text-muted-foreground w-6 text-right shrink-0">
                        {(safePage - 1) * PAGE_SIZE + index + 1}
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="font-semibold truncate">{submission.title}</span>
                        {submission.description && (
                          <span className="text-muted-foreground text-xs font-normal line-clamp-1 group-data-[state=open]/accordion:hidden">
                            {submission.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <SubmissionExpandedContent submission={submission} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {totalPages > 1 && (
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)) }}
                      aria-disabled={safePage === 1}
                      className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-4 text-sm text-muted-foreground">
                      {safePage} / {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)) }}
                      aria-disabled={safePage === totalPages}
                      className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function SubmissionExpandedContent({ submission }: { submission: GallerySubmission }) {
  const videoEmbed = submission.demoVideoUrl
    ? getVideoEmbedInfo(submission.demoVideoUrl)
    : null

  return (
    <div className="pl-10 space-y-4">
      <SubmissionMedia
        title={submission.title}
        video={videoEmbed}
        screenshotUrl={submission.screenshotUrl}
        screenshotUrls={submission.screenshotUrls}
      />
      {submission.description && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {submission.description}
        </p>
      )}
      <p className="text-xs text-muted-foreground">by {submission.submitter}</p>
      <SubmissionLinks
        githubUrl={submission.githubUrl}
        liveAppUrl={submission.liveAppUrl}
        demoVideoUrl={submission.demoVideoUrl}
        hasEmbeddedVideo={videoEmbed !== null}
      />
    </div>
  )
}
