import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { act, render, screen, cleanup, waitFor } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { resetComponentMocks } from "../../lib/component-mocks"
import type { SponsorTier } from "@/lib/db/hackathon-types"

const { SponsoringDashboard } = await import(
  "@/components/hackathon/sponsoring-dashboard"
)

beforeEach(() => {
  resetComponentMocks()
})

afterEach(() => {
  cleanup()
})

const makeHackathon = (overrides: Record<string, unknown> = {}) => ({
  id: "h1",
  slug: "test-hack",
  name: "Test Hackathon",
  description: "A test event",
  status: "active" as const,
  registration_opens_at: null,
  registration_closes_at: null,
  starts_at: new Date(Date.now() - 86400000).toISOString(),
  ends_at: new Date(Date.now() + 86400000).toISOString(),
  ...overrides,
})

const makeSponsorship = (hackathonId: string, tier: SponsorTier = "gold", customTierLabel: string | null = null) => ({
  hackathonId,
  tier,
  customTierLabel,
  name: "Acme Corp",
})

describe("SponsoringDashboard", () => {
  it("renders empty state when no hackathons", () => {
    render(<SponsoringDashboard hackathons={[]} sponsorships={{}} />)
    expect(screen.getByText("No sponsorships")).toBeDefined()
    expect(screen.getByText("Browse hackathons")).toBeDefined()
  })

  it("renders stat cards", () => {
    const hackathons = [
      makeHackathon({ id: "h1" }),
      makeHackathon({ id: "h2", slug: "h2", name: "Hack 2" }),
    ]
    const sponsorships = {
      h1: makeSponsorship("h1", "gold"),
      h2: makeSponsorship("h2", "silver"),
    }

    render(<SponsoringDashboard hackathons={hackathons} sponsorships={sponsorships} />)
    expect(screen.getByText("Events sponsored")).toBeDefined()
    expect(screen.getByText("Active")).toBeDefined()
    expect(screen.getByText("Title & Gold")).toBeDefined()
  })

  it("shows tier badge on cards", () => {
    render(
      <SponsoringDashboard
        hackathons={[makeHackathon()]}
        sponsorships={{ h1: makeSponsorship("h1", "gold") }}
      />,
    )
    expect(screen.getByText("Gold")).toBeDefined()
  })

  it("shows past events section for completed hackathons", () => {
    const h = makeHackathon({
      status: "completed",
      ends_at: new Date(Date.now() - 86400000).toISOString(),
    })

    render(
      <SponsoringDashboard
        hackathons={[h]}
        sponsorships={{ h1: makeSponsorship("h1", "custom") }}
      />,
    )
    expect(screen.getByText("Past events")).toBeDefined()
  })

  it("renders page header", () => {
    render(
      <SponsoringDashboard
        hackathons={[makeHackathon()]}
        sponsorships={{ h1: makeSponsorship("h1") }}
      />,
    )
    expect(screen.getByText("Sponsoring")).toBeDefined()
    expect(screen.getByText("Your sponsorship portfolio")).toBeDefined()
  })

  it("renders different tier labels correctly", () => {
    const hackathons = [
      makeHackathon({ id: "h1" }),
      makeHackathon({ id: "h2", slug: "h2", name: "Hack 2" }),
    ]
    const sponsorships = {
      h1: makeSponsorship("h1", "custom", "Platinum"),
      h2: makeSponsorship("h2", "bronze"),
    }

    render(<SponsoringDashboard hackathons={hackathons} sponsorships={sponsorships} />)
    expect(screen.getByText("Platinum")).toBeDefined()
    expect(screen.getByText("Bronze")).toBeDefined()
  })

  it("hydrates before moving a time-ended event into the past section", async () => {
    const hackathons = [makeHackathon({
      status: "active",
      ends_at: "2020-01-01T00:00:00.000Z",
    })]
    const sponsorships = { h1: makeSponsorship("h1") }
    const element = (
      <SponsoringDashboard
        hackathons={hackathons}
        sponsorships={sponsorships}
      />
    )
    const serverHtml = renderToString(element)
    expect(serverHtml).toContain("Active sponsorships")
    expect(serverHtml).not.toContain("Past events")

    const container = document.createElement("div")
    const recoverableErrors: unknown[] = []
    container.innerHTML = serverHtml
    document.body.appendChild(container)
    const root = hydrateRoot(container, element, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    })

    try {
      await waitFor(() => expect(container.textContent).toContain("Past events"))
      expect(recoverableErrors).toEqual([])
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
