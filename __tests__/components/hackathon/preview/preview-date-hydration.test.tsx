import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { act, waitFor } from "@testing-library/react"
import { useEffect, useState } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { useIsClient } from "@/hooks/use-is-client"
import {
  formatPreviewScheduleTime,
  getPendingInvitationTiming,
} from "@/components/hackathon/preview/preview-date-formatting"

let container: HTMLDivElement | null = null
let hydratedRoot: Root | null = null
let originalTimeZone: string | undefined

beforeEach(() => {
  originalTimeZone = process.env.TZ
})

function PreviewDateProbe() {
  const isClient = useIsClient()
  const [nowIso, setNowIso] = useState<string | null>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setNowIso("2030-01-01T02:00:00.000Z")
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const expiredInvitation = getPendingInvitationTiming({
    createdAt: "2030-01-01T01:30:00.000Z",
    expiresAt: "2030-01-01T01:30:00.000Z",
    isClient,
    nowIso,
  })
  const futureInvitation = getPendingInvitationTiming({
    createdAt: "2030-01-01T01:30:00.000Z",
    expiresAt: "2030-01-04T01:30:00.000Z",
    isClient,
    nowIso,
  })

  return (
    <div>
      <span data-testid="schedule-time">
        {formatPreviewScheduleTime("2030-01-01T00:30:00.000Z", isClient)}
      </span>
      <span data-testid="sent-label">{expiredInvitation.sentLabel}</span>
      <span data-testid="expired-label">{expiredInvitation.expiryLabel}</span>
      <span data-testid="future-label">{futureInvitation.expiryLabel}</span>
    </div>
  )
}

afterEach(async () => {
  if (hydratedRoot) {
    await act(async () => hydratedRoot?.unmount())
  }
  hydratedRoot = null
  container?.remove()
  container = null
  if (originalTimeZone === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = originalTimeZone
  }
  originalTimeZone = undefined
})

describe("preview date hydration", () => {
  it("hydrates UTC labels before showing Toronto dates and current status", async () => {
    process.env.TZ = "UTC"
    const serverHtml = renderToString(<PreviewDateProbe />)

    expect(serverHtml).toContain("12:30 AM")
    expect(serverHtml).toContain("Sent Jan 1")
    expect(serverHtml).toContain("Expires Jan 1")
    expect(serverHtml).toContain("Expires Jan 4")
    expect(serverHtml).not.toContain("Expired")

    process.env.TZ = "America/Toronto"
    container = document.createElement("div")
    container.innerHTML = serverHtml
    document.body.appendChild(container)
    const recoverableErrors: unknown[] = []

    await act(async () => {
      hydratedRoot = hydrateRoot(container!, <PreviewDateProbe />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })

    await waitFor(() => {
      expect(container?.querySelector('[data-testid="schedule-time"]')?.textContent).toBe("7:30 PM")
      expect(container?.querySelector('[data-testid="sent-label"]')?.textContent).toBe("Sent Dec 31")
      expect(container?.querySelector('[data-testid="expired-label"]')?.textContent).toBe("Expired")
      expect(container?.querySelector('[data-testid="future-label"]')?.textContent).toBe("Expires Jan 3")
    })
    expect(recoverableErrors).toEqual([])
  })

  it("defers clock checks and keeps the 48-hour threshold stable", () => {
    expect(getPendingInvitationTiming({
      createdAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2029-12-31T00:00:00.000Z",
      isClient: false,
      nowIso: null,
    })).toMatchObject({
      expiryLabel: "Expires Dec 31",
      isExpired: false,
    })

    expect(getPendingInvitationTiming({
      createdAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-02T11:01:00.000Z",
      isClient: false,
      nowIso: "2030-01-01T00:00:00.000Z",
    }).expiryLabel).toBe("Expires in 36h")

    expect(getPendingInvitationTiming({
      createdAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-03T00:00:00.000Z",
      isClient: false,
      nowIso: "2030-01-01T00:00:00.000Z",
    }).expiryLabel).toBe("Expires Jan 3")

    expect(getPendingInvitationTiming({
      createdAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
      isClient: false,
      nowIso: "2030-01-01T00:00:00.000Z",
    })).toMatchObject({
      expiryLabel: "Expired",
      isExpired: true,
    })
  })
})
