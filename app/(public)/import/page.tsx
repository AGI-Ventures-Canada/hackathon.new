import { notFound } from "next/navigation"
import Link from "next/link"
import { TriangleAlert } from "lucide-react"
import { EventImportEditor } from "@/components/hackathon/event-import-editor"
import { extractExternalEventData, extractExternalRichContent } from "@/lib/services/external-import"
import { ttlCache } from "@/lib/utils/ttl-cache"
import { normalizeUrl, isSafeExternalUrl } from "@/lib/utils/url"
import { Button } from "@/components/ui/button"
import type { Metadata } from "next"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const query = await searchParams
  const rawUrl = Array.isArray(query.url) ? query.url[0] : query.url

  if (!rawUrl) {
    return { title: "Import from Event Page | Oatmeal" }
  }

  const normalized = normalizeUrl(rawUrl)
  if (!isSafeExternalUrl(normalized)) {
    return { title: "Import from Event Page | Oatmeal" }
  }

  const eventData = await ttlCache(`import:data:${normalized}`, () => extractExternalEventData(normalized))

  if (!eventData) {
    return { title: "Import from Event Page | Oatmeal" }
  }

  return {
    title: `Import "${eventData.name}" | Oatmeal`,
    description: `Create a hackathon from the event page: ${eventData.name}`,
  }
}

export default async function EventImportPage({ searchParams }: PageProps) {
  const query = await searchParams
  const rawUrl = Array.isArray(query.url) ? query.url[0] : query.url

  if (!rawUrl) {
    notFound()
  }

  const normalizedUrl = normalizeUrl(rawUrl)

  if (!isSafeExternalUrl(normalizedUrl)) {
    notFound()
  }

  const eventData = await ttlCache(`import:data:${normalizedUrl}`, () =>
    extractExternalEventData(normalizedUrl)
  )

  const richCacheKey = `import:rich:${normalizedUrl}:${eventData?.startsAt ?? ""}`
  const richContent = await ttlCache(richCacheKey, () =>
    extractExternalRichContent(normalizedUrl, { eventStartsAt: eventData?.startsAt ?? null })
  )

  if (!eventData) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <TriangleAlert className="size-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">We couldn&apos;t read that event page</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            The page at <span className="font-mono text-foreground">{normalizedUrl}</span> didn&apos;t
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
              <Link href="/hackathons/new">Start from scratch</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <EventImportEditor
      eventData={eventData}
      richContent={richContent}
      sourceUrl={normalizedUrl}
      storageKey="oatmeal:external-import"
      submitPath="/api/dashboard/import/event"
    />
  )
}
