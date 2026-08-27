import { afterEach, describe, expect, it, mock } from "bun:test"
import {
  clearOrganizationCreationAttempt,
  completeOrganizationCreationAttempt,
  createPendingOrganizationCreation,
  findOrganizationBySlug,
  loadOrganizationCreationAttempt,
  reconcilePendingOrganization,
  saveOrganizationCreationAttempt,
  snapshotPendingOrganizationCreation,
  withOrganizationCreationLock,
} from "@/lib/auth/organization-creation"

const USER_ID = "user_123"

function memoryStorage(options: {
  getThrows?: boolean
  setThrows?: boolean
  removeThrows?: boolean
  echoWrites?: boolean
} = {}) {
  const values = new Map<string, string>()
  const storage = {
    getItem(key: string) {
      if (options.getThrows) throw new Error("read blocked")
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      if (options.setThrows) throw new Error("write blocked")
      if (options.echoWrites !== false) values.set(key, value)
    },
    removeItem(key: string) {
      if (options.removeThrows) throw new Error("remove blocked")
      values.delete(key)
    },
    clear() {
      values.clear()
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    get length() {
      return values.size
    },
  } satisfies Storage
  return { storage, values }
}

function installOrganizationStorages(local: Storage, session: Storage) {
  const localDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  )
  const sessionDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  )
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  })
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  })
  return () => {
    if (localDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localDescriptor)
    }
    if (sessionDescriptor) {
      Object.defineProperty(globalThis, "sessionStorage", sessionDescriptor)
    }
  }
}

afterEach(() => {
  clearOrganizationCreationAttempt(USER_ID)
  clearOrganizationCreationAttempt("user_other")
})

