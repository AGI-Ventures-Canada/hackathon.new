import { afterEach, describe, expect, it, spyOn } from "bun:test"
import { act, cleanup, screen, waitFor } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { TimeRemainingBar } from "@/components/hackathon/time-remaining-bar"

let hydratedRoot: Root | null = null
let restoreDateNow: (() => void) | null = null

afterEach(async () => {
  restoreDateNow?.()
  restoreDateNow = null
  if (hydratedRoot) {
    await act(async () => hydratedRoot?.unmount())
    hydratedRoot = null
  }
  cleanup()
  document.body.innerHTML = ""
})

describe("TimeRemainingBar hydration", () => {
  it("waits for the browser clock before rendering remaining time", async () => {
    const props = {
      status: "registration_open" as const,
      registrationOpensAt: "2030-04-10T10:00:00Z",
      registrationClosesAt: "2030-04-10T12:00:00Z",
      startsAt: "2030-04-10T13:00:00Z",
      endsAt: "2030-04-11T13:00:00Z",
    }
    const serverHtml = renderToString(<TimeRemainingBar {...props} />)
    const now = spyOn(Date, "now").mockReturnValue(
      new Date("2030-04-10T11:00:01Z").getTime(),
    )
    restoreDateNow = () => now.mockRestore()
    const recoverableErrors: unknown[] = []
    const container = document.createElement("div")
    container.innerHTML = serverHtml
    document.body.appendChild(container)

    expect(serverHtml).toBe("")
    await act(async () => {
      hydratedRoot = hydrateRoot(container, <TimeRemainingBar {...props} />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })

    await waitFor(() => {
      expect(screen.getByText("59m remaining")).toBeDefined()
    })
    expect(recoverableErrors).toEqual([])
  })
})
