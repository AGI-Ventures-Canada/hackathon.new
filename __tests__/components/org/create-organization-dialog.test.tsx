import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import {
  cleanup,
  fireEvent,
  render,
  screen,
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

const mockPush = g.__nextNavState.router.push
const mockSetActive = mock((_params?: { organization: string | null }) =>
  Promise.resolve(),
)
const mockDestroy = mock(() => Promise.resolve())
const createdOrganization = { id: "org_new", destroy: mockDestroy }
const mockCreateOrganization = mock(() => Promise.resolve(createdOrganization))
type OrganizationMembershipPage = {
  data: {
    id: string
    organization: typeof createdOrganization & { name: string }
  }[]
  total_count: number
}
const mockGetOrganizationMemberships = mock(
  (): Promise<OrganizationMembershipPage> =>
    Promise.resolve({
      data: [],
      total_count: 0,
    }),
)

let profileAttempts = 0
let rejectProfileOnce = false
let profileOk = true
let profileStatus = 409
let profileGetSlug: string | null = null
let profileGetOk = true
let slugAvailable = true
let slugCheckOk = true
let rejectSlugCheck = false

const fetchMock = mock((input: string | URL, init?: RequestInit) => {
  const url = String(input)
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
    profileAttempts += 1
    if (rejectProfileOnce) {
      rejectProfileOnce = false
      return Promise.reject(new Error("Network went away"))
    }
    return Promise.resolve({
      ok: profileOk,
      status: profileOk ? 200 : profileStatus,
      json: () =>
        Promise.resolve(profileOk ? {} : { error: "Slug save failed" }),
    } as Response)
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response)
})

global.fetch = fetchMock as unknown as typeof fetch

