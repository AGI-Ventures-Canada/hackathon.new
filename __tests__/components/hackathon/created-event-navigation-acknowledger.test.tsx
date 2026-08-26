import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { cleanup, render, waitFor } from "@testing-library/react"
import { CreatedEventNavigationAcknowledger } from "@/components/hackathon/created-event-navigation-acknowledger"
import {
  getPendingCreatedEventNavigation,
  rememberCreatedEventNavigation,
} from "@/lib/created-event-navigation"

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe("CreatedEventNavigationAcknowledger", () => {
  it("clears the matching handoff after the manage page mounts", async () => {
    expect(rememberCreatedEventNavigation("created-event")).toBe(true)

    render(<CreatedEventNavigationAcknowledger slug="created-event" />)

    await waitFor(() => {
      expect(getPendingCreatedEventNavigation()).toBeNull()
    })
  })
})
