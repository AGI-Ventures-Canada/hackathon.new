import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import {
  getRouter,
  resetComponentMocks,
  setClerkMemberships,
  setClerkSetActive,
  setCreateOrganizationDialog,
  setRouter,
} from "../lib/component-mocks"
import { clerkMock, clerkState } from "../lib/clerk-mock"

mock.module("@clerk/nextjs", () => clerkMock)

mock.module("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    return <span aria-label={props.alt as string} />
  },
}))

const { CliAuthOrgGate } = await import("@/components/cli-auth/cli-auth-org-gate")

const mockRefresh = mock(() => {})

beforeEach(() => {
  resetComponentMocks()
  mockRefresh.mockClear()
  clerkState.setActive.mockImplementation(() => Promise.resolve())
  setRouter({ refresh: mockRefresh })
  setClerkMemberships([
    { role: "org:admin", organization: { id: "org_1", name: "Alpha Org", imageUrl: null } },
    { role: "org:admin", organization: { id: "org_2", name: "Beta Org", imageUrl: "https://example.com/beta.png" } },
  ])
})

afterEach(() => {
  cleanup()
})

describe("CliAuthOrgGate", () => {
  it("lists organizations and creates a new one", () => {
    render(<CliAuthOrgGate />)

    expect(screen.getByText("Pick an organization")).toBeDefined()
    expect(screen.getByText("Alpha Org")).toBeDefined()
    expect(screen.getByText("Beta Org")).toBeDefined()
    expect(screen.getByText("Create organization")).toBeDefined()
  })

  it("switches to a selected organization and refreshes the page", async () => {
    render(<CliAuthOrgGate />)

    fireEvent.click(screen.getByText("Alpha Org"))

    await waitFor(() => {
      expect(clerkState.setActive).toHaveBeenCalledWith({ organization: "org_1" })
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it("shows an error if switching organizations fails", async () => {
    setClerkSetActive(async () => {
      throw new Error("failed")
    })

    render(<CliAuthOrgGate />)

    fireEvent.click(screen.getByText("Alpha Org"))

    await waitFor(() => {
      expect(screen.getByText("We couldn't switch organizations. Try again.")).toBeDefined()
    })
  })

  it("refreshes after creating an organization", async () => {
    setCreateOrganizationDialog(({ open, onSuccess }: { open: boolean; onSuccess?: () => void }) =>
      open ? (
        <div data-testid="create-org-dialog">
          <button type="button" onClick={() => onSuccess?.()}>
            Finish
          </button>
        </div>
      ) : null
    )

    render(<CliAuthOrgGate />)

    fireEvent.click(screen.getByText("Create organization"))
    fireEvent.click(screen.getByText("Finish"))

    expect(getRouter().refresh).toHaveBeenCalled()
  })
})
