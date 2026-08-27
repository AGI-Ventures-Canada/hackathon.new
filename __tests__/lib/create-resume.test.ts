import { afterEach, describe, expect, it } from "bun:test"
import {
  createAuthResumeTarget,
  restoreAuthResumeTarget,
  takeAuthResumeTarget,
} from "@/lib/auth/create-resume"

function installActivationWriteFailures() {
  const localDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  )
  const sessionDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  )
  const createStorage = () => {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem(key: string, value: string) {
        if (key.startsWith("oatmeal:create-resume-active:")) {
          throw new Error("active storage blocked")
        }
        values.set(key, value)
      },
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size
      },
    } satisfies Storage
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: createStorage(),
  })
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: createStorage(),
  })
  return () => {
    if (localDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localDescriptor)
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage
    }
    if (sessionDescriptor) {
      Object.defineProperty(globalThis, "sessionStorage", sessionDescriptor)
    } else {
      delete (globalThis as { sessionStorage?: Storage }).sessionStorage
    }
  }
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe("create auth resume", () => {
  it("uses a direct redirect when the auth request stays small", () => {
    expect(createAuthResumeTarget("/create?review=true")).toBe(
      "/create?review=true",
    )
  })

  it("stores only redacted import metadata for a long return path", () => {
    const secret = "private-invite-token"
    const target = createAuthResumeTarget(
      `/import?url=${encodeURIComponent(`https://events.example/${"界".repeat(1_000)}?token=${secret}`)}`,
      {
        sourceUrl: "https://events.example/event",
        storageKey: "oatmeal:external-import:opaque-reference",
      },
    )

    expect(target).toMatch(/^\/resume-create\?token=/)
    expect([...Array(sessionStorage.length)].map((_, index) =>
      sessionStorage.getItem(sessionStorage.key(index)!),
    ).join(" ")).not.toContain(secret)
    const token = new URL(target!, "https://app.example").searchParams.get("token")!
    const key = `oatmeal:create-resume:${token}`
    expect(sessionStorage.getItem(key)).toBe(localStorage.getItem(key))
    expect(takeAuthResumeTarget(token)).toEqual({
      kind: "import",
      sourceUrl: "https://events.example/event",
      storageKey: "oatmeal:external-import:opaque-reference",
    })
    expect(takeAuthResumeTarget(token)).toBeNull()
  })

  it("keeps short import secrets out of the auth URL", () => {
    const secret = "private-invite-token"
    const target = createAuthResumeTarget(
      `/import?url=${encodeURIComponent(`https://events.example/event?token=${secret}`)}`,
      {
        sourceUrl: "https://events.example/event",
        storageKey: "oatmeal:external-import:opaque-reference",
      },
    )

    expect(target).toMatch(/^\/resume-create\?token=/)
    expect(target).not.toContain(secret)
    expect([...Array(sessionStorage.length)].map((_, index) =>
      sessionStorage.getItem(sessionStorage.key(index)!),
    ).join(" ")).not.toContain(secret)
  })

  it("rejects malformed and expired resume records", () => {
    expect(takeAuthResumeTarget("not-a-token")).toBeNull()
    const token = crypto.randomUUID()
    sessionStorage.setItem(`oatmeal:create-resume:${token}`, JSON.stringify({
      kind: "redirect",
      redirectUrl: "/create",
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString(),
    }))
    expect(takeAuthResumeTarget(token)).toBeNull()
    expect(sessionStorage.getItem(`oatmeal:create-resume:${token}`)).toBeNull()
  })

  it("keeps an import handoff for the full draft lifetime", () => {
    const token = crypto.randomUUID()
    sessionStorage.setItem(`oatmeal:create-resume:${token}`, JSON.stringify({
      kind: "import",
      sourceUrl: "https://events.example/event",
      storageKey: "oatmeal:external-import:opaque-reference",
      createdAt: new Date(Date.now() - 23 * 60 * 60 * 1_000).toISOString(),
    }))

    expect(takeAuthResumeTarget(token)).toEqual({
      kind: "import",
      sourceUrl: "https://events.example/event",
      storageKey: "oatmeal:external-import:opaque-reference",
    })
  })

  it("recovers a valid fallback copy when another storage is corrupted", () => {
    const token = crypto.randomUUID()
    const key = `oatmeal:create-resume:${token}`
    sessionStorage.setItem(key, "not-json")
    localStorage.setItem(key, JSON.stringify({
      kind: "redirect",
      redirectUrl: "/create?review=true",
      createdAt: new Date().toISOString(),
    }))

    expect(takeAuthResumeTarget(token)).toEqual({
      kind: "redirect",
      redirectUrl: "/create?review=true",
    })
    expect(sessionStorage.getItem(key)).toBeNull()
    expect(localStorage.getItem(key)).toBeNull()
  })

  it("keeps an activated import handoff available across a refresh", () => {
    const target = createAuthResumeTarget(
      `/import?url=${encodeURIComponent(`https://events.example/${"界".repeat(1_000)}`)}`,
      {
        sourceUrl: "https://events.example/event",
        storageKey: "oatmeal:external-import:opaque-reference",
      },
    )
    const token = new URL(target!, "https://app.example").searchParams.get("token")!

    expect(restoreAuthResumeTarget(token)).toEqual({
      kind: "import",
      sourceUrl: "https://events.example/event",
      storageKey: "oatmeal:external-import:opaque-reference",
    })
    const activeKey = `oatmeal:create-resume-active:${token}`
    expect(sessionStorage.getItem(activeKey)).toBe(localStorage.getItem(activeKey))
    expect(restoreAuthResumeTarget(token)).toEqual({
      kind: "import",
      sourceUrl: "https://events.example/event",
      storageKey: "oatmeal:external-import:opaque-reference",
    })
    expect(takeAuthResumeTarget(token)).toBeNull()
  })

  it("keeps the pending handoff when active storage cannot be written", () => {
    const restoreStorages = installActivationWriteFailures()
    try {
      const expected = {
        kind: "import" as const,
        sourceUrl: "https://events.example/event",
        storageKey: "oatmeal:external-import:opaque-reference",
      }
      const target = createAuthResumeTarget("/import?review=true", expected)
      const token = new URL(
        target!,
        "https://app.example",
      ).searchParams.get("token")!

      expect(restoreAuthResumeTarget(token)).toEqual(expected)
      expect(takeAuthResumeTarget(token)).toEqual(expected)
      expect(takeAuthResumeTarget(token)).toBeNull()
    } finally {
      restoreStorages()
    }
  })

  it("rejects unsafe return paths and import metadata before storing them", () => {
    expect(createAuthResumeTarget("https://evil.example/create")).toBeNull()
    expect(createAuthResumeTarget(`//evil.example/${"界".repeat(1_000)}`, {
      sourceUrl: "https://events.example/event",
      storageKey: "oatmeal:external-import:opaque-reference",
    })).toBeNull()
    expect(createAuthResumeTarget(`/import?url=${"界".repeat(1_000)}`, {
      sourceUrl: "http://localhost/private",
      storageKey: "oatmeal:external-import:opaque-reference",
    })).toBeNull()
    expect(createAuthResumeTarget(`/import?url=${"界".repeat(1_000)}`, {
      sourceUrl: "https://events.example/event?invite=secret",
      storageKey: "oatmeal:external-import:opaque-reference",
    })).toBeNull()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it("removes unsafe redirect and import records from storage", () => {
    const redirectToken = crypto.randomUUID()
    const redirectKey = `oatmeal:create-resume:${redirectToken}`
    localStorage.setItem(redirectKey, JSON.stringify({
      kind: "redirect",
      redirectUrl: "//evil.example/steal",
      createdAt: new Date().toISOString(),
    }))
    expect(takeAuthResumeTarget(redirectToken)).toBeNull()
    expect(localStorage.getItem(redirectKey)).toBeNull()

    const importToken = crypto.randomUUID()
    const importKey = `oatmeal:create-resume:${importToken}`
    sessionStorage.setItem(importKey, JSON.stringify({
      kind: "import",
      sourceUrl: "https://events.example/event?secret=value",
      storageKey: "oatmeal:external-import:opaque-reference",
      createdAt: new Date().toISOString(),
    }))
    expect(takeAuthResumeTarget(importToken)).toBeNull()
    expect(sessionStorage.getItem(importKey)).toBeNull()
  })

  it("rejects records created too far in the future", () => {
    const token = crypto.randomUUID()
    const key = `oatmeal:create-resume:${token}`
    sessionStorage.setItem(key, JSON.stringify({
      kind: "redirect",
      redirectUrl: "/create",
      createdAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    }))

    expect(takeAuthResumeTarget(token)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it("drops corrupt and expired active handoffs before checking the original", () => {
    const token = crypto.randomUUID()
    const activeKey = `oatmeal:create-resume-active:${token}`
    localStorage.setItem(activeKey, "not-json")
    sessionStorage.setItem(activeKey, JSON.stringify({
      kind: "redirect",
      redirectUrl: "/create",
      activatedAt: new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString(),
    }))

    expect(restoreAuthResumeTarget(token)).toBeNull()
    expect(localStorage.getItem(activeKey)).toBeNull()
    expect(sessionStorage.getItem(activeKey)).toBeNull()
  })

  it("accepts a valid active redirect without consuming it", () => {
    const redirectUrl = `/create?${"draft=x&".repeat(900)}review=true`
    const target = createAuthResumeTarget(redirectUrl)
    const token = new URL(target!, "https://app.example").searchParams.get(
      "token",
    )!

    expect(restoreAuthResumeTarget(token)).toEqual({
      kind: "redirect",
      redirectUrl,
    })
    expect(restoreAuthResumeTarget(token)).toEqual({
      kind: "redirect",
      redirectUrl,
    })
  })

  it("rejects oversized and control-character import storage keys", () => {
    const redirect = "/import?review=true"
    expect(createAuthResumeTarget(redirect, {
      sourceUrl: "https://events.example/event",
      storageKey: `oatmeal:external-import:${"x".repeat(40_000)}`,
    })).toBeNull()
    expect(createAuthResumeTarget(redirect, {
      sourceUrl: "https://events.example/event",
      storageKey: "oatmeal:external-import:bad\nkey",
    })).toBeNull()
  })
})
