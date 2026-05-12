"use client"

import { useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { VideoEmbedInfo } from "@/lib/utils/video-embed"
import { VideoEmbed } from "@/components/hackathon/video-embed"

type SubmissionMediaProps = {
  title: string
  video: VideoEmbedInfo | null
  screenshotUrl?: string | null
  screenshotUrls?: string[]
  className?: string
}

export function SubmissionMedia({
  title,
  video,
  screenshotUrl,
  screenshotUrls = [],
  className,
}: SubmissionMediaProps) {
  const screenshots = useMemo(
    () => {
      const metadataUrls = screenshotUrls.filter(Boolean)
      const urls = metadataUrls.length
        ? metadataUrls
        : screenshotUrl
          ? [screenshotUrl]
          : []
      return Array.from(new Set(urls)).slice(0, 2)
    },
    [screenshotUrl, screenshotUrls]
  )
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0)
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const activeScreenshot = screenshots[Math.min(activeScreenshotIndex, screenshots.length - 1)]

  if (!video && screenshots.length === 0) {
    return null
  }

  function openScreenshot(index: number) {
    setActiveScreenshotIndex(index)
    setScreenshotOpen(true)
  }

  return (
    <div className={cn("space-y-3", className)}>
      {video ? (
        <VideoEmbed video={video} />
      ) : activeScreenshot ? (
        <button
          type="button"
          onClick={() => openScreenshot(activeScreenshotIndex)}
          className="flex max-h-[28rem] w-full items-center justify-center overflow-hidden rounded-md border bg-muted"
          aria-label={`Open screenshot of ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeScreenshot}
            alt={`Screenshot of ${title}`}
            className="max-h-[28rem] w-full object-contain"
          />
        </button>
      ) : null}

      {screenshots.length > 0 && (video || screenshots.length > 1) && (
        <div className="grid grid-cols-2 gap-2">
          {screenshots.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => openScreenshot(index)}
              className={cn(
                "flex aspect-video items-center justify-center overflow-hidden rounded-md border bg-muted",
                !video && index === activeScreenshotIndex && "ring-2 ring-primary"
              )}
              aria-label={`Open screenshot ${index + 1} of ${title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Screenshot ${index + 1} of ${title}`}
                className="size-full object-contain"
              />
            </button>
          ))}
        </div>
      )}

      <Dialog open={screenshotOpen} onOpenChange={setScreenshotOpen}>
        <DialogContent className="p-2 sm:max-w-5xl">
          <DialogTitle className="sr-only">{title} screenshot</DialogTitle>
          <DialogDescription className="sr-only">
            Larger screenshot preview for {title}.
          </DialogDescription>
          {activeScreenshot && (
            <div className="flex max-h-[80vh] items-center justify-center overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeScreenshot}
                alt={`Screenshot of ${title}`}
                className="max-h-[80vh] w-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
