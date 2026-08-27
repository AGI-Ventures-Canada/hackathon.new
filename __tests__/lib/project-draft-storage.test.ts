import { describe, expect, it } from "bun:test"
import {
  projectDraftStorageKey,
  readProjectDraft,
  writeProjectDraft,
} from "@/lib/webmcp/project-draft-storage"

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe("project draft storage", () => {
  it("does not expose signed-in or legacy drafts while signed out", () => {
    const storage = new MemoryStorage()
    storage.setItem(projectDraftStorageKey("build-day", "user_one"), "user draft")
    storage.setItem("oatmeal:submission-draft:build-day", "legacy draft")

    expect(readProjectDraft(storage, "build-day", null)).toBeNull()
  })

  it("moves an anonymous draft into the account after sign-in", () => {
    const storage = new MemoryStorage()
    writeProjectDraft(storage, "build-day", null, "anonymous draft")

    expect(readProjectDraft(storage, "build-day", "user_one")).toBe("anonymous draft")
    expect(readProjectDraft(storage, "build-day", null)).toBeNull()
  })

  it("keeps drafts separate when accounts switch", () => {
    const storage = new MemoryStorage()
    writeProjectDraft(storage, "build-day", "user_one", "first draft")
    writeProjectDraft(storage, "build-day", "user_two", "second draft")

    expect(readProjectDraft(storage, "build-day", "user_one")).toBe("first draft")
    expect(readProjectDraft(storage, "build-day", "user_two")).toBe("second draft")
  })
})
