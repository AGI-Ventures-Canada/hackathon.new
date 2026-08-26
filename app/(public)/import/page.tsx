import { notFound } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import { cache } from "react"
import { TriangleAlert } from "lucide-react"
import {
  EventImportEditor,
  EventImportRecovery,
} from "@/components/hackathon/event-import-editor"
import { extractExternalEventData, extractExternalRichContent } from "@/lib/services/external-import"
import { ttlCache } from "@/lib/utils/ttl-cache"
import { normalizeImportUrl, redactImportSourceUrl } from "@/lib/utils/url"
import { sha256Fingerprint } from "@/lib/utils/hash"
import { consumePublicImportRateLimit } from "@/lib/services/public-import-rate-limit"
import { Button } from "@/components/ui/button"
import type { Metadata } from "next"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const loadImportEventData = cache(async (normalizedUrl: string) => {
  const rateLimit = await consumePublicImportRateLimit(await headers())
  if (rateLimit && !rateLimit.allowed) {
    return { eventData: null, rateLimited: true } as const
  }

  const eventData = await ttlCache(`import:data:${normalizedUrl}`, () =>
    extractExternalEventData(normalizedUrl)
  )
  return { eventData, rateLimited: false } as const
})

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const query = await searchParams
  const rawUrl = Array.isArray(query.url) ? query.url[0] : query.url

  if (!rawUrl) {
    return { title: "Import from Event Page | hackathon.new" }
  }

  const normalized = normalizeImportUrl(rawUrl)
  if (!normalized) {
    return { title: "Import from Event Page | hackathon.new" }
  }

  const { eventData } = await loadImportEventData(normalized)

  if (!eventData) {
    return { title: "Import from Event Page | hackathon.new" }
  }

  return {
    title: `Import "${eventData.name}" | hackathon.new`,
    description: `Create a hackathon from the event page: ${eventData.name}`,
  }
}

export default async function EventImportPage({ searchParams }: PageProps) {
  const query = await searchParams
  const rawUrl = Array.isArray(query.url) ? query.url[0] : query.url

  if (!rawUrl) {
    notFound()
  }

  const normalizedUrl = normalizeImportUrl(rawUrl)

  if (!normalizedUrl) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <TriangleAlert className="size-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">That event link won&apos;t work</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Use a public HTTPS link with 2,048 characters or fewer.
          </p>
          <Button asChild>
            <Link href="/create">Try another link</Link>
          </Button>
        </div>
      </div>
    )
  }
  const sourceUrl = redactImportSourceUrl(normalizedUrl)!
  const sourceStorageKey = `oatmeal:external-import:${await sha256Fingerprint(normalizedUrl)}`

  const { eventData, rateLimited } = await loadImportEventData(normalizedUrl)

  if (rateLimited) {
    return (
      <EventImportRecovery
        key={normalizedUrl}
        sourceUrl={sourceUrl}
        storageKey={sourceStorageKey}
        submitPath="/api/dashboard/import/event"
        fallback={
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <TriangleAlert className="size-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Too many event links</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Wait a minute, then try this link again.
              </p>
              <Button asChild>
                <Link href="/create">Try another link</Link>
              </Button>
            </div>
          </div>
        }
      />
    )
  }

  const richContent = eventData
    ? await ttlCache(`import:rich:${normalizedUrl}:${eventData.startsAt ?? ""}`, () =>
        extractExternalRichContent(normalizedUrl, { eventStartsAt: eventData.startsAt })
      )
    : null

  if (!eventData) {
    return (
      <EventImportRecovery
        key={normalizedUrl}
        sourceUrl={sourceUrl}
        storageKey={sourceStorageKey}
        submitPath="/api/dashboard/import/event"
        fallback={
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <TriangleAlert className="size-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">We couldn&apos;t read that event page</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                The page at <span className="font-mono text-foreground">{sourceUrl}</span> didn&apos;t
                give us the info we needed. A few things that can cause this:
              </p>
              <ul className="text-left text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>The page needs a login to see the event details.</li>
                <li>The page doesn&apos;t have a title, date, or description we could find.</li>
                <li>The site is blocking automated readers.</li>
              </ul>
              <p className="max-w-md text-sm text-muted-foreground">
                You can start from scratch instead — it only takes a minute.
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link href="/">Go back</Link>
                </Button>
                <Button asChild>
                  <Link href="/create">Start from scratch</Link>
                </Button>
              </div>
            </div>
          </div>
        }
      />
    )
  }

  return (
    <EventImportEditor
      key={normalizedUrl}
      eventData={eventData}
      richContent={richContent}
      sourceUrl={sourceUrl}
      storageKey={sourceStorageKey}
      submitPath="/api/dashboard/import/event"
    />
  )
}
