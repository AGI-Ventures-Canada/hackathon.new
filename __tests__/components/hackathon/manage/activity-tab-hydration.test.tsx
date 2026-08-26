import { afterEach, describe, expect, it, mock, setSystemTime } from "bun:test"
import { act, cleanup, waitFor } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { ActivityTab } from "@/app/(public)/e/[slug]/manage/_activity-tab"
import type { AuditLog } from "@/lib/db/hackathon-types"

const originalFetch = globalThis.fetch
const originalIntersectionObserver = globalThis.IntersectionObserver
const originalTimeZone = process.env.TZ

let hydratedRoot: Root | null = null

afterEach(async () => {
  if (hydratedRoot) {
    await act(async () => hydratedRoot?.unmount())
    hydratedRoot = null
  }
  cleanup()
  document.body.innerHTML = ""
  globalThis.fetch = originalFetch
  globalThis.IntersectionObserver = originalIntersectionObserver
  setSystemTime()
  if (originalTimeZone === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = originalTimeZone
  }
})

describe("ActivityTab hydration", () => {
  it("hydrates its loading state before showing browser-local activity dates", async () => {
    const log: AuditLog = {
      id: "activity-1",
      tenant_id: "11111111-1111-1111-1111-111111111111",
      action: "hackathon.updated",
      actor_type: "user",
      actor_id: "user-1",
      resource_type: "hackathon",
      resource_id: "22222222-2222-2222-2222-222222222222",
      metadata: {},
      created_at: "2030-04-10T00:30:00.000Z",
    }
    setSystemTime(new Date("2030-04-10T00:45:00.000Z"))
    globalThis.fetch = mock(async () => Response.json({ logs: [log], total: 1 })) as typeof fetch
    globalThis.IntersectionObserver = class implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = ""
      readonly thresholds = []

      disconnect() {}
      observe() {}
      takeRecords() { return [] }
      unobserve() {}
    }

    process.env.TZ = "UTC"
    const element = <ActivityTab hackathonId="22222222-2222-2222-2222-222222222222" />
    const serverHtml = renderToString(element)

    expect(serverHtml).toContain("Activity Log")
    expect(serverHtml).not.toContain("15m ago")

    process.env.TZ = "America/Toronto"
    const container = document.createElement("div")
    container.innerHTML = serverHtml
    document.body.appendChild(container)
    const recoverableErrors: unknown[] = []

    await act(async () => {
      hydratedRoot = hydrateRoot(container, element, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })

    await waitFor(() => {
      expect(container.textContent).toContain("Today")
      expect(container.textContent).toContain("15m ago")
    })
    const localTimestamp = new Date(log.created_at).toLocaleString()
    expect(container.querySelector(`span[title="${localTimestamp}"]`)).not.toBeNull()
    expect(recoverableErrors).toEqual([])
  })
})
