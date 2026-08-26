import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react"
import { useHackathonDraft } from "@/hooks/use-hackathon-draft"
import {
  createDraftEnvelope,
  createEmptyHackathonDraft,
  serializeDraftEnvelope,
  type DraftEnvelope,
  type DraftState,
} from "@/lib/hackathon-draft"

const STORAGE_KEY = "oatmeal:test-direct-draft"

function draftState(name = "Initial event"): DraftState {
  return { ...createEmptyHackathonDraft(), name }
}

function completionTombstone(
  envelope: DraftEnvelope,
  options: {
    eventSlug?: string
    revision?: number
    savedAt?: string
    completedAt?: string
  } = {},
) {
  return JSON.stringify({
    completedDraft: {
      draftId: envelope.draftId,
      revision: options.revision ?? envelope.revision,
      savedAt: options.savedAt ?? envelope.savedAt,
      completedAt: options.completedAt ?? new Date().toISOString(),
      ...(options.eventSlug ? { eventSlug: options.eventSlug } : {}),
    },
  })
}

function createControlledStorage() {
  const values = new Map<string, string>()
  let blocked = false
  let rejectedKey: ((key: string) => boolean) | null = null
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked || rejectedKey?.(key)) throw new Error("storage blocked")
      values.set(key, value)
    },
    removeItem: (key: string) => {
      if (blocked) throw new Error("storage blocked")
      values.delete(key)
    },
    clear: () => values.clear(),
    get length() {
      return values.size
    },
    key: (index: number) => [...values.keys()][index] ?? null,
  } as Storage
  return {
    storage,
    values,
    setBlocked: (next: boolean) => {
      blocked = next
    },
    rejectKeys: (predicate: ((key: string) => boolean) | null) => {
      rejectedKey = predicate
    },
  }
}

function installDraftStorages(local: Storage, session: Storage) {
  const originals = {
    globalLocal: globalThis.localStorage,
    globalSession: globalThis.sessionStorage,
    windowLocal: window.localStorage,
    windowSession: window.sessionStorage,
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  })
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  })
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: local,
  })
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: session,
  })
  return () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originals.globalLocal,
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originals.globalSession,
    })
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originals.windowLocal,
    })
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: originals.windowSession,
    })
  }
}

const storageRestorers: Array<() => void> = []

function useControlledStorages() {
  const local = createControlledStorage()
  const session = createControlledStorage()
  storageRestorers.push(installDraftStorages(local.storage, session.storage))
  return { local, session }
}

async function renderDraft(
  options: Partial<Parameters<typeof useHackathonDraft>[0]> = {},
) {
  const rendered = renderHook(() => useHackathonDraft({
    initialState: draftState(),
    storageKey: STORAGE_KEY,
    ...options,
  }))
  await waitFor(() => expect(rendered.result.current.hydrated).toBe(true))
  return rendered
}

function captureError(run: () => void) {
  let error: unknown
  act(() => {
    try {
      run()
    } catch (caught) {
      error = caught
    }
  })
  return error
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  while (storageRestorers.length > 0) storageRestorers.pop()?.()
  localStorage.clear()
  sessionStorage.clear()
})