function installBlockedOrganizationStorage() {
  const originals = {
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
    removeItem: () => {
      throw new Error("storage blocked")
    },
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
    Object.defineProperty(target, key, {
      configurable: true,
      value: blockedStorage,
    })
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

const { CreateOrganizationDialog } =
  await import("@/components/create-organization-dialog")

beforeEach(() => {
  organizationLockTail = Promise.resolve()
  g.__clerkState.isSignedIn = true
  organizationLockRequest.mockClear()
  Object.defineProperty(g.navigator, "locks", {
    configurable: true,
    value: { request: organizationLockRequest },
  })
  g.__clerkState.createOrganization = mockCreateOrganization
  g.__clerkState.setOrgActive = mockSetActive
  g.__clerkState.user.organizationMemberships = []
  g.__clerkState.user.getOrganizationMemberships =
    mockGetOrganizationMemberships
  mockPush.mockClear()
  mockSetActive.mockReset()
  mockSetActive.mockImplementation(() => Promise.resolve())
  mockDestroy.mockClear()
  mockCreateOrganization.mockClear()
  mockGetOrganizationMemberships.mockReset()
  mockGetOrganizationMemberships.mockImplementation(() =>
    Promise.resolve({
      data: [],
      total_count: 0,
    }),
  )
  fetchMock.mockClear()
  clearOrganizationCreationAttempt("user_123")
  profileAttempts = 0
  rejectProfileOnce = false
  profileOk = true
  profileStatus = 409
  profileGetSlug = null
  profileGetOk = true
  slugAvailable = true
  slugCheckOk = true
  rejectSlugCheck = false
})

afterEach(() => {
  delete g.navigator.locks
  clearOrganizationCreationAttempt("user_123")
  cleanup()
  g.__clerkState.createOrganization = undefined
  g.__clerkState.setOrgActive = undefined
})

async function fillForm() {
  fireEvent.change(screen.getByLabelText("Organization Name"), {
    target: { value: "Acme Inc" },
  })
  await waitFor(() => {
    expect(screen.getByText("This slug is available")).toBeDefined()
  })
}

describe("CreateOrganizationDialog", () => {
  it("fails closed when a slug check returns an error response", async () => {
    slugCheckOk = false
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />)

    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Acme Inc" },
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText("This slug is available")).toBeNull()
    expect(
      (screen.getByRole("button", {
        name: "Create Organization",
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it("fails closed when a slug check rejects", async () => {
    rejectSlugCheck = true
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />)

    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Acme Inc" },
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText("This slug is available")).toBeNull()
    expect(
      (screen.getByRole("button", {
        name: "Create Organization",
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it("aborts an older slug request when the slug changes", async () => {
    let firstSignal: AbortSignal | undefined
    let rejectFirst: ((reason: unknown) => void) | undefined
    const firstRequest = new Promise<Response>((_resolve, reject) => {
      rejectFirst = reject
    })
    const raceFetch = mock((input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("slug=first-org")) {
        firstSignal = init?.signal ?? undefined
        firstSignal?.addEventListener(
          "abort",
          () => rejectFirst?.(new DOMException("Aborted", "AbortError")),
          { once: true },
        )
        return firstRequest
      }
      if (url.includes("slug=secondorg")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ available: false }),
        } as Response)
      }
      return fetchMock(input, init)
    })
    global.fetch = raceFetch as unknown as typeof fetch

    try {
      render(<CreateOrganizationDialog open onOpenChange={() => {}} />)
      const nameInput = screen.getByLabelText("Organization Name")
      fireEvent.change(nameInput, { target: { value: "First Org" } })
      await waitFor(() => expect(firstSignal).toBeDefined())

      fireEvent.change(screen.getByLabelText("URL Slug"), {
        target: { value: "Second Org" },
      })

      expect(await screen.findByText("This slug is already taken")).toBeDefined()
      expect(firstSignal?.aborted).toBe(true)
    } finally {
      global.fetch = fetchMock as unknown as typeof fetch
    }
  })

  it("normalizes a manual slug and supports Ctrl+Enter submission", async () => {
    const onSuccess = mock(() => Promise.resolve())
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    )
    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Acme Inc" },
    })
    fireEvent.change(screen.getByLabelText("URL Slug"), {
      target: { value: "Acme.Custom Slug!!" },
    })

    const slugInput = screen.getByLabelText("URL Slug") as HTMLInputElement
    expect(slugInput.value).toBe("acmecustomslug")
    expect(await screen.findByText("This slug is available")).toBeDefined()
    fireEvent.keyDown(slugInput, { key: "Enter", ctrlKey: true })

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(mockCreateOrganization).toHaveBeenCalledWith({
      name: "Acme Inc",
      slug: "acmecustomslug",
    })
  })

  it("shows invalid status for a malformed manual slug", async () => {
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText("Organization Name"), {
      target: { value: "Acme Inc" },
    })
    fireEvent.change(screen.getByLabelText("URL Slug"), {
      target: { value: "--" },
    })

    expect(
      await screen.findByText(/at least 3 characters/i),
    ).toBeDefined()
    expect(
      (screen.getByRole("button", {
        name: "Create Organization",
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it("fails closed if another tab saves a different attempt during snapshot", async () => {
    mockGetOrganizationMemberships.mockImplementationOnce(() => {
      const other = createPendingOrganizationCreation("Other Org", [])
      expect(
        saveOrganizationCreationAttempt("user_123", other, "other-org"),
      ).toBe("saved")
      return Promise.resolve({ data: [], total_count: 0 })
    })
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />)
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    expect(
      await screen.findByText(/finish the organization setup already open/i),
    ).toBeDefined()
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("requires durable storage before creating the Clerk organization", async () => {
    let restore: (() => void) | null = null
    mockGetOrganizationMemberships.mockImplementationOnce(() => {
      restore = installBlockedOrganizationStorage()
      return Promise.resolve({ data: [], total_count: 0 })
    })
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />)
    await fillForm()

    try {
      fireEvent.click(
        screen.getByRole("button", { name: "Create Organization" }),
      )

      expect(await screen.findByText(/turn on browser storage/i)).toBeDefined()
      expect(mockCreateOrganization).not.toHaveBeenCalled()
    } finally {
      restore?.()
    }
  })
  it("ignores a second submit while organization creation is in flight", async () => {
    let finishCreation:
      | ((organization: typeof createdOrganization) => void)
      | undefined
    mockCreateOrganization.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreation = resolve
        }),
    )
    const onSuccess = mock(() => Promise.resolve())
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    )
    await fillForm()

    const form = screen.getByLabelText("Organization Name").closest("form")!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
      expect(mockCreateOrganization).toHaveBeenCalledWith({
        name: "Acme Inc",
        slug: "acme-inc",
      })
    })
    fireEvent.submit(form)
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)

    finishCreation?.(createdOrganization)
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it("reuses the same organization after a profile network failure", async () => {
    rejectProfileOnce = true
    const onSuccess = mock(() => Promise.resolve())
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    )
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(screen.getByText("Network went away")).toBeDefined()
    })
    expect(
      (screen.getByLabelText("Organization Name") as HTMLInputElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByLabelText("URL Slug") as HTMLInputElement).disabled,
    ).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    expect(mockSetActive).toHaveBeenCalledTimes(2)
    expect(profileAttempts).toBe(2)
    expect(mockDestroy).not.toHaveBeenCalled()
  })

  it("recovers an organization after an ambiguous Clerk failure", async () => {
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
                ...createdOrganization,
                name: "Acme Inc",
                slug: "acme-inc",
              },
            },
          ],
          total_count: 1,
        }),
      )
    const onSuccess = mock(() => Promise.resolve())
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    )
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledWith({ organization: "org_new" })
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
  })

  it("recovers a stored organization attempt after the dialog remounts", async () => {
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
              ...createdOrganization,
              name: "Acme Inc",
              slug: "acme-inc",
            },
          },
        ],
        total_count: 1,
      }),
    )
    const onSuccess = mock(() => Promise.resolve())
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    )

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Organization Name") as HTMLInputElement).value,
      ).toBe("Acme Inc")
      expect(screen.getByText("This slug is available")).toBeDefined()
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("retries the completion callback without creating or patching twice", async () => {
    const onSuccess = mock(() => Promise.resolve())
    onSuccess.mockImplementationOnce(() =>
      Promise.reject(new Error("Token refresh failed")),
    )
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    )
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(screen.getByText("Token refresh failed")).toBeDefined()
    })
    expect(
      (screen.getByLabelText("Organization Name") as HTMLInputElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByLabelText("URL Slug") as HTMLInputElement).disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(2)
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    expect(profileAttempts).toBe(1)
    expect(mockDestroy).not.toHaveBeenCalled()
  })

  it("removes an unfinished organization when the user cancels", async () => {
    profileOk = false
    const onOpenChange = mock(() => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(screen.getByText("Slug save failed")).toBeDefined()
    })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(mockDestroy).toHaveBeenCalledTimes(1)
      expect(mockSetActive).toHaveBeenLastCalledWith({ organization: null })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it("closes after removal even if clearing the deleted active org fails", async () => {
    profileOk = false
    mockSetActive.mockImplementation(
      (params?: { organization: string | null }) =>
        params?.organization === null
          ? Promise.reject(new Error("Session already changed"))
          : Promise.resolve(),
    )
    const onOpenChange = mock(() => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(screen.getByText("Slug save failed")).toBeDefined()
    })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(mockDestroy).toHaveBeenCalledTimes(1)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it("keeps an organization when a lost PATCH response may have committed", async () => {
    rejectProfileOnce = true
    profileGetSlug = "acme-inc"
    const onOpenChange = mock(() => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(screen.getByText("Network went away")).toBeDefined()
    })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(mockDestroy).not.toHaveBeenCalled()
  })

  it("keeps an organization when an ambiguous PATCH cannot be confirmed", async () => {
    profileOk = false
    profileStatus = 503
    const onOpenChange = mock(() => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    await waitFor(() => {
      expect(screen.getByText("Slug save failed")).toBeDefined()
    })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(screen.getByText(/so we kept the organization/i)).toBeDefined()
    })
    expect(mockDestroy).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("navigates home and closes after a normal create without a callback", async () => {
    const onOpenChange = mock((_open: boolean) => {})
    render(
      <CreateOrganizationDialog open onOpenChange={onOpenChange} />,
    )
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/home")
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
  })

  it("closes a fresh dialog without touching Clerk", async () => {
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(mockCreateOrganization).not.toHaveBeenCalled()
    expect(mockDestroy).not.toHaveBeenCalled()
  })

  it("stops when the slug is taken between the first check and submit", async () => {
    render(
      <CreateOrganizationDialog open onOpenChange={() => {}} />,
    )
    await fillForm()
    slugAvailable = false

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    expect(
      await screen.findByText("This slug was just taken. Pick another one."),
    ).toBeDefined()
    expect(mockCreateOrganization).not.toHaveBeenCalled()
    expect(
      (screen.getByRole("button", {
        name: "Create Organization",
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it("finishes from the committed profile after a lost PATCH response", async () => {
    rejectProfileOnce = true
    profileGetSlug = "acme-inc"
    const onSuccess = mock(() => Promise.resolve())
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    )
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    expect(await screen.findByText("Network went away")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
    expect(profileAttempts).toBe(1)
  })

  it("shows a retryable error when the committed profile cannot be checked", async () => {
    rejectProfileOnce = true
    profileGetOk = false
    render(
      <CreateOrganizationDialog open onOpenChange={() => {}} />,
    )
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    expect(await screen.findByText("Network went away")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    expect(
      await screen.findByText(/couldn't check the organization profile/i),
    ).toBeDefined()
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1)
  })

  it("reuses a short completed marker from another tab", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(
      saveOrganizationCreationAttempt("user_123", pending, "acme-inc"),
    ).toBe("saved")
    expect(
      completeOrganizationCreationAttempt(
        "user_123",
        pending,
        "acme-inc",
        "org_existing",
      ),
    ).toBe("saved")
    const onSuccess = mock(() => Promise.resolve())
    const onOpenChange = mock((_open: boolean) => {})
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    )

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Organization Name") as HTMLInputElement).value,
      ).toBe("Acme Inc")
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(mockSetActive).toHaveBeenCalledWith({
      organization: "org_existing",
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("keeps the dialog open when an unfinished organization cannot be removed", async () => {
    profileOk = false
    mockDestroy.mockImplementationOnce(() =>
      Promise.reject(new Error("Clerk removal failed")),
    )
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await fillForm()

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    expect(await screen.findByText("Slug save failed")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(
      await screen.findByText(/couldn't remove the unfinished organization/i),
    ).toBeDefined()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("does not reuse another tab's completed organization for different form values", async () => {
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />)
    await fillForm()
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

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    expect(await screen.findByText(
      /finish the organization setup already open/i,
    )).toBeDefined()
    expect(mockSetActive).not.toHaveBeenCalled()
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("cancels a recovered unfinished organization without creating it again", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(saveOrganizationCreationAttempt(
      "user_123",
      pending,
      "acme-inc",
    )).toBe("saved")
    mockGetOrganizationMemberships.mockImplementation(() => Promise.resolve({
      data: [{
        id: "membership_new",
        organization: {
          ...createdOrganization,
          name: "Acme Inc",
          slug: "acme-inc",
        },
      }],
      total_count: 1,
    }))
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Organization Name") as HTMLInputElement).value,
      ).toBe("Acme Inc")
    })

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(mockDestroy).toHaveBeenCalledTimes(1)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("closes a completed attempt without deleting its organization", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(saveOrganizationCreationAttempt(
      "user_123",
      pending,
      "acme-inc",
    )).toBe("saved")
    expect(completeOrganizationCreationAttempt(
      "user_123",
      pending,
      "acme-inc",
      "org_existing",
    )).toBe("saved")
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Organization Name") as HTMLInputElement).value,
      ).toBe("Acme Inc")
    })

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mockDestroy).not.toHaveBeenCalled()
    expect(mockSetActive).not.toHaveBeenCalled()
  })

  it("keeps a pending profile retry open when the saved slug is not confirmed", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(saveOrganizationCreationAttempt(
      "user_123",
      pending,
      "acme-inc",
      true,
    )).toBe("saved")
    profileGetSlug = "other-slug"
    slugAvailable = false
    mockGetOrganizationMemberships.mockImplementation(() => Promise.resolve({
      data: [{
        id: "membership_new",
        organization: {
          ...createdOrganization,
          name: "Acme Inc",
          slug: "acme-inc",
        },
      }],
      total_count: 1,
    }))
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    const button = await screen.findByRole("button", {
      name: "Create Organization",
    })
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(button)

    expect(await screen.findByText(
      /couldn't confirm the saved slug yet/i,
    )).toBeDefined()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(mockDestroy).not.toHaveBeenCalled()
  })

  it("routes home when another tab already completed the organization", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(
      saveOrganizationCreationAttempt("user_123", pending, "acme-inc"),
    ).toBe("saved")
    expect(
      completeOrganizationCreationAttempt(
        "user_123",
        pending,
        "acme-inc",
        "org_existing",
      ),
    ).toBe("saved")
    const onOpenChange = mock((_open: boolean) => {})
    render(
      <CreateOrganizationDialog open onOpenChange={onOpenChange} />,
    )
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Organization Name") as HTMLInputElement).value,
      ).toBe("Acme Inc")
    })

    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/home")
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(mockCreateOrganization).not.toHaveBeenCalled()
  })

  it("keeps an unfinished organization when the user session disappears", async () => {
    profileOk = false
    const onOpenChange = mock((_open: boolean) => {})
    const view = render(
      <CreateOrganizationDialog open onOpenChange={onOpenChange} />,
    )
    await fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    expect(await screen.findByText("Slug save failed")).toBeDefined()

    g.__clerkState.isSignedIn = false
    view.rerender(
      <CreateOrganizationDialog open onOpenChange={onOpenChange} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(
      await screen.findByText(/couldn't check the unfinished organization/i),
    ).toBeDefined()
    expect(mockDestroy).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    g.__clerkState.isSignedIn = true
  })

  it("keeps a recovered attempt when membership reconciliation fails on cancel", async () => {
    const pending = createPendingOrganizationCreation("Acme Inc", [])
    expect(
      saveOrganizationCreationAttempt("user_123", pending, "acme-inc"),
    ).toBe("saved")
    mockGetOrganizationMemberships.mockImplementation(() =>
      Promise.reject(new Error("Clerk unavailable")),
    )
    const onOpenChange = mock((_open: boolean) => {})
    render(
      <CreateOrganizationDialog open onOpenChange={onOpenChange} />,
    )
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Organization Name") as HTMLInputElement).value,
      ).toBe("Acme Inc")
    })

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(
      await screen.findByText(/couldn't check the unfinished organization/i),
    ).toBeDefined()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("keeps an ambiguous profile write when its profile read fails on cancel", async () => {
    profileOk = false
    profileStatus = 503
    profileGetOk = false
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    expect(await screen.findByText("Slug save failed")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(
      await screen.findByText(/so we kept it/i),
    ).toBeDefined()
    expect(mockDestroy).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("keeps the dialog open when cancellation cannot acquire a browser lock", async () => {
    profileOk = false
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)
    await fillForm()
    fireEvent.click(screen.getByRole("button", { name: "Create Organization" }))
    expect(await screen.findByText("Slug save failed")).toBeDefined()
    delete g.navigator.locks

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(
      await screen.findByText(/browser can't safely create an organization/i),
    ).toBeDefined()
    expect(mockDestroy).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("uses the dialog close request for the same safe cancellation path", async () => {
    const onOpenChange = mock((_open: boolean) => {})
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Close Dialog" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mockDestroy).not.toHaveBeenCalled()
  })
})
