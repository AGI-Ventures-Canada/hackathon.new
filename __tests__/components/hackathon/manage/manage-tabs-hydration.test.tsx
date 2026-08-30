import React from "react"
import { describe, expect, it } from "bun:test"
import { act, waitFor } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import type { Challenge } from "@/lib/services/challenges"
import type { Perk } from "@/lib/services/perks"
import { ChallengesTab } from "@/components/hackathon/manage/challenges-tab"
import { PerksTab } from "@/components/hackathon/manage/perks-tab"

const boundaryTimestamp = "2030-04-10T00:30:00.000Z"

const challenge: Challenge = {
  id: "challenge-1",
  hackathonId: "11111111-1111-1111-1111-111111111111",
  title: "City helper",
  description: "Make city services easier to use.",
  resources: [
    { label: "Starter docs", url: "docs.example.com/start" },
    { label: "Old unsafe link", url: "javascript:alert(1)" },
  ],
  sortOrder: 0,
  createdAt: "2030-04-01T12:00:00.000Z",
  updatedAt: "2030-04-01T12:00:00.000Z",
}

const releasedPerk: Perk = {
  id: "perk-released",
  hackathonId: "11111111-1111-1111-1111-111111111111",
  sponsorId: null,
  name: "Build credits",
  description: "Credits for every team.",
  type: "credit",
  code: null,
  redemptionUrl: null,
  instructions: null,
  scheduledReleaseAt: null,
  releasedAt: boundaryTimestamp,
  sortOrder: 0,
  createdAt: "2030-04-01T12:00:00.000Z",
  updatedAt: "2030-04-01T12:00:00.000Z",
}

const automaticallyReleasedPerk: Perk = {
  ...releasedPerk,
  id: "perk-automatic",
  name: "API access",
  type: "api_key",
  scheduledReleaseAt: "2020-04-10T00:30:00.000Z",
  releasedAt: null,
  sortOrder: 1,
}

async function hydrateFromUtcToToronto(
  renderComponent: () => React.ReactElement,
  assertServerHtml: (html: string) => void,
  assertClient: (container: HTMLElement) => void,
): Promise<void> {
  const originalTimeZone = process.env.TZ
  const recoverableErrors: unknown[] = []
  const container = document.createElement("div")
  let hydratedRoot: Root | null = null

  try {
    process.env.TZ = "UTC"
    const serverHtml = renderToString(renderComponent())
    assertServerHtml(serverHtml)

    process.env.TZ = "America/Toronto"
    container.innerHTML = serverHtml
    document.body.appendChild(container)
    await act(async () => {
      hydratedRoot = hydrateRoot(container, renderComponent(), {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })

    await waitFor(() => assertClient(container))
    expect(recoverableErrors).toEqual([])
  } finally {
    if (hydratedRoot) {
      await act(async () => hydratedRoot?.unmount())
    }
    container.remove()
    if (originalTimeZone === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = originalTimeZone
    }
  }
}

describe("manage tab hydration", () => {
  it("hydrates released challenge dates before using the browser time zone", async () => {
    const renderComponent = () => (
      <ChallengesTab
        hackathonId="11111111-1111-1111-1111-111111111111"
        initialChallenges={[challenge]}
        releasedAt={boundaryTimestamp}
        releaseScheduleItem={null}
        hackathonStartsAt="2030-04-11T12:00:00.000Z"
        hackathonEndsAt="2030-04-12T12:00:00.000Z"
        hackathonStatus="published"
      />
    )

    await hydrateFromUtcToToronto(
      renderComponent,
      (html) => {
        expect(html).toContain("released Apr 10 at 12:30 AM")
        expect(html).toContain('href="https://docs.example.com/start"')
        expect(html).toContain("Starter docs (opens in a new tab)")
        expect(html).not.toContain('href="javascript:')
      },
      (container) => {
        expect(container.textContent).toContain("released Apr 9 at 8:30 PM")
        const link = container.querySelector<HTMLAnchorElement>(
          'a[href="https://docs.example.com/start"]',
        )
        expect(link?.target).toBe("_blank")
        expect(link?.rel).toBe("noopener noreferrer")
        expect(link?.getAttribute("aria-label")).toBe(
          "Starter docs (opens in a new tab)",
        )
        expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
        expect(container.textContent).toContain("Old unsafe link")
      },
    )
  })

  it("hydrates perk dates and release state before using browser time", async () => {
    const renderComponent = () => (
      <PerksTab
        hackathonId="11111111-1111-1111-1111-111111111111"
        initialPerks={[releasedPerk, automaticallyReleasedPerk]}
        sponsors={[]}
        startsAt="2030-04-11T12:00:00.000Z"
        perksNone={false}
      />
    )

    await hydrateFromUtcToToronto(
      renderComponent,
      (html) => {
        expect(html).toContain("Released Apr 10 at 12:30 AM")
        expect(html).toContain("Releases Apr 10 at 12:30 AM")
      },
      (container) => {
        expect(container.textContent).toContain("Released Apr 9 at 8:30 PM")
        const automaticHeading = Array.from(container.querySelectorAll("h4")).find(
          (heading) => heading.textContent === "API access",
        )
        const automaticCard = automaticHeading?.closest(".rounded-lg")
        expect(automaticCard?.textContent).toContain("Live")
        expect(automaticCard?.textContent).toContain("Released")
        expect(automaticCard?.textContent).not.toContain("Releases")
      },
    )
  })
})