describe("useHackathonDraft direct recovery boundaries", () => {
  it("creates browser-time defaults only after mount and falls back if that factory fails", async () => {
    const browserState = draftState("Browser-time event")
    const first = await renderDraft({
      createInitialStateAfterMount: () => browserState,
    })
    expect(first.result.current.state.name).toBe("Browser-time event")
    first.unmount()
    localStorage.clear()
    sessionStorage.clear()

    const second = await renderDraft({
      createInitialStateAfterMount: () => {
        throw new Error("time zone unavailable")
      },
    })
    expect(second.result.current.state.name).toBe("Initial event")
  })

  it("rejects invalid whole-state edits and updater failures without changing the saved revision", async () => {
    const { result } = await renderDraft()
    const revision = result.current.envelope.revision

    act(() => {
      result.current.replaceState({
        ...result.current.state,
        name: "x".repeat(121),
      })
    })
    expect(result.current.envelope.revision).toBe(revision)
    expect(result.current.conflictMessage).toMatch(/too long/i)

    act(() => {
      result.current.updateState(() => {
        throw new Error("editor failed")
      })
    })
    expect(result.current.conflictMessage).toMatch(/could not be applied/i)

    act(() => {
      result.current.updateState((state) => ({
        ...state,
        description: "d".repeat(5_001),
      }))
    })
    expect(result.current.envelope.revision).toBe(revision)
    expect(result.current.conflictMessage).toMatch(/too long/i)

    act(() => {
      result.current.replaceState({ ...result.current.state, name: "Valid edit" })
    })
    expect(result.current.state.name).toBe("Valid edit")
    expect(result.current.envelope.revision).toBe(revision + 1)
    expect(result.current.persistenceStatus).toBe("saved")
  })

  it("reports a stale direct patch atomically", async () => {
    const { result } = await renderDraft()

    const error = captureError(() => {
      result.current.patchState(result.current.envelope.revision + 1, {
        name: "Stale edit",
      })
    })

    expect(error).toMatchObject({ code: "stale_revision", retryable: true })
    expect(result.current.state.name).toBe("Initial event")
  })

  it("restores a newer tab before rejecting a stale WebMCP patch", async () => {
    const { result } = await renderDraft()
    const current = result.current.getCurrentEnvelope()
    const newer = {
      ...current,
      revision: current.revision + 1,
      state: { ...current.state, name: "Other tab edit" },
      savedAt: new Date(new Date(current.savedAt).getTime() + 1_000).toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, serializeDraftEnvelope(newer))

    const error = captureError(() => {
      result.current.patchState(current.revision, { description: "My edit" })
    })

    expect(error).toMatchObject({ code: "stale_revision", retryable: true })
    expect(result.current.state.name).toBe("Other tab edit")
  })

  it("fails a WebMCP patch closed when another tab has divergent same-revision content", async () => {
    const { result } = await renderDraft()
    const current = result.current.getCurrentEnvelope()
    localStorage.setItem(STORAGE_KEY, serializeDraftEnvelope({
      ...current,
      state: { ...current.state, name: "Divergent tab" },
    }))

    const error = captureError(() => {
      result.current.patchState(current.revision, { description: "My edit" })
    })

    expect(error).toMatchObject({ code: "draft_conflict", retryable: false })
    expect(result.current.conflictMessage).toMatch(/different edits/i)
  })

  it("forks this tab before rejecting a patch when another draft takes the primary key", async () => {
    const { result } = await renderDraft()
    const current = result.current.getCurrentEnvelope()
    const other = createDraftEnvelope(draftState("Other draft"), {
      draftId: "22222222-2222-4222-8222-222222222222",
      now: new Date(new Date(current.savedAt).getTime() + 1_000),
    })
    localStorage.setItem(STORAGE_KEY, serializeDraftEnvelope(other))

    const error = captureError(() => {
      result.current.patchState(current.revision, { description: "My edit" })
    })

    expect(error).toMatchObject({ code: "stale_revision", retryable: true })
    expect(result.current.envelope.draftId).not.toBe(current.draftId)
    expect(result.current.conflictMessage).toMatch(/separate draft/i)
  })

  it("rejects edits after another tab records the same draft as completed", async () => {
    const { result } = await renderDraft()
    const current = result.current.getCurrentEnvelope()
    localStorage.setItem(STORAGE_KEY, completionTombstone(current, {
      eventSlug: "created-event",
    }))

    const error = captureError(() => {
      result.current.patchState(current.revision, { description: "Duplicate" })
    })

    expect(error).toMatchObject({ code: "draft_completed", retryable: false })
    expect(result.current.persistenceStatus).toBe("completed")
    expect(result.current.recentCompletedEventSlug).toBe("created-event")
  })

  it("ignores a completion marker dated beyond the allowed clock skew", async () => {
    const { local } = useControlledStorages()
    const current = createDraftEnvelope(draftState("Still editable"), {
      draftId: "12121212-1212-4212-8212-121212121212",
      now: new Date(),
    })
    local.storage.setItem(STORAGE_KEY, serializeDraftEnvelope(current))
    local.storage.setItem(
      `${STORAGE_KEY}:completed:${current.draftId}`,
      completionTombstone(current, {
        eventSlug: "tampered-event",
        completedAt: new Date(Date.now() + 6 * 60 * 1_000).toISOString(),
      }),
    )

    const { result } = await renderDraft()

    expect(result.current.state.name).toBe("Still editable")
    expect(result.current.persistenceStatus).toBe("saved")
    expect(result.current.recentCompletedEventSlug).toBeNull()
    let saveResult: ReturnType<typeof result.current.ensureSavedDraft>
    act(() => {
      saveResult = result.current.ensureSavedDraft()
    })
    expect(saveResult!).toBe("saved")
  })

  it("marks deleted and malformed cross-tab values as conflicts", async () => {
    const { result } = await renderDraft()

    fireEvent(window, new window.StorageEvent("storage", {
      key: STORAGE_KEY,
      newValue: null,
    }))
    expect(result.current.persistenceStatus).toBe("conflict")
    expect(result.current.conflictMessage).toMatch(/changed in another tab/i)

    fireEvent(window, new window.StorageEvent("storage", {
      key: STORAGE_KEY,
      newValue: "not-json",
    }))
    expect(result.current.persistenceStatus).toBe("conflict")
    expect(result.current.conflictMessage).toMatch(/reload before/i)
  })

  it("fails closed when a cross-tab fork cannot be persisted", async () => {
    const { local, session } = useControlledStorages()
    const { result } = await renderDraft()
    const current = result.current.getCurrentEnvelope()
    const other = createDraftEnvelope(draftState("Other draft"), {
      draftId: "33333333-3333-4333-8333-333333333333",
      now: new Date(new Date(current.savedAt).getTime() + 1_000),
    })
    local.setBlocked(true)
    session.setBlocked(true)

    fireEvent(window, new window.StorageEvent("storage", {
      key: STORAGE_KEY,
      newValue: serializeDraftEnvelope(other),
    }))

    expect(result.current.persistenceStatus).toBe("conflict")
    expect(result.current.conflictMessage).toMatch(/copy is not lost/i)
  })

  it("fails closed when newer edits cannot be rotated after cross-tab completion", async () => {
    const { local, session } = useControlledStorages()
    const { result } = await renderDraft()
    const completed = result.current.getCurrentEnvelope()
    act(() => {
      result.current.updateState((state) => ({ ...state, name: "Newer edit" }))
    })
    local.setBlocked(true)
    session.setBlocked(true)

    fireEvent(window, new window.StorageEvent("storage", {
      key: STORAGE_KEY,
      newValue: completionTombstone(completed),
    }))

    expect(result.current.persistenceStatus).toBe("unavailable")
    expect(result.current.conflictMessage).toMatch(/newer edits could not be saved/i)
  })

  it("recovers newer edits as a fresh draft during hydration after a completion", async () => {
    const { local } = useControlledStorages()
    const baseTime = new Date(Date.now() - 60_000)
    const completed = createDraftEnvelope(draftState("Created version"), {
      draftId: "44444444-4444-4444-8444-444444444444",
      now: baseTime,
    })
    const newer = {
      ...completed,
      revision: 1,
      state: draftState("Newer setup edits"),
      savedAt: new Date(baseTime.getTime() + 1_000).toISOString(),
    }
    local.storage.setItem(STORAGE_KEY, serializeDraftEnvelope(newer))
    local.storage.setItem(
      `${STORAGE_KEY}:completed:${completed.draftId}`,
      completionTombstone(completed, { eventSlug: "created-event" }),
    )

    const { result } = await renderDraft()

    expect(result.current.state.name).toBe("Newer setup edits")
    expect(result.current.envelope.draftId).not.toBe(completed.draftId)
    expect(result.current.persistenceStatus).toBe("saved")
    expect(result.current.conflictMessage).toMatch(/newer edits were saved/i)
    expect(result.current.recentCompletedEventSlug).toBe("created-event")
  })

  it("keeps hydration unavailable when completed edits cannot be rotated", async () => {
    const { local, session } = useControlledStorages()
    const baseTime = new Date(Date.now() - 60_000)
    const completed = createDraftEnvelope(draftState("Created version"), {
      draftId: "55555555-5555-4555-8555-555555555555",
      now: baseTime,
    })
    const newer = {
      ...completed,
      revision: 1,
      state: draftState("Unsaved newer setup"),
      savedAt: new Date(baseTime.getTime() + 1_000).toISOString(),
    }
    local.storage.setItem(STORAGE_KEY, serializeDraftEnvelope(newer))
    local.storage.setItem(
      `${STORAGE_KEY}:completed:${completed.draftId}`,
      completionTombstone(completed),
    )
    local.setBlocked(true)
    session.setBlocked(true)

    const { result } = await renderDraft()

    expect(result.current.envelope.draftId).toBe(completed.draftId)
    expect(result.current.persistenceStatus).toBe("unavailable")
    expect(result.current.conflictMessage).toMatch(/newer edits could not be saved/i)
  })

  it("records a durable conflict completion and blocks duplicate edits", async () => {
    const { result } = await renderDraft()
    const expected = result.current.getCurrentEnvelope()
    let recovery: ReturnType<typeof result.current.preserveDraftAfterConflict>
    act(() => {
      recovery = result.current.preserveDraftAfterConflict(
        expected,
        "created-event",
      )
    })

    expect(recovery!).toBe("completed")
    expect(result.current.persistenceStatus).toBe("completed")
    expect(result.current.ensureSavedDraft()).toBe("completed")
    const before = result.current.getCurrentEnvelope()
    act(() => {
      result.current.replaceState({ ...result.current.state, name: "Duplicate" })
    })
    expect(result.current.getCurrentEnvelope()).toEqual(before)
    const error = captureError(() => {
      result.current.patchState(before.revision, { name: "Duplicate" })
    })
    expect(error).toMatchObject({ code: "draft_completed" })
  })

  it("rotates a submitted snapshot into a separate saved draft", async () => {
    const { result } = await renderDraft()
    const expected = result.current.getCurrentEnvelope()
    let recovery: ReturnType<typeof result.current.preserveDraftAfterConflict>
    act(() => {
      recovery = result.current.preserveDraftAfterConflict(
        expected,
        "created-event",
        { rotateSubmittedDraft: true },
      )
    })

    expect(recovery!).toBe("preserved")
    expect(result.current.envelope.draftId).not.toBe(expected.draftId)
    expect(result.current.persistenceStatus).toBe("saved")
    expect(result.current.conflictMessage).toMatch(/newer edits were saved/i)
  })

  it("reports preservation failure when no browser storage can rotate a submitted snapshot", async () => {
    const { local, session } = useControlledStorages()
    const { result } = await renderDraft()
    const expected = result.current.getCurrentEnvelope()
    local.setBlocked(true)
    session.setBlocked(true)
    let recovery: ReturnType<typeof result.current.preserveDraftAfterConflict>
    act(() => {
      recovery = result.current.preserveDraftAfterConflict(
        expected,
        "created-event",
        { rotateSubmittedDraft: true },
      )
    })

    expect(recovery!).toBe("preservation_failed")
    expect(result.current.persistenceStatus).toBe("unavailable")
    expect(result.current.conflictMessage).toMatch(/newer edits could not be saved/i)
  })

  it("reports completion failure when a lost response cannot be recorded", async () => {
    const { local, session } = useControlledStorages()
    const { result } = await renderDraft()
    const expected = result.current.getCurrentEnvelope()
    local.setBlocked(true)
    session.setBlocked(true)
    let recovery: ReturnType<typeof result.current.preserveDraftAfterConflict>
    act(() => {
      recovery = result.current.preserveDraftAfterConflict(
        expected,
        "created-event",
      )
    })

    expect(recovery!).toBe("completion_failed")
    expect(result.current.recentCompletedEventSlug).toBe("created-event")
    expect(result.current.persistenceStatus).toBe("unavailable")
    expect(result.current.conflictMessage).toMatch(/could not save that result/i)
  })

  it("uses every available storage when completing an unsaved recovery draft", async () => {
    const { result } = await renderDraft({ createIfMissing: false })
    const expected = result.current.getCurrentEnvelope()
    expect(result.current.persistenceStatus).toBe("unavailable")
    let completion: ReturnType<typeof result.current.clearSavedDraft>
    act(() => {
      completion = result.current.clearSavedDraft(expected, "created-event")
    })

    expect(completion!).toBe("cleared")
    expect(localStorage.getItem(STORAGE_KEY)).toContain(expected.draftId)
    expect(sessionStorage.getItem(STORAGE_KEY)).toContain(expected.draftId)
  })

  it("reports partial cleanup when the completion companion is durable but the primary key is blocked", async () => {
    const { local } = useControlledStorages()
    const { result } = await renderDraft()
    const expected = result.current.getCurrentEnvelope()
    local.rejectKeys((key) => key === STORAGE_KEY)
    let completion: ReturnType<typeof result.current.clearSavedDraft>
    act(() => {
      completion = result.current.clearSavedDraft(expected, "created-event")
    })

    expect(completion!).toBe("cleanup_failed")
    expect(
      local.values.get(`${STORAGE_KEY}:completed:${expected.draftId}`),
    ).toContain(expected.draftId)
  })
})
