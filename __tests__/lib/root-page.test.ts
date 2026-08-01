import { beforeEach, describe, expect, it, mock } from "bun:test"

const redirectMock = (globalThis as typeof globalThis & {
  __nextNavRedirect: ReturnType<typeof mock>
}).__nextNavRedirect

const { default: Home } = await import("@/app/page")

describe("root page", () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it("opens the hackathon creation flow", () => {
    Home()

    expect(redirectMock).toHaveBeenCalledWith("/create")
  })
})
