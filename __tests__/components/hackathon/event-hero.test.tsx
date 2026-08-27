import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"

mock.module("next/link", () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode
    href: string
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

mock.module("@/components/ui/optimized-image", () => ({
  OptimizedImage: ({
    alt,
    className,
  }: {
    alt: string
    className?: string
  // eslint-disable-next-line @next/next/no-img-element
  }) => <img alt={alt} className={className} />,
}))

mock.module("@/components/hackathon/registration-button", () => ({
  RegistrationButton: () => null,
}))

mock.module("@/components/hackathon/submission-button", () => ({
  SubmissionButton: () => null,
}))

mock.module("@/components/hackathon/countdown-badge", () => ({
  CountdownBadge: () => null,
}))

const { EventHero } = await import("@/components/hackathon/event-hero")
const OriginalDate = globalThis.Date

function mockDate(isoString: string) {
  const now = new OriginalDate(isoString).getTime()
  globalThis.Date = class extends OriginalDate {
    constructor(...args: Parameters<typeof Date>) {
      if (args.length === 0) {
        super(now)
      } else {
        super(...args)
      }
    }

    static now() {
      return now
    }
  } as typeof Date
}

afterEach(() => {
  cleanup()
  globalThis.Date = OriginalDate
})

describe("EventHero", () => {
  it("uses deterministic UTC dates in server markup", () => {
    const html = renderToString(
      <EventHero
        name="Boundary Event"
        bannerUrl={null}
        status="published"
        startsAt="2026-10-25T00:30:00Z"
        endsAt="2026-10-27T00:30:00Z"
        organizer={{ name: "Test Org", slug: null, logo_url: null, logo_url_dark: null }}
      />
    )

    expect(html).toContain("Oct 25 – 27, 2026")
    expect(html).toContain("Starts 12:30 AM")
  })

  it("keeps server lifecycle markup stable across an event boundary", () => {
    const props = {
      name: "Boundary Event",
      bannerUrl: null,
      status: "published" as const,
      startsAt: "2026-03-01T00:00:00Z",
      endsAt: "2026-03-02T00:00:00Z",
      registrationOpensAt: "2026-02-01T00:00:00Z",
      registrationClosesAt: "2026-02-15T00:00:00Z",
      organizer: { name: "Test Org", slug: null, logo_url: null, logo_url_dark: null },
      isRegistered: true,
    }

    mockDate("2026-02-28T23:59:59Z")
    const beforeBoundary = renderToString(<EventHero {...props} />)

    mockDate("2026-03-03T00:00:00Z")
    const afterBoundary = renderToString(<EventHero {...props} />)

    expect(beforeBoundary).toContain("Published")
    expect(beforeBoundary).not.toContain("Registration Open")
    expect(afterBoundary).toBe(beforeBoundary)
  })

  it("keeps long in-person locations left-aligned without shrinking the icon", () => {
    const { container } = render(
      <EventHero
        name="DevOps for GenAI Hackathon"
        bannerUrl={null}
        status="draft"
        startsAt="2026-06-08T13:00:00Z"
        endsAt="2026-06-08T23:00:00Z"
        organizer={{ name: "Your Organization", slug: null, logo_url: null, logo_url_dark: null }}
        locationType="in_person"
        locationName="Invest Ottawa (7 Bayview Station Road, Ottawa, ON K1Y 2C5, Ottawa, ON)"
      />
    )

    const locationText = screen.getByText(
      "Invest Ottawa (7 Bayview Station Road, Ottawa, ON K1Y 2C5, Ottawa, ON)"
    )
    expect(locationText.className).toContain("text-left")
    expect(locationText.className).toContain("break-words")

    const locationRow = locationText.parentElement
    const icon = locationRow?.querySelector("svg") ?? container.querySelector("svg")
    expect(icon?.className.baseVal ?? icon?.getAttribute("class")).toContain("shrink-0")
  })
})
