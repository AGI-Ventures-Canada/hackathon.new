import { describe, it, expect, mock, beforeEach } from "bun:test"
import type { ClerkClient } from "@clerk/backend"
import { mockClerkClient } from "./supabase-mock"

const { resolveAdder, resolveAdderName, resolveAdderEmail } = await import(
  "@/lib/auth/resolve-adder-name"
)

const mockGetUser = mock(() =>
  Promise.resolve({ firstName: "Jane", lastName: "Doe" })
)

function makeClient(firstName: string | null, lastName: string | null): ClerkClient {
  return {
    users: { getUser: mock(() => Promise.resolve({ firstName, lastName })) },
  } as unknown as ClerkClient
}

function makeClientWithEmail(email: string | null): ClerkClient {
  return {
    users: {
      getUser: mock(() =>
        Promise.resolve({
          firstName: "Test",
          lastName: "User",
          primaryEmailAddress: email ? { emailAddress: email } : null,
        })
      ),
    },
  } as unknown as ClerkClient
}

describe("resolveAdderName", () => {
  beforeEach(() => {
    mockGetUser.mockClear()
    mockClerkClient.mockClear()
    mockClerkClient.mockImplementation(() =>
      Promise.resolve({ users: { getUser: mockGetUser } })
    )
  })

  it("returns 'An organizer' for non-user principal", async () => {
    expect(await resolveAdderName({ kind: "api_key" })).toBe("An organizer")
  })

  it("returns 'An organizer' for user principal without userId", async () => {
    expect(await resolveAdderName({ kind: "user" })).toBe("An organizer")
  })

  it("returns full name when both parts are present", async () => {
    const result = await resolveAdderName({ kind: "user", userId: "u1" }, makeClient("Jane", "Doe"))
    expect(result).toBe("Jane Doe")
  })

  it("returns first name only when last name is null", async () => {
    const result = await resolveAdderName({ kind: "user", userId: "u1" }, makeClient("Jane", null))
    expect(result).toBe("Jane")
  })

  it("returns last name only when first name is null", async () => {
    const result = await resolveAdderName({ kind: "user", userId: "u1" }, makeClient(null, "Doe"))
    expect(result).toBe("Doe")
  })

  it("returns 'An organizer' when both name parts are null", async () => {
    const result = await resolveAdderName({ kind: "user", userId: "u1" }, makeClient(null, null))
    expect(result).toBe("An organizer")
  })

  it("returns 'An organizer' when Clerk getUser throws", async () => {
    const client = {
      users: { getUser: mock(() => Promise.reject(new Error("Clerk error"))) },
    } as unknown as ClerkClient
    const result = await resolveAdderName({ kind: "user", userId: "u1" }, client)
    expect(result).toBe("An organizer")
  })

  it("uses provided client and does not instantiate a new one", async () => {
    const getUser = mock(() => Promise.resolve({ firstName: "Alex", lastName: null }))
    const client = { users: { getUser } } as unknown as ClerkClient
    await resolveAdderName({ kind: "user", userId: "u1" }, client)
    expect(getUser).toHaveBeenCalledWith("u1")
    expect(mockClerkClient).not.toHaveBeenCalled()
  })

  it("instantiates clerkClient when no client is provided", async () => {
    mockGetUser.mockResolvedValueOnce({ firstName: "Sam", lastName: "Smith" })
    const result = await resolveAdderName({ kind: "user", userId: "u1" })
    expect(result).toBe("Sam Smith")
    expect(mockClerkClient).toHaveBeenCalled()
  })
})

describe("resolveAdder", () => {
  beforeEach(() => {
    mockClerkClient.mockClear()
  })

  it("returns 'An organizer' name and undefined email for non-user principal", async () => {
    expect(await resolveAdder({ kind: "api_key" })).toEqual({ name: "An organizer" })
  })

  it("returns name and email in a single call", async () => {
    const getUser = mock(() =>
      Promise.resolve({
        firstName: "Sarah",
        lastName: "Chen",
        primaryEmailAddress: { emailAddress: "sarah@example.com" },
      })
    )
    const client = { users: { getUser } } as unknown as ClerkClient
    const result = await resolveAdder({ kind: "user", userId: "u1" }, client)
    expect(result).toEqual({ name: "Sarah Chen", email: "sarah@example.com" })
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it("falls back to 'An organizer' when name parts are missing but email exists", async () => {
    const client = {
      users: {
        getUser: mock(() =>
          Promise.resolve({
            firstName: null,
            lastName: null,
            primaryEmailAddress: { emailAddress: "sarah@example.com" },
          })
        ),
      },
    } as unknown as ClerkClient
    const result = await resolveAdder({ kind: "user", userId: "u1" }, client)
    expect(result).toEqual({ name: "An organizer", email: "sarah@example.com" })
  })

  it("returns fallback name and undefined email when Clerk getUser throws", async () => {
    const client = {
      users: { getUser: mock(() => Promise.reject(new Error("Clerk error"))) },
    } as unknown as ClerkClient
    const result = await resolveAdder({ kind: "user", userId: "u1" }, client)
    expect(result).toEqual({ name: "An organizer" })
  })
})

describe("resolveAdderEmail", () => {
  beforeEach(() => {
    mockClerkClient.mockClear()
  })

  it("returns undefined for non-user principal", async () => {
    expect(await resolveAdderEmail({ kind: "api_key" })).toBeUndefined()
  })

  it("returns undefined for user principal without userId", async () => {
    expect(await resolveAdderEmail({ kind: "user" })).toBeUndefined()
  })

  it("returns the primary email when present", async () => {
    const result = await resolveAdderEmail(
      { kind: "user", userId: "u1" },
      makeClientWithEmail("captain@example.com")
    )
    expect(result).toBe("captain@example.com")
  })

  it("returns undefined when no primary email is set", async () => {
    const result = await resolveAdderEmail(
      { kind: "user", userId: "u1" },
      makeClientWithEmail(null)
    )
    expect(result).toBeUndefined()
  })

  it("returns undefined when Clerk getUser throws", async () => {
    const client = {
      users: { getUser: mock(() => Promise.reject(new Error("Clerk error"))) },
    } as unknown as ClerkClient
    const result = await resolveAdderEmail({ kind: "user", userId: "u1" }, client)
    expect(result).toBeUndefined()
  })
})
