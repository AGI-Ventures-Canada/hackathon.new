import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import {
  act,
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react"
import {
  clearOrganizationCreationAttempt,
  completeOrganizationCreationAttempt,
  createPendingOrganizationCreation,
  saveOrganizationCreationAttempt,
} from "@/lib/auth/organization-creation"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

let organizationLockTail: Promise<unknown> = Promise.resolve()
const organizationLockRequest = mock(
  (
    _name: string,
    _options: { signal: AbortSignal },
    callback: () => Promise<unknown>,
  ) => {
    const result = organizationLockTail.then(callback)
    organizationLockTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  },
)

const mockReplace = g.__nextNavState.router.replace
const mockCreateOrganization = mock(() => Promise.resolve({ id: "org_new" }))
const mockSetOrgActive = mock(() => Promise.resolve())
type OrganizationMembershipPage = {
  data: { id: string; organization: { id: string; name: string } }[]
  total_count: number
}
const mockGetOrganizationMemberships = mock(
  (): Promise<OrganizationMembershipPage> =>
    Promise.resolve({
      data: [],
      total_count: 0,
    }),
)

let slugAvailable = true
let slugCheckOk = true
let rejectSlugCheck = false
let patchOk = true
let profileGetOk = true
let profileGetSlug: string | null = null
const fetchMock = mock((input: string | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString()
  if (url.includes("/slug-available")) {
    if (rejectSlugCheck) return Promise.reject(new Error("Network offline"))
    return Promise.resolve({
      ok: slugCheckOk,
      json: () => Promise.resolve({ available: slugAvailable }),
    } as Response)
  }
  if (url.includes("/org-profile")) {
    if (init?.method !== "PATCH") {
      return Promise.resolve({
        ok: profileGetOk,
        json: () => Promise.resolve({ slug: profileGetSlug }),
      } as Response)
    }
    return Promise.resolve({
      ok: patchOk,
      status: patchOk ? 200 : 409,
      json: () =>
        Promise.resolve(patchOk ? {} : { error: "Slug already taken" }),
    } as Response)
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response)
})
global.fetch = fetchMock as unknown as typeof fetch

function installBlockedCreateOrgStorage() {
  const originals = {
    globalLocal: globalThis.localStorage,
    globalSession: globalThis.sessionStorage,
    windowLocal: window.localStorage,
    windowSession: window.sessionStorage,
  }
  const blocked = {
    getItem: () => null,
    setItem: () => {
      throw new Error("storage blocked")
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } satisfies Storage
  for (const [target, key] of [
    [globalThis, "localStorage"],
    [globalThis, "sessionStorage"],
    [window, "localStorage"],
    [window, "sessionStorage"],
  ] as const) {
    Object.defineProperty(target, key, { configurable: true, value: blocked })
  }
  return () => {
    for (const [target, key, value] of [
      [globalThis, "localStorage", originals.globalLocal],
      [globalThis, "sessionStorage", originals.globalSession],
      [window, "localStorage", originals.windowLocal],
      [window, "sessionStorage", originals.windowSession],
    ] as const) {
      Object.defineProperty(target, key, { configurable: true, value })
    }
  }
}

const { CreateOrgForm } = await import("@/components/auth/create-org-form")

beforeEach(() => {
  organizationLockTail = Promise.resolve()
  organizationLockRequest.mockClear()
  Object.defineProperty(g.navigator, "locks", {
    configurable: true,
    value: { request: organizationLockRequest },
  })
  g.__clerkState.isLoaded = true
  g.__clerkState.createOrganization = mockCreateOrganization
  g.__clerkState.setOrgActive = mockSetOrgActive
  g.__clerkState.user.organizationMemberships = []
  g.__clerkState.user.getOrganizationMemberships =
    mockGetOrganizationMemberships
  slugAvailable = true
  slugCheckOk = true
  rejectSlugCheck = false
  patchOk = true
  profileGetOk = true
  profileGetSlug = null
  clearOrganizationCreationAttempt("user_123")
  fetchMock.mockClear()
  mockReplace.mockClear()
  mockCreateOrganization.mockClear()
  mockSetOrgActive.mockReset()
  mockSetOrgActive.mockImplementation(() => Promise.resolve())
  mockGetOrganizationMemberships.mockReset()
  mockGetOrganizationMemberships.mockImplementation(() =>
    Promise.resolve({
      data: [],
      total_count: 0,
    }),
  )
})

afterEach(() => {
  delete g.navigator.locks
  clearOrganizationCreationAttempt("user_123")
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
  it("shows the loading state until Clerk is ready", () => {
    g.__clerkState.isLoaded = false

    const { container } = render(<CreateOrgForm redirectUrl="/home" />)

    expect(container.querySelector(".animate-spin")).not.toBeNull()
    expect(screen.queryByLabelText("Organization name")).toBeNull()
  })

  it("keeps the newest slug result when an older request finishes last", async () => {
    let resolveFirst:
      | ((response: Pick<Response, "ok" | "json">) => void)
      | undefined
    let resolveSecond:
      | ((response: Pick<Response, "ok" | "json">) => void)
      | undefined
    const first = new Promise<Pick<Response, "ok" | "json">>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<Pick<Response, "ok" | "json">>((resolve) => {
      resolveSecond = resolve
    })
    const raceFetch = mock((input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("slug=first-org")) return first as Promise<Response>
      if (url.includes("slug=second-org")) return second as Promise<Response>
      return fetchMock(input, init)
    })
    global.fetch = raceFetch as unknown as typeof fetch

    try {
      render(<CreateOrgForm redirectUrl="/home" />)
      const nameInput = screen.getByLabelText("Organization name")
      fireEvent.change(nameInput, { target: { value: "First Org" } })
      await waitFor(() => {
        expect(
          raceFetch.mock.calls.some(([url]) =>
            String(url).includes("slug=first-org"),
          ),
        ).toBe(true)
      })

      fireEvent.change(nameInput, { target: { value: "Second Org" } })
      await waitFor(() => {
        expect(
          raceFetch.mock.calls.some(([url]) =>
            String(url).includes("slug=second-org"),
          ),
        ).toBe(true)
      })
      await act(async () => {
        resolveSecond?.({
          ok: true,
          json: () => Promise.resolve({ available: false }),
        })
      })
      expect(await screen.findByText("This slug is already taken")).toBeDefined()

      await act(async () => {
        resolveFirst?.({
          ok: true,
          json: () => Promise.resolve({ available: true }),
        })
        await Promise.resolve()
      })

      expect(screen.getByText("This slug is already taken")).toBeDefined()
      expect(
        (screen.getByRole("button", {
          name: "Create organization",
        }) as HTMLButtonElement).disabled,
      ).toBe(true)
    } finally {
      global.fetch = fetchMock as unknown as typeof fetch
    }
  })

  it("fails closed when slug availability cannot be checked", async () => {
    slugCheckOk = false
    render(<CreateOrgForm redirectUrl="/home" />)

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme Inc" },
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      expect(
        (screen.getByRole("button", {
          name: "Create organization",
        }) as HTMLButtonElement).disabled,
      ).toBe(true)
    })
    expect(screen.queryByText("This slug is available")).toBeNull()
  })

  it("fails closed when the slug check rejects", async () => {
    rejectSlugCheck = true
    render(<CreateOrgForm redirectUrl="/home" />)

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme Inc" },
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      expect(
        (screen.getByRole("button", {
          name: "Create organization",
        }) as HTMLButtonElement).disabled,
      ).toBe(true)
    })
  })

  it("normalizes a manually edited slug and rejects an invalid result", async () => {
    render(<CreateOrgForm redirectUrl="/home" />)
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Acme Inc" },
    })
    fireEvent.change(screen.getByLabelText("URL slug"), {
      target: { value: "--BAD slug!!" },
    })

    expect((screen.getByLabelText("URL slug") as HTMLInputElement).value).toBe(
      "--badslug",
    )
    expect(
      await screen.findByText(/slugs can only contain lowercase letters/i),
    ).toBeDefined()
    expect(
      (screen.getByRole("button", {
        name: "Create organization",
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
  it("ignores a second submit while organization creation is in flight", async () => {
    let finishCreation: ((organization: { id: string }) => void) | undefined
    mockCreateOrganization.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreation = resolve
        }),
    )
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    const form = screen.getByLabelText("Organization name").closest("form")!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    })
    fireEvent.submit(form)
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)

    finishCreation?.({ id: "org_new" })
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/home")
    })
  })

  it("creates organization, patches slug, and redirects on submit", async () => {
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledWith({
        name: "Acme Inc",
        slug: "acme-inc",
      })
      expect(mockSetOrgActive).toHaveBeenCalledWith({
        organization: "org_new",
      })
    })

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/org-profile"),
      )
      expect(patchCall).toBeDefined()
    })
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/home")
    })
  })

  it("serializes two tabs and reuses the first completed organization", async () => {
    const firstTab = render(<CreateOrgForm redirectUrl="/create?review=true" />)
    const secondTab = render(
      <CreateOrgForm redirectUrl="/create?review=true" />,
    )
    const nameInputs = [firstTab, secondTab].map(
      ({ container }) =>
        container.querySelector<HTMLInputElement>('input[name="org-name"]')!,
    )
    for (const input of nameInputs) {
      fireEvent.change(input, { target: { value: "Acme Inc" } })
    }
    await waitFor(() => {
      for (const { container } of [firstTab, secondTab]) {
        expect(container.textContent).toContain("This slug is available")
      }
    })

    const forms = nameInputs.map((input) => input.closest("form")!)
    fireEvent.submit(forms[0])
    fireEvent.submit(forms[1])

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledTimes(2)
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    expect(mockSetOrgActive).toHaveBeenCalledTimes(2)
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/org-profile") && init?.method === "PATCH",
      ),
    ).toHaveLength(1)
  })

  it("fails closed before Clerk creation when Web Locks are unavailable", async () => {
    delete g.navigator.locks
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(
        screen.getByText(/browser can't safely create an organization/i),
      ).toBeDefined()
    })
    expect(mockCreateOrganization).not.toHaveBeenCalled()
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
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("shows the safe fallback for a non-Error Clerk failure", async () => {
    mockCreateOrganization.mockRejectedValueOnce("connection lost")
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    expect(
      await screen.findByText("Failed to create organization"),
    ).toBeDefined()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("requires durable storage again before starting the profile write", async () => {
    let restore: (() => void) | null = null
    mockSetOrgActive.mockImplementationOnce(() => {
      restore = installBlockedCreateOrgStorage()
      return Promise.resolve()
    })
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    try {
      fireEvent.click(
        screen.getByRole("button", { name: "Create organization" }),
      )

      expect(
        await screen.findByText(/safely finish your organization/i),
      ).toBeDefined()
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
      ).toBe(false)
      expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    } finally {
      restore?.()
    }
  })

  it("keeps the setup open if profile success cannot be recorded", async () => {
    let restore: (() => void) | null = null
    const completingFetch = mock((input: string | URL, init?: RequestInit) => {
      const response = fetchMock(input, init)
      if (
        String(input).includes("/org-profile") &&
        init?.method === "PATCH"
      ) {
        restore = installBlockedCreateOrgStorage()
      }
      return response
    })
    global.fetch = completingFetch as unknown as typeof fetch
    render(<CreateOrgForm redirectUrl="/home" />)

    try {
      await fillName("Acme Inc")
      fireEvent.click(
        screen.getByRole("button", { name: "Create organization" }),
      )

      expect(
        await screen.findByText(/couldn't safely finish your organization/i),
      ).toBeDefined()
      expect(mockReplace).not.toHaveBeenCalled()
      expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    } finally {
      restore?.()
      global.fetch = fetchMock as unknown as typeof fetch
    }
  })

  it("recovers an organization created before Clerk lost its response", async () => {
    mockCreateOrganization.mockImplementationOnce(() =>
      Promise.reject(new Error("Connection dropped")),
    )
    mockGetOrganizationMemberships
      .mockImplementationOnce(() =>
        Promise.resolve({ data: [], total_count: 0 }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          data: [
            {
              id: "membership_new",
              organization: {
                id: "org_recovered",
                name: "Acme Inc",
                slug: "acme-inc",
              },
            },
          ],
          total_count: 1,
        }),
      )
    render(<CreateOrgForm redirectUrl="/create?review=true" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(mockSetOrgActive).toHaveBeenCalledWith({
        organization: "org_recovered",
      })
      expect(mockReplace).toHaveBeenCalledWith("/create?review=true")
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
  })

  it("recovers an exact-slug membership already visible on another device", async () => {
    mockCreateOrganization.mockImplementationOnce(() =>
      Promise.reject(new Error("Organization slug is already taken")),
    )
    mockGetOrganizationMemberships.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_existing",
            organization: {
              id: "org_existing",
              name: "Acme Inc",
              slug: "acme-inc",
            },
          },
        ],
        total_count: 1,
      }),
    )
    render(<CreateOrgForm redirectUrl="/create?review=true" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(mockSetOrgActive).toHaveBeenCalledWith({
        organization: "org_existing",
      })
      expect(mockReplace).toHaveBeenCalledWith("/create?review=true")
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
  })

  it("shows a clear conflict when the Clerk slug belongs to another org", async () => {
    mockCreateOrganization.mockImplementationOnce(() =>
      Promise.reject(new Error("Organization slug is already taken")),
    )
    mockGetOrganizationMemberships.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_other",
            organization: {
              id: "org_other",
              name: "Other Org",
              slug: "acme-inc",
            },
          },
        ],
        total_count: 1,
      }),
    )
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(
        screen.getByText(
          "This address is already used by another organization.",
        ),
      ).toBeDefined()
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("recovers a pending organization after a reload without creating another", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(
      saveOrganizationCreationAttempt("user_123", pending, "acme-inc"),
    ).toBe("saved")
    mockGetOrganizationMemberships.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_new",
            organization: {
              id: "org_recovered",
              name: "Acme Inc",
              slug: "acme-inc",
            },
          },
        ],
        total_count: 1,
      }),
    )

    render(<CreateOrgForm redirectUrl="/create?review=true" />)
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Organization name") as HTMLInputElement).value,
      ).toBe("Acme Inc")
      expect(screen.getByText("This slug is available")).toBeDefined()
    })
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(mockSetOrgActive).toHaveBeenCalledWith({
        organization: "org_recovered",
      })
      expect(mockReplace).toHaveBeenCalledWith("/create?review=true")
    })
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("recognizes a committed profile after its PATCH response was lost", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(
      saveOrganizationCreationAttempt("user_123", pending, "acme-inc", true),
    ).toBe("saved")
    slugAvailable = false
    profileGetSlug = "acme-inc"
    mockGetOrganizationMemberships.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_new",
            organization: {
              id: "org_recovered",
              name: "Acme Inc",
              slug: "acme-inc",
            },
          },
        ],
        total_count: 1,
      }),
    )

    render(<CreateOrgForm redirectUrl="/create?review=true" />)
    const button = (await waitFor(() =>
      screen.getByRole("button", { name: "Create organization" }),
    )) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false))
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/create?review=true")
    })
    expect(mockCreateOrganization).not.toHaveBeenCalled()
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false)
  })

  it("surfaces server slug patch error in the UI", async () => {
    patchOk = false
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    await waitFor(() => {
      expect(screen.getByText("Slug already taken")).toBeDefined()
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("does not create a duplicate organization on retry after slug patch fails", async () => {
    patchOk = false
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))
    await waitFor(() => {
      expect(screen.getByText("Slug already taken")).toBeDefined()
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    expect(
      (screen.getByLabelText("Organization name") as HTMLInputElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByLabelText("URL slug") as HTMLInputElement).disabled,
    ).toBe(false)

    patchOk = true
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/home")
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    expect(mockSetOrgActive).toHaveBeenCalledTimes(2)
  })

  it("reactivates the same organization when the first activation fails", async () => {
    mockSetOrgActive.mockImplementationOnce(() =>
      Promise.reject(new Error("Session refresh failed")),
    )
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))
    await waitFor(() => {
      expect(screen.getByText("Session refresh failed")).toBeDefined()
    })

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/home")
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    expect(mockSetOrgActive).toHaveBeenCalledTimes(2)
  })

  it("does not reuse a completed organization created for different form values", async () => {
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")
    const other = createPendingOrganizationCreation("Other Org", [])
    expect(saveOrganizationCreationAttempt(
      "user_123",
      other,
      "other-org",
    )).toBe("saved")
    expect(completeOrganizationCreationAttempt(
      "user_123",
      other,
      "other-org",
      "org_other",
    )).toBe("saved")

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    expect(await screen.findByText(
      /finish the organization setup already open/i,
    )).toBeDefined()
    expect(mockCreateOrganization).not.toHaveBeenCalled()
    expect(mockSetOrgActive).not.toHaveBeenCalled()
  })

  it("fails closed when another tab saves a different attempt during membership snapshot", async () => {
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")
    mockGetOrganizationMemberships.mockImplementationOnce(() => {
      const other = createPendingOrganizationCreation("Other Org", [])
      expect(saveOrganizationCreationAttempt(
        "user_123",
        other,
        "other-org",
      )).toBe("saved")
      return Promise.resolve({ data: [], total_count: 0 })
    })

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

    expect(await screen.findByText(
      /finish the organization setup already open/i,
    )).toBeDefined()
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("requires browser storage before creating the Clerk organization", async () => {
    render(<CreateOrgForm redirectUrl="/home" />)
    await fillName("Acme Inc")
    const originalStorages = {
      globalLocal: globalThis.localStorage,
      globalSession: globalThis.sessionStorage,
      windowLocal: window.localStorage,
      windowSession: window.sessionStorage,
    }
    const blockedStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage blocked")
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage
    for (const [target, key] of [
      [globalThis, "localStorage"],
      [globalThis, "sessionStorage"],
      [window, "localStorage"],
      [window, "sessionStorage"],
    ] as const) {
      Object.defineProperty(target, key, {
        configurable: true,
        value: blockedStorage,
      })
    }

    try {
      fireEvent.click(screen.getByRole("button", { name: "Create organization" }))

      expect(await screen.findByText(/turn on browser storage/i)).toBeDefined()
      expect(mockCreateOrganization).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalStorages.globalLocal,
      })
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: originalStorages.globalSession,
      })
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalStorages.windowLocal,
      })
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: originalStorages.windowSession,
      })
    }
  })

  it("keeps a pending profile retry open when the profile cannot be read", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(saveOrganizationCreationAttempt(
      "user_123",
      pending,
      "acme-inc",
      true,
    )).toBe("saved")
    profileGetOk = false
    mockGetOrganizationMemberships.mockImplementation(() => Promise.resolve({
      data: [{
        id: "membership_new",
        organization: {
          id: "org_recovered",
          name: "Acme Inc",
          slug: "acme-inc",
        },
      }],
      total_count: 1,
    }))

    render(<CreateOrgForm redirectUrl="/create?review=true" />)
    const button = await screen.findByRole("button", {
      name: "Create organization",
    })
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)

    expect(await screen.findByText(/couldn't check the organization profile/i)).toBeDefined()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("keeps a pending profile retry open when its slug can no longer be confirmed", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(saveOrganizationCreationAttempt(
      "user_123",
      pending,
      "acme-inc",
      true,
    )).toBe("saved")
    profileGetSlug = "different-slug"
    slugAvailable = false
    mockGetOrganizationMemberships.mockImplementation(() => Promise.resolve({
      data: [{
        id: "membership_new",
        organization: {
          id: "org_recovered",
          name: "Acme Inc",
          slug: "acme-inc",
        },
      }],
      total_count: 1,
    }))

    render(<CreateOrgForm redirectUrl="/create?review=true" />)
    const button = await screen.findByRole("button", {
      name: "Create organization",
    })
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)

    expect(await screen.findByText(/couldn't confirm the saved slug yet/i)).toBeDefined()
    expect(mockReplace).not.toHaveBeenCalled()
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
    expect(mockReplace).toHaveBeenCalledWith("/home")
  })
})
