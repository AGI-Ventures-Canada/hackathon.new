import { notFound } from "next/navigation"
import { Calendar } from "lucide-react"
import { getPublicTenantWithEvents } from "@/lib/services/tenant-profiles"
import { OrgHeader } from "@/components/org/org-header"
import { OrgEventTabs } from "@/components/org/org-event-tabs"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { getTimelineStateAt } from "@/lib/utils/timeline"
import type { HackathonWithRole } from "@/components/org/hackathon-grid"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const tenant = await getPublicTenantWithEvents(slug)

  if (!tenant) {
    return { title: "Organization Not Found" }
  }

  return {
    title: `${tenant.name} | hackathon.new`,
    description: tenant.description || `${tenant.name} on hackathon.new`,
  }
}

const STATUS_PRIORITY: Record<string, number> = {
  Live: 0,
  "Registration Open": 1,
  "Registration Closed": 2,
  "Coming Soon": 3,
  Judging: 4,
  Completed: 5,
  Draft: 6,
  Archived: 7,
}

function sortHackathons<T extends HackathonWithRole>(
  hackathons: T[],
  referenceTime: Date,
): T[] {
  return [...hackathons].sort((a, b) => {
    const priorityA = STATUS_PRIORITY[getTimelineStateAt(a, referenceTime).label] ?? 8
    const priorityB = STATUS_PRIORITY[getTimelineStateAt(b, referenceTime).label] ?? 8

    if (priorityA !== priorityB) return priorityA - priorityB

    if (priorityA <= 3) {
      if (!a.starts_at && !b.starts_at) return 0
      if (!a.starts_at) return 1
      if (!b.starts_at) return -1
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    } else {
      if (!a.ends_at && !b.ends_at) return 0
      if (!a.ends_at) return 1
      if (!b.ends_at) return -1
      return new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime()
    }
  })
}

export default async function OrgPage({ params }: PageProps) {
  const { slug } = await params
  const tenant = await getPublicTenantWithEvents(slug)

  if (!tenant) {
    notFound()
  }

  const { organizedHackathons, sponsoredHackathons } = tenant
  const timelineReferenceTime = new Date()

  const organizedIds = new Set(organizedHackathons.map((h) => h.id))
  const sponsoredOnlyHackathons = sponsoredHackathons.filter(
    (h) => !organizedIds.has(h.id)
  )
  const totalUniqueEvents = organizedHackathons.length + sponsoredOnlyHackathons.length

  const allHackathons = sortHackathons(
    [
      ...organizedHackathons.map((h) => ({
        ...h,
        role: sponsoredHackathons.some((s) => s.id === h.id)
          ? ("both" as const)
          : ("organizer" as const),
      })),
      ...sponsoredOnlyHackathons.map((h) => ({ ...h, role: "sponsor" as const })),
    ],
    timelineReferenceTime,
  )

  return (
    <div>
      <OrgHeader org={tenant} />

      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {totalUniqueEvents === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="size-10 text-muted-foreground mb-4" />
                  <CardTitle className="mb-2">No events yet</CardTitle>
                  <CardDescription>
                    This organization hasn&apos;t organized or sponsored any public events yet.
                  </CardDescription>
                </CardContent>
              </Card>
            ) : (
              <OrgEventTabs
                allHackathons={allHackathons}
                organizedHackathons={sortHackathons(
                  organizedHackathons.map((h) => ({ ...h, role: "organizer" as const })),
                  timelineReferenceTime,
                )}
                sponsoredHackathons={sortHackathons(
                  sponsoredHackathons.map((h) => ({ ...h, role: "sponsor" as const })),
                  timelineReferenceTime,
                )}
                totalUniqueEvents={totalUniqueEvents}
                timelineReferenceTime={timelineReferenceTime.toISOString()}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
