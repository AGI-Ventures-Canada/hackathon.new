import { afterEach, describe, expect, it } from "bun:test"
import { act, cleanup, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { AnnouncementDateLabel } from "@/app/(public)/e/[slug]/manage/_event-tab"
import {
  ReminderDateLabel,
  ReminderStatus,
  type Reminder,
} from "@/components/hackathon/post-event-panel"
import { ExportRow, type ExportListItem } from "@/components/hackathon/post-event-exports"

let hydratedRoot: Root | null = null
let container: HTMLDivElement | null = null
let originalTimeZone: string | undefined

function textFromHtml(html: string): string {
  const wrapper = document.createElement("div")
  wrapper.innerHTML = html
  return wrapper.textContent ?? ""
}

async function hydrateInToronto(element: ReactElement) {
  originalTimeZone = process.env.TZ
  process.env.TZ = "UTC"
  const serverHtml = renderToString(element)

  process.env.TZ = "America/Toronto"
  container = document.createElement("div")
  container.innerHTML = serverHtml
  document.body.appendChild(container)
  const recoverableErrors: unknown[] = []

  await act(async () => {
    hydratedRoot = hydrateRoot(container!, element, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    })
  })

  return { serverHtml, recoverableErrors }
}

afterEach(async () => {
  if (hydratedRoot) {
    await act(async () => hydratedRoot?.unmount())
    hydratedRoot = null
  }
  container?.remove()
  container = null
  cleanup()
  if (originalTimeZone === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = originalTimeZone
  }
  originalTimeZone = undefined
})

describe("manage date hydration", () => {
  it("hydrates announcement dates in UTC before showing the browser time zone", async () => {
    const { serverHtml, recoverableErrors } = await hydrateInToronto(
      <AnnouncementDateLabel label="Sent" date="2030-01-01T01:30:00Z" />,
    )

    const serverText = textFromHtml(serverHtml)
    expect(serverText).toContain("Sent Jan 1, 2030")
    expect(serverText).toContain("1:30 AM")
    await waitFor(() => {
      expect(container?.textContent).toContain("Sent Dec 31, 2029")
      expect(container?.textContent).toContain("8:30 PM")
    })
    expect(recoverableErrors).toEqual([])
  })

  it("hydrates reminder dates and defers current-time status checks", async () => {
    const reminder: Reminder = {
      id: "reminder-1",
      type: "feedback_followup",
      scheduledFor: "2020-01-01T01:30:00Z",
      sentAt: null,
      cancelledAt: null,
      recipientFilter: "all",
      createdAt: "2019-12-01T00:00:00Z",
    }
    const sentReminder: Reminder = {
      ...reminder,
      id: "reminder-2",
      sentAt: "2030-01-01T01:30:00Z",
    }
    const cancelledReminder: Reminder = {
      ...reminder,
      id: "reminder-3",
      cancelledAt: "2019-12-31T00:00:00Z",
    }
    const { serverHtml, recoverableErrors } = await hydrateInToronto(
      <>
        <ReminderStatus reminder={reminder} />
        <ReminderDateLabel reminder={reminder} />
        <ReminderStatus reminder={sentReminder} />
        <ReminderDateLabel reminder={sentReminder} />
        <ReminderStatus reminder={cancelledReminder} />
        <ReminderDateLabel reminder={cancelledReminder} />
      </>,
    )

    const serverText = textFromHtml(serverHtml)
    expect(serverText).toContain("Scheduled")
    expect(serverText).toContain("Scheduled for 1/1/2020")
    expect(serverText).toContain("Sent 1/1/2030")
    expect(serverText).toContain("Cancelled")
    await waitFor(() => {
      expect(container?.textContent).toContain("Pending")
      expect(container?.textContent).toContain("Scheduled for 12/31/2019")
      expect(container?.textContent).toContain("Sent 12/31/2029")
    })
    expect(recoverableErrors).toEqual([])
  })

  it("hydrates export expiry dates in UTC before showing the browser time zone", async () => {
    const exp: ExportListItem = {
      id: "export-1",
      status: "ready",
      submissionCount: 1,
      fileSizeBytes: 100,
      createdAt: "2029-12-31T00:00:00Z",
      readyAt: "2029-12-31T00:01:00Z",
      expiresAt: "2030-01-01T01:30:00Z",
      errorMessage: null,
    }
    const { serverHtml, recoverableErrors } = await hydrateInToronto(
      <ExportRow exp={exp} hackathonId="hydration-event" />,
    )

    expect(textFromHtml(serverHtml)).toContain("download expires Jan 1")
    await waitFor(() => {
      expect(container?.textContent).toContain("download expires Dec 31")
    })
    expect(recoverableErrors).toEqual([])
  })
})
