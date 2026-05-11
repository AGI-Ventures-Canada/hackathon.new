import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

const mockPush = g.__nextNavState.router.push
const mockCreateOrganization = mock(() => Promise.resolve({ id: "org_new" }))
const mockSetOrgActive = mock(() => Promise.resolve())

let slugAvailable = true
let patchOk = true
const fetchMock = mock((input: string | URL) => {
  const url = typeof input === "string" ? input : input.toString()
  if (url.includes("/slug-available")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ available: slugAvailable }),
    } as Response)
  }
  if (url.includes("/org-profile")) {
    return Promise.resolve({
      ok: patchOk,
      json: () =>
        Promise.resolve(patchOk ? {} : { error: "Slug already taken" }),
    } as Response)
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
})
global.fetch = fetchMock as unknown as typeof fetch

const { CreateOrgForm } = await import("@/components/auth/create-org-form")

beforeEach(() => {
  g.__clerkState.isLoaded = true
  g.__clerkState.createOrganization = mockCreateOrganization
  g.__clerkState.setOrgActive = mockSetOrgActive
  slugAvailable = true
  patchOk = true
  fetchMock.mockClear()
  mockPush.mockClear()
  mockCreateOrganization.mockClear()
  mockSetOrgActive.mockClear()
})

afterEach(() => {
  cleanup()
})

async function fillName(value: string) {
  fireEvent.change(screen.getByLabelText("Organization name"), {
    target: { value },
  })
  await waitFor(() => {
    expect(screen.getByText("This slug is available")).toBeDefined()
  })
}

describe("CreateOrgForm", () => {
  it("creates organization, patches slug, and redirects on submit", async () => {
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledWith({ name: "Acme Inc" })
      expect(mockSetOrgActive).toHaveBeenCalledWith({ organization: "org_new" })
    })

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/org-profile"),
      )
      expect(patchCall).toBeDefined()
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/home")
    })
  })

  it("disables submit when slug is taken", async () => {
    slugAvailable = false
    render(<CreateOrgForm redirectUrl="/home" />)

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme Inc" },
    })

    await waitFor(() => {
      expect(screen.getByText("This slug is already taken")).toBeDefined()
    })

    const button = screen.getByRole("button", {
      name: "Create organization",
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("surfaces Clerk createOrganization error in the UI", async () => {
    mockCreateOrganization.mockImplementationOnce(() =>
      Promise.reject(new Error("Org name already in use")),
    )
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(screen.getByText("Org name already in use")).toBeDefined()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("surfaces server slug patch error in the UI", async () => {
    patchOk = false
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(screen.getByText("Slug already taken")).toBeDefined()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("renders Skip button only when skipUrl is provided", () => {
    const { rerender } = render(<CreateOrgForm redirectUrl="/home" />)
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull()

    rerender(<CreateOrgForm redirectUrl="/home" skipUrl="/home" />)
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeDefined()
  })

  it("navigates to skipUrl when Skip is clicked", () => {
    render(<CreateOrgForm redirectUrl="/home" skipUrl="/home" />)
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }))
    expect(mockPush).toHaveBeenCalledWith("/home")
  })
})
