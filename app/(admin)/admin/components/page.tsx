import { ShowcaseShell } from "./showcase-shell"
import { type ShowcaseData, mockShowcaseData } from "./_mock-data"
import { isValidUuid } from "@/lib/utils/uuid"
import {
  getPublicHackathon,
  getPublicHackathonById,
} from "@/lib/services/public-hackathons"

const VALID_TABS = ["organizer", "judge", "attendee", "sponsor", "advanced"]

export default async function ComponentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; hackathonId?: string }>
}) {
  const { tab, hackathonId } = await searchParams
  const active = tab && VALID_TABS.includes(tab) ? tab : "organizer"

  const data = await loadShowcaseData(hackathonId)

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Component library</h1>
        <p className="text-sm text-muted-foreground">
          Every custom component in one place. Preview any flow without
          touching a real event.
        </p>
        <p className="text-xs text-muted-foreground">
          {data.isLive
            ? `Live mode — showing hackathon ${data.hackathon.slug}.`
            : "Sandbox mode — fake data, stubbed handlers. Add ?hackathonId=<uuid> to load a real hackathon."}
        </p>
      </div>
      <ShowcaseShell value={active} data={data} />
    </div>
  )
}

async function loadShowcaseData(hackathonId: string | undefined): Promise<ShowcaseData> {
  if (!hackathonId || !isValidUuid(hackathonId)) {
    return mockShowcaseData
  }

  const lookup = await getPublicHackathonById(hackathonId)
  if (!lookup) {
    return mockShowcaseData
  }

  const publicHackathon = await getPublicHackathon(lookup.slug, {
    includeUnpublished: true,
  })
  if (!publicHackathon) {
    return mockShowcaseData
  }

  return {
    ...mockShowcaseData,
    hackathon: publicHackathon,
    publicHackathon,
    organizer: publicHackathon.organizer,
    sponsors: publicHackathon.sponsors,
    rawSponsors: publicHackathon.sponsors.map(({ tenant: _t, ...rest }) => rest),
    judges: publicHackathon.judges,
    publicPrizes: publicHackathon.prizes,
    isLive: true,
  }
}