describe("organization creation reconciliation", () => {
  it("recovers the one matching membership added after the attempt", async () => {
    const pending = createPendingOrganizationCreation("Acme", [
      { id: "membership_old", organization: { id: "org_old", name: "Acme" } },
    ])
    const getMemberships = mock(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_old",
            organization: { id: "org_old", name: "Acme" },
          },
          {
            id: "membership_new",
            organization: { id: "org_new", name: "Acme" },
          },
        ],
        total_count: 2,
      }),
    )

    expect(await reconcilePendingOrganization(pending, getMemberships)).toEqual(
      {
        id: "org_new",
        name: "Acme",
      },
    )
  })

  it("does not mistake an old or differently named membership for the result", async () => {
    const pending = createPendingOrganizationCreation("Acme", [
      { id: "membership_old", organization: { id: "org_old", name: "Acme" } },
    ])
    const getMemberships = mock(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_old",
            organization: { id: "org_old", name: "Acme" },
          },
          {
            id: "membership_other",
            organization: { id: "org_other", name: "Other" },
          },
        ],
        total_count: 2,
      }),
    )

    expect(
      await reconcilePendingOrganization(pending, getMemberships),
    ).toBeNull()
  })

  it("uses the exact Clerk slug when names match more than one new membership", async () => {
    const pending = createPendingOrganizationCreation("Acme", [])
    const getMemberships = mock(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_wrong",
            organization: { id: "org_wrong", name: "Acme", slug: "acme-old" },
          },
          {
            id: "membership_right",
            organization: { id: "org_right", name: "Acme", slug: "acme-new" },
          },
        ],
        total_count: 2,
      }),
    )

    expect(
      await reconcilePendingOrganization(pending, getMemberships, "acme-new"),
    ).toEqual({ id: "org_right", name: "Acme", slug: "acme-new" })
    expect(
      await findOrganizationBySlug("Acme", "acme-new", getMemberships),
    ).toEqual({ id: "org_right", name: "Acme", slug: "acme-new" })
  })

  it("reports when the Clerk slug belongs to another organization", async () => {
    const getMemberships = mock(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_other",
            organization: { id: "org_other", name: "Other", slug: "acme" },
          },
        ],
        total_count: 1,
      }),
    )

    expect(
      findOrganizationBySlug("Acme", "acme", getMemberships),
    ).rejects.toThrow("already used by another organization")
  })

  it("fails closed when more than one matching organization appeared", async () => {
    const pending = createPendingOrganizationCreation("Acme", [])
    const getMemberships = mock(() =>
      Promise.resolve({
        data: [
          {
            id: "membership_one",
            organization: { id: "org_one", name: "Acme" },
          },
          {
            id: "membership_two",
            organization: { id: "org_two", name: "Acme" },
          },
        ],
        total_count: 2,
      }),
    )

    expect(
      reconcilePendingOrganization(pending, getMemberships),
    ).rejects.toThrow("more than one new organization")
  })

  it("snapshots matching memberships across every available page", async () => {
    const getMemberships = mock(({ initialPage }: { initialPage: number }) =>
      Promise.resolve({
        data:
          initialPage === 1
            ? [
                {
                  id: "membership_one",
                  organization: { id: "org_one", name: "Acme" },
                },
              ]
            : [
                {
                  id: "membership_two",
                  organization: { id: "org_two", name: "Acme" },
                },
              ],
        total_count: 101,
      }),
    )

    expect(
      await snapshotPendingOrganizationCreation(" Acme ", getMemberships),
    ).toEqual({
      name: "Acme",
      knownMembershipIds: ["membership_one", "membership_two"],
    })
    expect(getMemberships).toHaveBeenCalledTimes(2)
  })

  it("restores a user-scoped pending attempt after reload", () => {
    const pending = createPendingOrganizationCreation("Acme", [
      { id: "membership_old", organization: { id: "org_old", name: "Acme" } },
    ])

    expect(
      saveOrganizationCreationAttempt(USER_ID, pending, "acme", true),
    ).toBe("saved")
    expect(loadOrganizationCreationAttempt(USER_ID)).toEqual({
      name: "Acme",
      slug: "acme",
      knownMembershipIds: ["membership_old"],
      profileWritePending: true,
      completedOrganizationId: null,
    })
    expect(loadOrganizationCreationAttempt("user_other")).toBeNull()
  })

  it("expires old attempts and does not overwrite a different active attempt", () => {
    const startedAt = new Date("2026-08-26T12:00:00.000Z")
    const pending = createPendingOrganizationCreation("Acme", [])
    expect(
      saveOrganizationCreationAttempt(
        USER_ID,
        pending,
        "acme",
        false,
        startedAt,
      ),
    ).toBe("saved")
    expect(
      saveOrganizationCreationAttempt(
        USER_ID,
        createPendingOrganizationCreation("Other", []),
        "other",
        false,
        new Date("2026-08-26T12:01:00.000Z"),
      ),
    ).toBe("conflict")
    expect(
      loadOrganizationCreationAttempt(
        USER_ID,
        new Date("2026-08-27T11:59:00.000Z"),
      ),
    ).not.toBeNull()
    expect(
      loadOrganizationCreationAttempt(
        USER_ID,
        new Date("2026-08-27T12:00:00.000Z"),
      ),
    ).toBeNull()
  })

  it("allows a new slug only before an ambiguous profile write", () => {
    const pending = createPendingOrganizationCreation("Acme", [])
    expect(saveOrganizationCreationAttempt(USER_ID, pending, "acme")).toBe(
      "saved",
    )
    expect(
      saveOrganizationCreationAttempt(USER_ID, pending, "acme-new", true),
    ).toBe("saved")
    expect(
      saveOrganizationCreationAttempt(USER_ID, pending, "acme-third", true),
    ).toBe("conflict")
  })

  it("does not leave a session-only attempt when shared storage fails", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    )
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("Shared storage blocked")
      },
    })
    try {
      const pending = createPendingOrganizationCreation("Acme", [])
      expect(saveOrganizationCreationAttempt(USER_ID, pending, "acme")).toBe(
        "unavailable",
      )
      expect(loadOrganizationCreationAttempt(USER_ID)).toBeNull()
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "localStorage", descriptor)
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage
      }
    }
  })

  it("keeps a short completion marker for waiting tabs", () => {
    const pending = createPendingOrganizationCreation("Acme", [])
    const completedAt = new Date("2026-08-26T12:00:00.000Z")
    expect(
      saveOrganizationCreationAttempt(
        USER_ID,
        pending,
        "acme",
        false,
        completedAt,
      ),
    ).toBe("saved")
    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        pending,
        "acme",
        "org_acme",
        completedAt,
      ),
    ).toBe("saved")
    expect(
      loadOrganizationCreationAttempt(
        USER_ID,
        new Date("2026-08-26T12:00:29.000Z"),
      )?.completedOrganizationId,
    ).toBe("org_acme")
    expect(
      loadOrganizationCreationAttempt(
        USER_ID,
        new Date("2026-08-26T12:00:30.000Z"),
      ),
    ).toBeNull()
  })

  it("rejects malformed, future, oversized, and cross-user stored attempts", () => {
    const key = `oatmeal:organization-create:${USER_ID}`
    const now = new Date("2026-08-26T12:00:00.000Z")
    const valid = {
      version: 1,
      userId: USER_ID,
      name: "Acme",
      slug: "acme",
      knownMembershipIds: [],
      profileWritePending: false,
      completedOrganizationId: null,
      createdAt: now.toISOString(),
    }
    const invalidPayloads = [
      "not-json",
      JSON.stringify({ ...valid, version: 2 }),
      JSON.stringify({ ...valid, userId: "user_other" }),
      JSON.stringify({ ...valid, name: " " }),
      JSON.stringify({ ...valid, slug: "" }),
      JSON.stringify({ ...valid, profileWritePending: "yes" }),
      JSON.stringify({ ...valid, knownMembershipIds: [""] }),
      JSON.stringify({ ...valid, completedOrganizationId: "x".repeat(201) }),
      JSON.stringify({
        ...valid,
        createdAt: new Date(now.getTime() + 60_001).toISOString(),
      }),
    ]

    for (const payload of invalidPayloads) {
      localStorage.setItem(key, payload)
      expect(loadOrganizationCreationAttempt(USER_ID, now)).toBeNull()
      expect(localStorage.getItem(key)).toBeNull()
    }
    expect(loadOrganizationCreationAttempt("bad\nuser", now)).toBeNull()
    expect(loadOrganizationCreationAttempt("x".repeat(201), now)).toBeNull()
  })

  it("rejects every unsafe stored field and removes what it can", () => {
    const key = `oatmeal:organization-create:${USER_ID}`
    const now = new Date("2026-08-26T12:00:00.000Z")
    const valid = {
      version: 1,
      userId: USER_ID,
      name: "Acme",
      slug: "acme",
      knownMembershipIds: ["membership_1"],
      profileWritePending: false,
      completedOrganizationId: null,
      createdAt: now.toISOString(),
    }
    const invalidPayloads = [
      { ...valid, name: 42 },
      { ...valid, name: "x".repeat(121) },
      { ...valid, slug: 42 },
      { ...valid, slug: "x".repeat(101) },
      { ...valid, completedOrganizationId: "" },
      { ...valid, knownMembershipIds: "membership_1" },
      {
        ...valid,
        knownMembershipIds: Array.from(
          { length: 1_001 },
          (_, index) => `membership_${index}`,
        ),
      },
      { ...valid, knownMembershipIds: [42] },
      { ...valid, knownMembershipIds: ["x".repeat(201)] },
      { ...valid, createdAt: "not-a-date" },
    ]

    for (const payload of invalidPayloads) {
      localStorage.setItem(key, JSON.stringify(payload))
      expect(loadOrganizationCreationAttempt(USER_ID, now)).toBeNull()
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  it("continues past unreadable and undeletable storage copies", () => {
    const key = `oatmeal:organization-create:${USER_ID}`
    const now = new Date("2026-08-26T12:00:00.000Z")
    const unreadable = memoryStorage({ getThrows: true, removeThrows: true })
    const session = memoryStorage({ removeThrows: true })
    session.values.set(key, "not-json")
    const restore = installOrganizationStorages(
      unreadable.storage,
      session.storage,
    )

    try {
      expect(loadOrganizationCreationAttempt(USER_ID, now)).toBeNull()
      expect(session.values.get(key)).toBe("not-json")
      clearOrganizationCreationAttempt(USER_ID)
    } finally {
      restore()
    }
  })

  it("requires a verified shared-storage write and cleans up partial copies", () => {
    const local = memoryStorage({ echoWrites: false, removeThrows: true })
    const session = memoryStorage()
    const restore = installOrganizationStorages(local.storage, session.storage)

    try {
      expect(
        saveOrganizationCreationAttempt(
          USER_ID,
          createPendingOrganizationCreation("Acme", []),
          "acme",
        ),
      ).toBe("unavailable")
      expect(session.values.size).toBe(0)
    } finally {
      restore()
    }
  })

  it("fails a completion marker when shared storage cannot retain it", () => {
    const local = memoryStorage({ echoWrites: false })
    const session = memoryStorage()
    const restore = installOrganizationStorages(local.storage, session.storage)

    try {
      expect(
        completeOrganizationCreationAttempt(
          USER_ID,
          createPendingOrganizationCreation("Acme", []),
          "acme",
          "org_acme",
        ),
      ).toBe("unavailable")
      expect(session.values.size).toBe(1)
    } finally {
      restore()
    }
  })

  it("uses a valid session copy after removing a corrupt shared copy", () => {
    const pending = createPendingOrganizationCreation("Acme", [])
    expect(saveOrganizationCreationAttempt(USER_ID, pending, "acme")).toBe(
      "saved",
    )
    const key = `oatmeal:organization-create:${USER_ID}`
    const sessionCopy = sessionStorage.getItem(key)!
    localStorage.setItem(key, "not-json")

    expect(loadOrganizationCreationAttempt(USER_ID)).toEqual({
      name: "Acme",
      slug: "acme",
      knownMembershipIds: [],
      profileWritePending: false,
      completedOrganizationId: null,
    })
    expect(localStorage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(key)).toBe(sessionCopy)
  })

  it("rejects unsafe save and completion inputs without writing", () => {
    const pending = createPendingOrganizationCreation("Acme", [])
    expect(
      saveOrganizationCreationAttempt("bad\nuser", pending, "acme"),
    ).toBe("unavailable")
    expect(
      saveOrganizationCreationAttempt(USER_ID, { ...pending, name: " " }, "acme"),
    ).toBe("unavailable")
    expect(
      saveOrganizationCreationAttempt(USER_ID, pending, "x".repeat(101)),
    ).toBe("unavailable")
    expect(
      saveOrganizationCreationAttempt(USER_ID, {
        ...pending,
        knownMembershipIds: Array.from({ length: 1_001 }, (_, index) =>
          `membership_${index}`,
        ),
      }, "acme"),
    ).toBe("unavailable")
    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        pending,
        "acme",
        "x".repeat(201),
      ),
    ).toBe("unavailable")
  })

  it("does not overwrite or complete a different pending attempt", () => {
    const first = createPendingOrganizationCreation("Acme", [
      { id: "membership_old", organization: { id: "org_old", name: "Acme" } },
    ])
    expect(saveOrganizationCreationAttempt(USER_ID, first, "acme")).toBe(
      "saved",
    )

    expect(
      saveOrganizationCreationAttempt(
        USER_ID,
        { ...first, knownMembershipIds: ["membership_other"] },
        "acme",
      ),
    ).toBe("conflict")
    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        { ...first, name: "Other" },
        "acme",
        "org_other",
      ),
    ).toBe("conflict")

    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        first,
        "acme",
        "org_acme",
      ),
    ).toBe("saved")
    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        first,
        "acme",
        "org_other",
      ),
    ).toBe("conflict")
  })

  it("checks every pending-attempt identity field before completion", () => {
    const first = createPendingOrganizationCreation("Acme", [
      { id: "membership_1", organization: { id: "org_1", name: "Acme" } },
      { id: "membership_2", organization: { id: "org_2", name: "Acme" } },
    ])
    expect(saveOrganizationCreationAttempt(USER_ID, first, "acme")).toBe(
      "saved",
    )

    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        first,
        "other-slug",
        "org_acme",
      ),
    ).toBe("conflict")
    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        { ...first, knownMembershipIds: ["membership_1"] },
        "acme",
        "org_acme",
      ),
    ).toBe("conflict")
    expect(
      completeOrganizationCreationAttempt(
        USER_ID,
        { ...first, knownMembershipIds: ["membership_2", "membership_1"] },
        "acme",
        "org_acme",
      ),
    ).toBe("conflict")
    expect(
      completeOrganizationCreationAttempt(USER_ID, first, "acme", ""),
    ).toBe("unavailable")
  })

  it("fails closed when membership pagination exceeds its safe bound", async () => {
    const getMemberships = mock(() =>
      Promise.resolve({ data: [], total_count: 1_001 }),
    )

    expect(
      snapshotPendingOrganizationCreation("Acme", getMemberships),
    ).rejects.toThrow("safely check all your organizations")
    expect(getMemberships).toHaveBeenCalledTimes(10)

    expect(
      findOrganizationBySlug("Acme", "acme", getMemberships),
    ).rejects.toThrow("safely check all your organizations")
  })

  it("rejects duplicate exact-slug matches across membership pages", async () => {
    const getMemberships = mock(({ initialPage }: { initialPage: number }) =>
      Promise.resolve({
        data: [{
          id: `membership_${initialPage}`,
          organization: {
            id: `org_${initialPage}`,
            name: "Acme",
            slug: "acme",
          },
        }],
        total_count: 101,
      }),
    )

    expect(
      findOrganizationBySlug("Acme", "acme", getMemberships),
    ).rejects.toThrow("more than one organization with this address")
  })

  it("runs organization creation under the browser's exclusive lock", async () => {
    const request = mock(
      async (
        name: string,
        options: { mode: "exclusive"; signal: AbortSignal },
        callback: () => Promise<string>,
      ) => {
        expect(name).toBe(`oatmeal:organization-create:${USER_ID}`)
        expect(options.mode).toBe("exclusive")
        expect(options.signal.aborted).toBe(false)
        return callback()
      },
    )
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    })
    try {
      expect(
        await withOrganizationCreationLock(USER_ID, async () => "created"),
      ).toBe("created")
      expect(request).toHaveBeenCalledTimes(1)
    } finally {
      delete (navigator as Navigator & { locks?: unknown }).locks
    }
  })

  it("reports a lock timeout before entering the creation task", async () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const request = mock(
      async (
        _name: string,
        options: { signal: AbortSignal },
        _callback: () => Promise<string>,
      ) => {
        await new Promise<void>((resolve) => {
          options.signal.addEventListener("abort", () => resolve(), {
            once: true,
          })
        })
        throw new DOMException("Timed out", "AbortError")
      },
    )
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    })
    globalThis.setTimeout = ((callback: TimerHandler) => {
      queueMicrotask(() => {
        if (typeof callback === "function") callback()
      })
      return 1
    }) as typeof setTimeout
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout

    try {
      expect(
        withOrganizationCreationLock(USER_ID, async () => "created"),
      ).rejects.toThrow("Another tab is creating an organization")
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      delete (navigator as Navigator & { locks?: unknown }).locks
    }
  })

  it("preserves failures raised before and after a lock is acquired", async () => {
    const beforeAcquire = new Error("lock manager failed")
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: () => Promise.reject(beforeAcquire) },
    })
    await expect(
      withOrganizationCreationLock(USER_ID, async () => "created"),
    ).rejects.toBe(beforeAcquire)

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          _options: { signal: AbortSignal },
          callback: () => Promise<string>,
        ) => callback(),
      },
    })
    const taskFailure = new Error("creation failed")
    await expect(
      withOrganizationCreationLock(USER_ID, async () => {
        throw taskFailure
      }),
    ).rejects.toBe(taskFailure)
    delete (navigator as Navigator & { locks?: unknown }).locks
  })

  it("fails closed when browser locking is unavailable", async () => {
    delete (navigator as Navigator & { locks?: unknown }).locks
    expect(
      withOrganizationCreationLock(USER_ID, async () => "created"),
    ).rejects.toThrow("can't safely create an organization")
    expect(
      withOrganizationCreationLock("bad\nuser", async () => "created"),
    ).rejects.toThrow("can't safely create an organization")
  })
})
