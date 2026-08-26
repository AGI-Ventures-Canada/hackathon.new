import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

type EventFixture = {
  id: string
  slug: string
  name: string
  description: string | null
  banner_url: string | null
  status: "active" | "published" | "judging" | "completed"
  starts_at: string | null
  ends_at: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  organizer?: {
    id: string
    name: string
    slug: string | null
    logo_url: string | null
    logo_url_dark: string | null
  }
}

type TenantFixture = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  logo_url_dark: string | null
  website_url: string | null
  organizedHackathons: EventFixture[]
  sponsoredHackathons: EventFixture[]
}

type TabsProps = {
  allHackathons: Array<EventFixture & { role: "organizer" | "sponsor" | "both" }>
  organizedHackathons: Array<EventFixture & { role: "organizer" }>
  sponsoredHackathons: Array<EventFixture & { role: "sponsor" }>
  totalUniqueEvents: number
  timelineReferenceTime: string
}

const FIXED_NOW = "2026-08-26T16:00:00.000Z"
const originalDate = globalThis.Date
let tenant: TenantFixture | null
let tabsProps: TabsProps | null

const getPublicTenantWithEvents = mock(async (_slug: string) => tenant)
const notFound = mock((): never => {
  throw new Error("NEXT_NOT_FOUND")
})

mock.module("next/navigation", () => ({ notFound }))
mock.module("@/lib/services/tenant-profiles", () => ({
  getPublicTenantWithEvents,
}))
mock.module("@/components/org/org-header", () => ({
  OrgHeader: ({ org }: { org: TenantFixture }) => createElement("header", null, org.name),
}))
mock.module("@/components/org/org-event-tabs", () => ({
  OrgEventTabs: (props: TabsProps) => {
    tabsProps = props
    return createElement("div", null, "Event tabs")
  },
}))

const orgPage = await import("@/app/(public)/o/[slug]/page")

function event(
  id: string,
  status: EventFixture["status"],
  startsAt: string | null,
  endsAt: string | null,
): EventFixture {
  return {
    id,
    slug: id,
    name: id,
    description: null,
    banner_url: null,
    status,
    starts_at: startsAt,
    ends_at: endsAt,
    registration_opens_at: status === "published"
      ? "2026-09-01T12:00:00.000Z"
      : null,
    registration_closes_at: status === "published"
      ? "2026-09-03T12:00:00.000Z"
      : null,
  }
}

function params(slug = "maple-labs") {
  return { params: Promise.resolve({ slug }) }
}

beforeEach(() => {
  globalThis.Date = class extends originalDate {
    constructor(...args: Parameters<typeof Date>) {
      super(...(args.length === 0 ? [FIXED_NOW] : args))
    }

    static now() {
      return originalDate.parse(FIXED_NOW)
    }
  } as typeof Date

  tenant = {
    id: "tenant-1",
    name: "Maple Labs",
    slug: "maple-labs",
    description: "We build useful things.",
    logo_url: null,
    logo_url_dark: null,
    website_url: null,
    organizedHackathons: [],
    sponsoredHackathons: [],
  }
  tabsProps = null
  getPublicTenantWithEvents.mockClear()
  notFound.mockClear()
})

afterEach(() => {
  globalThis.Date = originalDate
})

describe("public organization page", () => {
  it("builds metadata and handles a missing organization", async () => {
    await expect(orgPage.generateMetadata(params())).resolves.toEqual({
      title: "Maple Labs | hackathon.new",
      description: "We build useful things.",
    })

    tenant = { ...tenant!, description: null }
    await expect(orgPage.generateMetadata(params())).resolves.toEqual({
      title: "Maple Labs | hackathon.new",
      description: "Maple Labs on hackathon.new",
    })

    tenant = null
    await expect(orgPage.generateMetadata(params("missing"))).resolves.toEqual({
      title: "Organization Not Found",
    })
    await expect(orgPage.default(params("missing"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    )
    expect(notFound).toHaveBeenCalledTimes(1)
  })

  it("renders the public empty state", async () => {
    const html = renderToStaticMarkup(await orgPage.default(params()))

    expect(html).toContain("Maple Labs")
    expect(html).toContain("No events yet")
    expect(html).toContain("hasn&#x27;t organized or sponsored")
    expect(tabsProps).toBeNull()
  })

  it("uses one server time to sort and deduplicate organizer and sponsor events", async () => {
    const liveEarly = event(
      "live-early",
      "active",
      "2026-08-24T12:00:00.000Z",
      "2026-08-28T12:00:00.000Z",
    )
    const liveLate = event(
      "live-late",
      "active",
      "2026-08-25T12:00:00.000Z",
      "2026-08-29T12:00:00.000Z",
    )
    const future = event(
      "future",
      "published",
      "2026-09-05T12:00:00.000Z",
      "2026-09-06T12:00:00.000Z",
    )
    const completed = event(
      "completed",
      "completed",
      "2026-08-10T12:00:00.000Z",
      "2026-08-11T12:00:00.000Z",
    )
    const sponsoredOnly = {
      ...event(
        "sponsored-only",
        "judging",
        "2026-08-20T12:00:00.000Z",
        "2026-08-25T12:00:00.000Z",
      ),
      organizer: {
        id: "tenant-2",
        name: "Other Org",
        slug: "other-org",
        logo_url: null,
        logo_url_dark: null,
      },
    }

    tenant = {
      ...tenant!,
      organizedHackathons: [completed, liveLate, future, liveEarly],
      sponsoredHackathons: [sponsoredOnly, { ...liveEarly }],
    }

    renderToStaticMarkup(await orgPage.default(params()))

    expect(getPublicTenantWithEvents).toHaveBeenLastCalledWith("maple-labs")
    expect(tabsProps?.timelineReferenceTime).toBe(FIXED_NOW)
    expect(tabsProps?.totalUniqueEvents).toBe(5)
    expect(tabsProps?.allHackathons.map(({ id, role }) => [id, role])).toEqual([
      ["live-early", "both"],
      ["live-late", "organizer"],
      ["future", "organizer"],
      ["sponsored-only", "sponsor"],
      ["completed", "organizer"],
    ])
    expect(tabsProps?.organizedHackathons.map(({ id }) => id)).toEqual([
      "live-early",
      "live-late",
      "future",
      "completed",
    ])
    expect(tabsProps?.sponsoredHackathons.map(({ id }) => id)).toEqual([
      "live-early",
      "sponsored-only",
    ])
  })
})
