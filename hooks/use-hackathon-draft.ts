"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useIsClient } from "@/hooks/use-is-client"
import {
  applyDraftPatch,
  createDraftEnvelope,
  HACKATHON_DRAFT_CLOCK_SKEW_MS,
  hackathonDraftStateSchema,
  parseStoredDraft,
  serializeDraftEnvelope,
  type DraftEnvelope,
  type DraftPatch,
  type DraftSource,
  type DraftState,
} from "@/lib/hackathon-draft"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import { isValidUuid } from "@/lib/utils/uuid"
import { isValidSlugFormat } from "@/lib/utils/slug"

type UseHackathonDraftOptions = {
  initialState: DraftState
  storageKey: string
  legacyStorageKeys?: string[]
  source?: DraftSource
  createInitialStateAfterMount?: () => DraftState
  createIfMissing?: boolean
}

const PENDING_DRAFT_ID = "pending-hydration"
const DRAFT_COMPLETION_EXPIRY_MS = 24 * 60 * 60 * 1_000
const NO_LEGACY_STORAGE_KEYS: string[] = []
const SCRATCH_SOURCE: DraftSource = { kind: "scratch", url: null }

type StoredDraftCandidate = NonNullable<ReturnType<typeof parseStoredDraft>> & {
  storage: Storage
  key: string
}

type StoredDraftCompletion = {
  completedDraft: DraftCompletionTombstone["completedDraft"]
  storage: Storage
  key: string
  raw: string
}

type DraftCompletionTombstone = {
  completedDraft: {
    draftId: string
    revision: number
    savedAt: string
    completedAt: string
    contentFingerprint?: string
    eventSlug?: string
  }
}

type DraftReconciliation =
  | { kind: "restored"; envelope: DraftEnvelope }
  | { kind: "forked"; envelope: DraftEnvelope }
  | { kind: "different" }
  | { kind: "conflict" }
  | { kind: "completed" }
  | null

type DraftCompletionResult =
  | "cleared"
  | "preserved"
  | "cleanup_failed"
  | "completion_failed"
  | "preservation_failed"

type DraftConflictRecoveryResult =
  | "completed"
  | "preserved"
  | "completion_failed"
  | "preservation_failed"
  | "already_rotated"

type DraftConflictRecoveryOptions = {
  rotateSubmittedDraft?: boolean
}

export function browserDraftStorages(): Storage[] {
  const storages: Storage[] = []
  try {
    if (globalThis.localStorage) storages.push(globalThis.localStorage)
  } catch {}
  try {
    if (globalThis.sessionStorage && !storages.includes(globalThis.sessionStorage)) {
      storages.push(globalThis.sessionStorage)
    }
  } catch {}
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage && !storages.includes(window.localStorage)) {
        storages.push(window.localStorage)
      }
    } catch {}
    try {
      if (window.sessionStorage && !storages.includes(window.sessionStorage)) {
        storages.push(window.sessionStorage)
      }
    } catch {}
  }
  return storages
}

function readStoredValue(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function removeStoredValue(storage: Storage, key: string): boolean {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function invalidateStoredValue(storage: Storage, key: string): boolean {
  removeStoredValue(storage, key)
  if (readStoredValue(storage, key) === null) return true
  try {
    storage.setItem(key, JSON.stringify({ completed: true }))
    return readStoredValue(storage, key) === JSON.stringify({ completed: true })
  } catch {
    return false
  }
}

function parseCompletionTombstone(raw: string): DraftCompletionTombstone | null {
  try {
    const value = JSON.parse(raw) as DraftCompletionTombstone
    const completed = value?.completedDraft
    const completedAt = completed
      ? new Date(completed.completedAt).getTime()
      : Number.NaN
    if (
      !completed ||
      !isValidUuid(completed.draftId) ||
      !Number.isInteger(completed.revision) ||
      completed.revision < 0 ||
      !Number.isFinite(new Date(completed.savedAt).getTime()) ||
      !Number.isFinite(completedAt) ||
      (completed.contentFingerprint !== undefined &&
        !/^[0-9a-f]{16}$/.test(completed.contentFingerprint)) ||
      (completed.eventSlug !== undefined &&
        (completed.eventSlug.length > 100 || !isValidSlugFormat(completed.eventSlug))) ||
      completedAt - Date.now() > HACKATHON_DRAFT_CLOCK_SKEW_MS ||
      Date.now() - completedAt >= DRAFT_COMPLETION_EXPIRY_MS
    ) return null
    return value
  } catch {
    return null
  }
}

function completionStorageKey(storageKey: string, draftId: string): string {
  return `${storageKey}:completed:${draftId}`
}

function branchStorageKey(storageKey: string, draftId: string): string {
  return `${storageKey}:branch:${draftId}`
}

function draftContentFingerprint(envelope: DraftEnvelope): string {
  const content = JSON.stringify({ state: envelope.state, source: envelope.source })
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")
  }`
}

function nextDraftSavedAt(previousSavedAt: string): string {
  const previous = new Date(previousSavedAt).getTime()
  return new Date(Math.max(
    Date.now(),
    Number.isFinite(previous) ? previous + 1 : 0,
  )).toISOString()
}

function writeCompletionTombstone(
  storage: Storage,
  key: string,
  expected: DraftEnvelope,
  eventSlug?: string,
): boolean {
  const safeEventSlug = eventSlug &&
    eventSlug.length <= 100 &&
    isValidSlugFormat(eventSlug)
    ? eventSlug
    : undefined
  const value = JSON.stringify({
    completedDraft: {
      draftId: expected.draftId,
      revision: expected.revision,
      savedAt: expected.savedAt,
      completedAt: new Date().toISOString(),
      contentFingerprint: draftContentFingerprint(expected),
      ...(safeEventSlug ? { eventSlug: safeEventSlug } : {}),
    },
  } satisfies DraftCompletionTombstone)
  try {
    storage.setItem(key, value)
    return readStoredValue(storage, key) === value
  } catch {
    return false
  }
}

function isNewerDraft(
  candidate: DraftEnvelope,
  current: DraftEnvelope,
): boolean {
  if (
    candidate.draftId === current.draftId &&
    candidate.revision !== current.revision
  ) return candidate.revision > current.revision
  const candidateSavedAt = new Date(candidate.savedAt).getTime()
  const currentSavedAt = new Date(current.savedAt).getTime()
  if (candidateSavedAt !== currentSavedAt) return candidateSavedAt > currentSavedAt
  return candidate.revision > current.revision
}

function hasSameDraftContent(
  candidate: DraftEnvelope,
  current: DraftEnvelope,
): boolean {
  return (
    candidate.draftId === current.draftId &&
    JSON.stringify(candidate.state) === JSON.stringify(current.state) &&
    JSON.stringify(candidate.source) === JSON.stringify(current.source)
  )
}

function hasDivergentRevision(
  candidate: DraftEnvelope,
  current: DraftEnvelope,
): boolean {
  return (
    candidate.draftId === current.draftId &&
    candidate.revision === current.revision &&
    !hasSameDraftContent(candidate, current)
  )
}

function compareDraftRecency(
  left: DraftEnvelope,
  right: DraftEnvelope,
): number {
  if (left.draftId === right.draftId && left.revision !== right.revision) {
    return right.revision - left.revision
  }
  const savedAtDifference =
    new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime()
  if (savedAtDifference !== 0) return savedAtDifference
  return right.revision - left.revision
}

function shouldRestoreDraft(
  candidate: DraftEnvelope,
  current: DraftEnvelope,
): boolean {
  if (candidate.draftId !== current.draftId) return false
  if (hasDivergentRevision(candidate, current)) return false
  if (isNewerDraft(candidate, current)) return true
  return false
}

function readStoredDraftCandidates({
  storages,
  keys,
  source,
  migrationDraftId,
}: {
  storages: Storage[]
  keys: string[]
  source: DraftSource
  migrationDraftId: string
}): StoredDraftCandidate[] {
  const candidates: StoredDraftCandidate[] = []
  for (const storage of storages) {
    const candidateKeys = new Set(keys)
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (
          key &&
          keys.some((baseKey) => key.startsWith(`${baseKey}:branch:`))
        ) candidateKeys.add(key)
      }
    } catch {}
    for (const key of candidateKeys) {
      const raw = readStoredValue(storage, key)
      if (!raw) continue
      const parsed = parseStoredDraft(raw, {
        sourceUrl: source.url ?? undefined,
        draftId: migrationDraftId,
      })
      if (parsed) candidates.push({ ...parsed, storage, key })
    }
  }
  const grouped = new Map<string, StoredDraftCandidate[]>()
  for (const candidate of candidates) {
    const group = grouped.get(candidate.envelope.draftId) ?? []
    group.push(candidate)
    grouped.set(candidate.envelope.draftId, group)
  }
  const groups = [...grouped.entries()].map(([draftId, group]) => ({
    draftId,
    candidates: group.sort((left, right) =>
      compareDraftRecency(left.envelope, right.envelope),
    ),
  }))
  groups.sort((left, right) => {
    const leftSavedAt = new Date(left.candidates[0].envelope.savedAt).getTime()
    const rightSavedAt = new Date(right.candidates[0].envelope.savedAt).getTime()
    if (leftSavedAt !== rightSavedAt) return rightSavedAt - leftSavedAt
    return left.draftId.localeCompare(right.draftId)
  })
  return groups.flatMap((group) => group.candidates)
}

function readStoredDraftCompletions(
  storages: Storage[],
  keys: string[],
  draftIds: string[] = [],
): StoredDraftCompletion[] {
  const completions: StoredDraftCompletion[] = []
  const searchKeys = new Set(keys)
  for (const draftId of draftIds) {
    for (const key of keys) searchKeys.add(completionStorageKey(key, draftId))
  }
  for (const storage of storages) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (
          key &&
          keys.some((baseKey) =>
            key.startsWith(`${baseKey}:branch:`) ||
            key.startsWith(`${baseKey}:completed:`),
          )
        ) searchKeys.add(key)
      }
    } catch {}
  }
  for (const key of searchKeys) {
    for (const storage of storages) {
      const raw = readStoredValue(storage, key)
      if (!raw) continue
      const completedDraft = parseCompletionTombstone(raw)?.completedDraft
      if (completedDraft) {
        completions.push({ completedDraft, storage, key, raw })
        for (const baseKey of keys) {
          searchKeys.add(completionStorageKey(baseKey, completedDraft.draftId))
        }
      }
    }
  }
  return completions.sort((left, right) =>
    new Date(right.completedDraft.completedAt).getTime() -
    new Date(left.completedDraft.completedAt).getTime(),
  )
}

function hasEditsAfterCompletion(
  current: DraftEnvelope,
  completed: DraftCompletionTombstone["completedDraft"],
): boolean {
  if (completed.contentFingerprint) {
    return completed.contentFingerprint !== draftContentFingerprint(current)
  }
  return (
    current.revision > completed.revision ||
    (current.revision === completed.revision && current.savedAt !== completed.savedAt)
  )
}

export function useHackathonDraft({
  initialState,
  storageKey,
  legacyStorageKeys = NO_LEGACY_STORAGE_KEYS,
  source = SCRATCH_SOURCE,
  createInitialStateAfterMount,
  createIfMissing = true,
}: UseHackathonDraftOptions) {
  const isClient = useIsClient()
  const [hydrated, setHydrated] = useState(false)
  const [envelope, setEnvelope] = useState<DraftEnvelope>(() =>
    createDraftEnvelope(initialState, {
      draftId: PENDING_DRAFT_ID,
      source,
      now: new Date(0),
    }),
  )
  const envelopeRef = useRef(envelope)
  const hydratedRef = useRef(false)
  const completedDraftRef = useRef(false)
  const pendingCompletionRef = useRef<DraftEnvelope | null>(null)
  const preferredStorageRef = useRef<Storage | null>(null)
  const preferredStorageKeyRef = useRef(storageKey)
  const [persistenceStatus, setPersistenceStatus] = useState<
    "pending" | "saved" | "unavailable" | "conflict" | "completed"
  >("pending")
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [hasStoredDraft, setHasStoredDraft] = useState<boolean | null>(null)
  const [recentCompletedEventSlug, setRecentCompletedEventSlug] = useState<string | null>(null)

  const storageKeys = useMemo(
    () => [storageKey, ...legacyStorageKeys.filter((key) => key !== storageKey)],
    [legacyStorageKeys, storageKey],
  )

  const persistEnvelope = useCallback((
    next: DraftEnvelope,
    replaceDraftId?: string,
  ) => {
    try {
      const serialized = serializeDraftEnvelope(next)
      const storages = browserDraftStorages()
      const preferred = preferredStorageRef.current
      const preferredKey = preferredStorageKeyRef.current
      const targets = [
        ...(preferred ? [{ storage: preferred, key: preferredKey }] : []),
        ...storages.flatMap((storage) =>
          storage === preferred && preferredKey === storageKey
            ? []
            : [{ storage, key: storageKey }],
        ),
      ]
      for (const { storage, key } of targets) {
        const raw = readStoredValue(storage, key)
        if (raw) {
          const completed = parseCompletionTombstone(raw)?.completedDraft
          if (completed?.draftId === next.draftId) continue
          if (completed) {
            const completionKey = completionStorageKey(key, completed.draftId)
            try {
              storage.setItem(completionKey, raw)
              if (readStoredValue(storage, completionKey) !== raw) continue
            } catch {
              continue
            }
          }
          const parsed = parseStoredDraft(raw, {
            sourceUrl: source.url ?? undefined,
            draftId: next.draftId,
          })
          if (
            parsed &&
            parsed.envelope.draftId !== next.draftId &&
            parsed.envelope.draftId !== replaceDraftId
          ) continue
        }
        try {
          storage.setItem(key, serialized)
          if (readStoredValue(storage, key) !== serialized) continue
          preferredStorageRef.current = storage
          preferredStorageKeyRef.current = key
          return true
        } catch {}
      }
      return false
    } catch {
      return false
    }
  }, [source.url, storageKey])

  const persistForkedEnvelope = useCallback((next: DraftEnvelope) => {
    const key = branchStorageKey(storageKey, next.draftId)
    const serialized = serializeDraftEnvelope(next)
    for (const storage of browserDraftStorages()) {
      try {
        storage.setItem(key, serialized)
        if (readStoredValue(storage, key) !== serialized) continue
        preferredStorageRef.current = storage
        preferredStorageKeyRef.current = key
        return true
      } catch {}
    }
    return false
  }, [storageKey])

  const rotatePendingCompletion = useCallback(() => {
    const pending = pendingCompletionRef.current
    const current = envelopeRef.current
    if (!pending || pending.draftId !== current.draftId) return current
    const rotated: DraftEnvelope = {
      ...current,
      draftId: crypto.randomUUID(),
      revision: 0,
      savedAt: nextDraftSavedAt(current.savedAt),
    }
    pendingCompletionRef.current = null
    completedDraftRef.current = false
    envelopeRef.current = rotated
    setEnvelope(rotated)
    setPersistenceStatus(
      persistEnvelope(rotated, current.draftId) ? "saved" : "unavailable",
    )
    setConflictMessage(
      "The created event is safe. Your new edit is now in a separate draft.",
    )
    return rotated
  }, [persistEnvelope])

  useEffect(() => {
    if (!isClient || hydrated) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const draftId = crypto.randomUUID()
      const storages = browserDraftStorages()
      const keys = [storageKey, ...legacyStorageKeys.filter((key) => key !== storageKey)]
      let candidates = readStoredDraftCandidates({
        storages,
        keys,
        source,
        migrationDraftId: draftId,
      })
      const completions = readStoredDraftCompletions(
        storages,
        keys,
        candidates.map((candidate) => candidate.envelope.draftId),
      )
      setRecentCompletedEventSlug(
        completions.find((completion) => completion.completedDraft.eventSlug)
          ?.completedDraft.eventSlug ?? null,
      )
      let recoveredCompletedDraft = false
      let completionPreservationFailed = false
      candidates = candidates.flatMap((candidate) => {
        const completion = completions.find(
          (value) => value.completedDraft.draftId === candidate.envelope.draftId,
        )
        if (!completion) return [candidate]
        if (!hasEditsAfterCompletion(candidate.envelope, completion.completedDraft)) {
          try {
            candidate.storage.setItem(candidate.key, completion.raw)
          } catch {}
          return []
        }

        const recovered: DraftEnvelope = {
          ...candidate.envelope,
          draftId: crypto.randomUUID(),
          revision: 0,
          savedAt: nextDraftSavedAt(candidate.envelope.savedAt),
        }
        const serialized = serializeDraftEnvelope(recovered)
        try {
          candidate.storage.setItem(candidate.key, serialized)
          if (readStoredValue(candidate.storage, candidate.key) === serialized) {
            recoveredCompletedDraft = true
            return [{ ...candidate, envelope: recovered, migrated: false }]
          }
        } catch {}
        completionPreservationFailed = true
        return [candidate]
      })
      const stored = candidates[0] ?? null
      const hasDifferentDraftIds = Boolean(
        stored && candidates.some(
          (candidate) => candidate.envelope.draftId !== stored.envelope.draftId,
        ),
      )
      const hasDivergentCopies = Boolean(
        stored && candidates.some((candidate) =>
          hasDivergentRevision(candidate.envelope, stored.envelope),
        ),
      )
      let selectedDifferentDraft = false
      if (hasDifferentDraftIds && stored) {
        if (stored.key.startsWith(`${storageKey}:branch:`)) {
          preferredStorageRef.current = stored.storage
          preferredStorageKeyRef.current = stored.key
          selectedDifferentDraft = true
        } else {
          selectedDifferentDraft = persistForkedEnvelope(stored.envelope)
        }
      }
      const hasStorageConflict =
        (hasDifferentDraftIds && !selectedDifferentDraft) || hasDivergentCopies

      for (const storage of storages) {
        const raw = readStoredValue(storage, storageKey)
        if (
          raw &&
          !parseCompletionTombstone(raw) &&
          !parseStoredDraft(raw, {
            sourceUrl: source.url ?? undefined,
            draftId,
          })
        ) {
          invalidateStoredValue(storage, storageKey)
        }
      }

      let mountedInitialState = initialState
      if (!stored && createInitialStateAfterMount) {
        try {
          mountedInitialState = createInitialStateAfterMount()
        } catch {
          mountedInitialState = initialState
        }
      }
      let next = stored?.envelope ?? createDraftEnvelope(mountedInitialState, {
        draftId,
        source,
      })
      const replacedInvalidDraftId = !isValidUuid(next.draftId)
      if (replacedInvalidDraftId) {
        next = { ...next, draftId }
      }

      const shouldAvoidPromotion =
        hasDifferentDraftIds || hasDivergentCopies ||
        recoveredCompletedDraft || completionPreservationFailed
      if (!selectedDifferentDraft) {
        if (shouldAvoidPromotion && stored) {
          preferredStorageRef.current = stored.storage
          preferredStorageKeyRef.current = stored.key
        } else {
          preferredStorageRef.current = null
          preferredStorageKeyRef.current = storageKey
        }
      }
      const alreadySavedAtPrimary =
        !shouldAvoidPromotion &&
        stored?.storage === storages[0] &&
        stored.key === storageKey &&
        stored.migrated === false &&
        !replacedInvalidDraftId
      if (alreadySavedAtPrimary && stored) {
        preferredStorageRef.current = stored.storage
        preferredStorageKeyRef.current = stored.key
      }
      const saved = !stored && !createIfMissing
        ? false
        : shouldAvoidPromotion
          ? Boolean(stored) && !completionPreservationFailed
          : alreadySavedAtPrimary || persistEnvelope(
              next,
              replacedInvalidDraftId ? stored?.envelope.draftId : undefined,
            )
      if (saved && !shouldAvoidPromotion) {
        for (const candidate of candidates) {
          if (
            candidate.envelope.draftId === next.draftId &&
            (candidate.storage !== preferredStorageRef.current || candidate.key !== storageKey)
          ) invalidateStoredValue(candidate.storage, candidate.key)
        }
      }
      envelopeRef.current = next
      hydratedRef.current = true
      setEnvelope(next)
      setHasStoredDraft(Boolean(stored))
      setPersistenceStatus(
        completionPreservationFailed
          ? "unavailable"
          : hasStorageConflict
            ? "conflict"
            : saved
              ? "saved"
              : "unavailable",
      )
      setConflictMessage(
        completionPreservationFailed
          ? "An event was created in another tab, but newer edits could not be saved. Keep this page open."
          : hasDifferentDraftIds
            ? selectedDifferentDraft
              ? "Two saved drafts were found. We opened the newest copy. The other copy is safe."
              : "Two saved drafts were found. Both copies are safe, but review them before you create an event."
            : hasDivergentCopies
              ? "This draft has different edits in another tab. Keep this page open and review both copies before reloading."
              : stored?.sanitized
                ? "Some details in this older draft were too long or unsafe. We kept the rest. Review it before you create the event."
              : recoveredCompletedDraft
                ? "An event was created in another tab. Newer edits were saved as a new draft."
                : null,
      )
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [
    createInitialStateAfterMount,
    createIfMissing,
    hydrated,
    initialState,
    isClient,
    legacyStorageKeys,
    persistEnvelope,
    persistForkedEnvelope,
    source,
    storageKey,
  ])

  const reconcileCompletion = useCallback((
    current: DraftEnvelope,
    completed: DraftCompletionTombstone["completedDraft"],
  ): DraftReconciliation => {
    if (!hasEditsAfterCompletion(current, completed)) {
      completedDraftRef.current = true
      setRecentCompletedEventSlug(completed.eventSlug ?? null)
      setPersistenceStatus("completed")
      setConflictMessage(
        "This event was created in another tab. Reload to start a new draft.",
      )
      return { kind: "completed" }
    }

    const recovered: DraftEnvelope = {
      ...current,
      draftId: crypto.randomUUID(),
      revision: 0,
      savedAt: nextDraftSavedAt(current.savedAt),
    }
    if (!persistEnvelope(recovered, current.draftId)) {
      setPersistenceStatus("unavailable")
      setConflictMessage(
        "This event was created in another tab, but newer edits could not be saved. Keep this page open.",
      )
      return { kind: "conflict" }
    }

    completedDraftRef.current = false
    envelopeRef.current = recovered
    setEnvelope(recovered)
    setPersistenceStatus("saved")
    setConflictMessage(
      "This event was created in another tab. Newer edits were saved as a new draft.",
    )
    return { kind: "restored", envelope: recovered }
  }, [persistEnvelope])

  const forkConflictingDraft = useCallback((
    current: DraftEnvelope,
  ): DraftReconciliation => {
    const forked: DraftEnvelope = {
      ...current,
      draftId: crypto.randomUUID(),
      revision: 0,
      savedAt: nextDraftSavedAt(current.savedAt),
    }
    if (!persistForkedEnvelope(forked)) {
      setPersistenceStatus("conflict")
      setConflictMessage(
        "This draft has different edits in another tab. Keep this page open so your copy is not lost.",
      )
      return { kind: "conflict" }
    }
    envelopeRef.current = forked
    setEnvelope(forked)
    setPersistenceStatus("saved")
    setConflictMessage(
      "This draft had different edits in another tab. Your copy was saved as a separate draft.",
    )
    return { kind: "forked", envelope: forked }
  }, [persistForkedEnvelope])

  useEffect(() => {
    if (!isClient || !hydrated) return
    const handleStorage = (event: StorageEvent) => {
      const current = envelopeRef.current
      const activeKey = preferredStorageKeyRef.current
      const activeCompletionKey = completionStorageKey(activeKey, current.draftId)
      if (
        !hydratedRef.current ||
        (event.key !== storageKey &&
          event.key !== activeKey &&
          event.key !== activeCompletionKey)
      ) return
      if (completedDraftRef.current) return
      if (event.newValue === null) {
        setPersistenceStatus("conflict")
        setConflictMessage(
          "This draft changed in another tab. Reload before you keep editing.",
        )
        return
      }
      const completed = parseCompletionTombstone(event.newValue)
      if (completed?.completedDraft.draftId === current.draftId) {
        reconcileCompletion(current, completed.completedDraft)
        return
      }
      if (completed) return
      const parsed = parseStoredDraft(event.newValue, {
        sourceUrl: source.url ?? undefined,
        draftId: crypto.randomUUID(),
      })
      if (!parsed) {
        setPersistenceStatus("conflict")
        setConflictMessage(
          "This draft changed in another tab. Reload before you keep editing.",
        )
        return
      }
      if (parsed.envelope.draftId !== current.draftId) {
        forkConflictingDraft(current)
        return
      }
      if (hasDivergentRevision(parsed.envelope, current)) {
        forkConflictingDraft(current)
        return
      }
      if (!shouldRestoreDraft(parsed.envelope, current)) return
      completedDraftRef.current = false
      envelopeRef.current = parsed.envelope
      setEnvelope(parsed.envelope)
      setPersistenceStatus("saved")
      setConflictMessage(
        "This draft changed in another tab. We restored the newest version.",
      )
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [forkConflictingDraft, hydrated, isClient, reconcileCompletion, source.url, storageKey])

  const restoreNewerStoredDraft = useCallback((): DraftReconciliation => {
    const current = envelopeRef.current
    const storages = browserDraftStorages()
    const completion = readStoredDraftCompletions(
      storages,
      storageKeys,
      [current.draftId],
    ).find((value) => value.completedDraft.draftId === current.draftId)
    if (completion) {
      return reconcileCompletion(current, completion.completedDraft)
    }
    const candidates = readStoredDraftCandidates({
      storages,
      keys: storageKeys,
      source,
      migrationDraftId: current.draftId,
    })
    const isForkedDraft = preferredStorageKeyRef.current.startsWith(
      `${storageKey}:branch:`,
    )
    if (
      !isForkedDraft &&
      candidates.some((candidate) => candidate.envelope.draftId !== current.draftId)
    ) {
      return forkConflictingDraft(current)
    }
    if (candidates.some((candidate) =>
      hasDivergentRevision(candidate.envelope, current),
    )) {
      setPersistenceStatus("conflict")
      setConflictMessage(
        "This draft has different edits in another tab. Keep this page open and review both copies before reloading.",
      )
      return { kind: "conflict" }
    }
    const newest = candidates.find(
      (candidate) => candidate.envelope.draftId === current.draftId,
    ) ?? candidates[0] ?? null
    if (!newest) return null
    if (newest.envelope.draftId !== current.draftId) {
      return forkConflictingDraft(current)
    }
    if (!shouldRestoreDraft(newest.envelope, current)) return null
    envelopeRef.current = newest.envelope
    setEnvelope(newest.envelope)
    setPersistenceStatus("saved")
    setConflictMessage(
      "This draft changed in another tab. We restored the newest version.",
    )
    return { kind: "restored", envelope: newest.envelope }
  }, [forkConflictingDraft, reconcileCompletion, source, storageKey, storageKeys])

  const replaceState = useCallback((nextState: DraftState) => {
    if (completedDraftRef.current) return envelopeRef.current
    rotatePendingCompletion()
    const reconciliation = restoreNewerStoredDraft()
    if (reconciliation) {
      return reconciliation.kind === "restored"
        ? reconciliation.envelope
        : envelopeRef.current
    }
    const current = envelopeRef.current
    const parsed = hackathonDraftStateSchema.safeParse(nextState)
    if (!parsed.success) {
      setConflictMessage(
        "That change is too long or isn't valid. Shorten it and try again.",
      )
      return current
    }
    const next: DraftEnvelope = {
      ...current,
      revision: current.revision + 1,
      state: parsed.data,
      savedAt: nextDraftSavedAt(current.savedAt),
    }
    envelopeRef.current = next
    setPersistenceStatus(persistEnvelope(next) ? "saved" : "unavailable")
    setConflictMessage(null)
    setEnvelope(next)
    return next
  }, [persistEnvelope, restoreNewerStoredDraft, rotatePendingCompletion])

  const updateState = useCallback((updater: (state: DraftState) => DraftState) => {
    if (completedDraftRef.current) return envelopeRef.current
    rotatePendingCompletion()
    const reconciliation = restoreNewerStoredDraft()
    if (
      reconciliation &&
      reconciliation.kind !== "restored" &&
      reconciliation.kind !== "forked"
    ) {
      return envelopeRef.current
    }
    const current = reconciliation?.kind === "restored" || reconciliation?.kind === "forked"
      ? reconciliation.envelope
      : envelopeRef.current
    let updatedState: DraftState
    try {
      updatedState = updater(current.state)
    } catch {
      setConflictMessage("That change could not be applied. Try it again.")
      return current
    }
    const parsed = hackathonDraftStateSchema.safeParse(updatedState)
    if (!parsed.success) {
      setConflictMessage(
        "That change is too long or isn't valid. Shorten it and try again.",
      )
      return current
    }
    const next: DraftEnvelope = {
      ...current,
      revision: current.revision + 1,
      state: parsed.data,
      savedAt: nextDraftSavedAt(current.savedAt),
    }
    envelopeRef.current = next
    setPersistenceStatus(persistEnvelope(next) ? "saved" : "unavailable")
    setConflictMessage(
      reconciliation?.kind === "restored"
        ? "This draft changed in another tab. Your edit was added to the newest version."
        : reconciliation?.kind === "forked"
          ? "This draft had different edits in another tab. Your copy was saved as a separate draft."
        : null,
    )
    setEnvelope(next)
    return next
  }, [persistEnvelope, restoreNewerStoredDraft, rotatePendingCompletion])

  const patchState = useCallback((expectedRevision: number, patch: DraftPatch) => {
    if (completedDraftRef.current) {
      throw new WebMcpRequestError({
        code: "draft_completed",
        message: "This event was created in another tab. Reload to start a new draft.",
        retryable: false,
      })
    }
    if (pendingCompletionRef.current) {
      const rotated = rotatePendingCompletion()
      throw new WebMcpRequestError({
        code: "stale_revision",
        message: `The draft is now at revision ${rotated.revision}. Read it again before updating.`,
        retryable: true,
      })
    }
    const reconciliation = restoreNewerStoredDraft()
    if (reconciliation) {
      throw new WebMcpRequestError({
        code:
          reconciliation.kind === "completed"
            ? "draft_completed"
              : reconciliation.kind === "different" || reconciliation.kind === "conflict"
                ? "draft_conflict"
                : "stale_revision",
        message:
          reconciliation.kind === "completed"
            ? "This event was created in another tab. Reload to start a new draft."
            : reconciliation.kind === "different"
              ? "Another draft is open in another tab. Reload before updating."
              : reconciliation.kind === "conflict"
                ? "This draft has different edits in another tab. Review both copies before updating."
              : `The draft is now at revision ${reconciliation.envelope.revision}. Read it again before updating.`,
        retryable: reconciliation.kind === "restored" || reconciliation.kind === "forked",
      })
    }
    const result = applyDraftPatch(envelopeRef.current, expectedRevision, patch)
    if (!result.ok) {
      throw new WebMcpRequestError({
        code: result.code,
        message: result.message,
        retryable: result.code === "stale_revision",
      })
    }
    envelopeRef.current = result.envelope
    const saved = persistEnvelope(result.envelope)
    setPersistenceStatus(saved ? "saved" : "unavailable")
    setConflictMessage(saved
      ? null
      : "This change is shown here, but browser storage couldn't save it.")
    setEnvelope(result.envelope)
    if (!saved) {
      throw new WebMcpRequestError({
        code: "storage_unavailable",
        message: "Turn on browser storage, then try again.",
        retryable: false,
      })
    }
    return result.envelope
  }, [persistEnvelope, restoreNewerStoredDraft, rotatePendingCompletion])

  const ensureSavedDraft = useCallback(():
    "saved" | "conflict" | "unavailable" | "completed" => {
    if (!hydratedRef.current) return "unavailable"
    if (completedDraftRef.current) return "completed"
    const reconciliation = restoreNewerStoredDraft()
    if (reconciliation) {
      return reconciliation.kind === "completed"
        ? "completed"
        : reconciliation.kind === "forked"
          ? "saved"
          : "conflict"
    }
    const saved = persistEnvelope(envelopeRef.current)
    setPersistenceStatus(saved ? "saved" : "unavailable")
    return saved ? "saved" : "unavailable"
  }, [persistEnvelope, restoreNewerStoredDraft])

  const preserveDraftAfterConflict = useCallback((
    expected: DraftEnvelope,
    eventSlug?: string,
    options?: DraftConflictRecoveryOptions,
  ):
    DraftConflictRecoveryResult => {
    if (typeof window === "undefined") return "preservation_failed"
    const current = envelopeRef.current
    if (current.draftId !== expected.draftId) return "already_rotated"

    const keys = [storageKey, ...legacyStorageKeys.filter((key) => key !== storageKey)]
    const storages = browserDraftStorages()
    const candidates = readStoredDraftCandidates({
      storages,
      keys,
      source,
      migrationDraftId: expected.draftId,
    })
    const sameDraftCandidates = [current, ...candidates.map((candidate) => candidate.envelope)]
      .filter((candidate) => candidate.draftId === expected.draftId)
      .sort(compareDraftRecency)
    const divergent = sameDraftCandidates.find(
      (candidate) => !hasSameDraftContent(candidate, expected),
    )
    const draftToPreserve = divergent ?? (
      options?.rotateSubmittedDraft
        ? sameDraftCandidates[0] ?? expected
        : null
    )

    if (draftToPreserve) {
      const preserved: DraftEnvelope = {
        ...draftToPreserve,
        draftId: crypto.randomUUID(),
        revision: 0,
        savedAt: nextDraftSavedAt(draftToPreserve.savedAt),
      }
      const saved =
        persistEnvelope(preserved, expected.draftId) ||
        persistForkedEnvelope(preserved)
      if (!saved) {
        completedDraftRef.current = false
        setPersistenceStatus("unavailable")
        setConflictMessage(
          "This event was created, but newer edits could not be saved. Keep this page open.",
        )
        return "preservation_failed"
      }

      const completionTargets: { storage: Storage; key: string }[] = []
      const addCompletionTarget = (storage: Storage, key: string) => {
        if (!completionTargets.some((target) =>
          target.storage === storage && target.key === key
        )) completionTargets.push({ storage, key })
      }
      for (const storage of storages) {
        for (const key of keys) addCompletionTarget(storage, key)
      }
      for (const candidate of candidates) {
        addCompletionTarget(candidate.storage, candidate.key)
      }
      for (const target of completionTargets) {
        writeCompletionTombstone(
          target.storage,
          completionStorageKey(target.key, expected.draftId),
          expected,
          eventSlug,
        )
      }
      for (const candidate of candidates) {
        const raw = readStoredValue(candidate.storage, candidate.key)
        if (!raw) continue
        const stored = parseStoredDraft(raw, {
          sourceUrl: source.url ?? undefined,
          draftId: expected.draftId,
        })?.envelope
        if (stored && hasSameDraftContent(stored, expected)) {
          writeCompletionTombstone(candidate.storage, candidate.key, expected, eventSlug)
        }
      }

      completedDraftRef.current = false
      pendingCompletionRef.current = null
      setRecentCompletedEventSlug(eventSlug ?? null)
      envelopeRef.current = preserved
      setEnvelope(preserved)
      setPersistenceStatus("saved")
      setConflictMessage(
        "The event was created. Newer edits were saved as a new draft.",
      )
      return "preserved"
    }

    let durableCompletions = 0
    const targets: { storage: Storage; key: string }[] = []
    const addTarget = (storage: Storage, key: string) => {
      if (!targets.some((target) => target.storage === storage && target.key === key)) {
        targets.push({ storage, key })
      }
    }
    for (const storage of storages) {
      for (const key of keys) addTarget(storage, completionStorageKey(key, expected.draftId))
    }
    for (const candidate of candidates) {
      if (candidate.envelope.draftId === expected.draftId) {
        addTarget(candidate.storage, candidate.key)
      }
    }
    for (const target of targets) {
      if (writeCompletionTombstone(target.storage, target.key, expected, eventSlug)) {
        durableCompletions += 1
      }
    }
    if (durableCompletions === 0) {
      completedDraftRef.current = false
      if (
        eventSlug &&
        eventSlug.length <= 100 &&
        isValidSlugFormat(eventSlug)
      ) setRecentCompletedEventSlug(eventSlug)
      setPersistenceStatus("unavailable")
      setConflictMessage(
        "This event was created, but we could not save that result. Keep this page open.",
      )
      return "completion_failed"
    }

    completedDraftRef.current = true
    setRecentCompletedEventSlug(eventSlug ?? null)
    pendingCompletionRef.current = null
    setPersistenceStatus("completed")
    setConflictMessage(
      "This event was already created. We're opening it now.",
    )
    return "completed"
  }, [
    legacyStorageKeys,
    persistEnvelope,
    persistForkedEnvelope,
    source,
    storageKey,
  ])

  const clearSavedDraft = useCallback((
    expected: DraftEnvelope,
    eventSlug?: string,
  ): DraftCompletionResult => {
    if (typeof window === "undefined") return "preservation_failed"
    const keys = [storageKey, ...legacyStorageKeys.filter((key) => key !== storageKey)]
    const storages = browserDraftStorages()
    const candidates = readStoredDraftCandidates({
      storages,
      keys,
      source,
      migrationDraftId: expected.draftId,
    })
    const current = envelopeRef.current
    const hasDifferentDraft =
      current.draftId !== expected.draftId ||
      candidates.some((candidate) => candidate.envelope.draftId !== expected.draftId)
    const sameDraftCandidates = [current, ...candidates.map((candidate) => candidate.envelope)]
      .filter((candidate) => candidate.draftId === expected.draftId)
      .sort(compareDraftRecency)
    const divergent = sameDraftCandidates.find(
      (candidate) => !hasSameDraftContent(candidate, expected),
    )
    if (divergent) {
      const preserved: DraftEnvelope = {
        ...divergent,
        draftId: crypto.randomUUID(),
        revision: 0,
        savedAt: nextDraftSavedAt(divergent.savedAt),
      }
      const saved = persistEnvelope(preserved, expected.draftId)
      if (saved) {
        pendingCompletionRef.current = null
        completedDraftRef.current = false
        envelopeRef.current = preserved
        setEnvelope(preserved)
        setPersistenceStatus("saved")
        setConflictMessage(
          "The event was created. Newer edits were saved as a new draft.",
        )
        return "preserved"
      }
      completedDraftRef.current = false
      envelopeRef.current = preserved
      setEnvelope(preserved)
      setPersistenceStatus("unavailable")
      setConflictMessage(
        hasDifferentDraft
          ? "The event was created, but another saved draft blocked newer edits from being stored. Keep this page open."
          : "The event was created, but newer edits could not be stored. Keep this page open.",
      )
      return "preservation_failed"
    }

    completedDraftRef.current = true
    setRecentCompletedEventSlug(eventSlug ?? null)
    pendingCompletionRef.current = null
    setPersistenceStatus("completed")
    let cleared = true
    let durableCompletions = 0
    const targets: { storage: Storage; key: string }[] = []
    const addTarget = (storage: Storage, key: string) => {
      if (!targets.some((target) => target.storage === storage && target.key === key)) {
        targets.push({ storage, key })
      }
    }
    for (const candidate of candidates) {
      if (candidate.envelope.draftId === expected.draftId) {
        addTarget(candidate.storage, candidate.key)
      }
    }
    if (current.draftId === expected.draftId && preferredStorageRef.current) {
      addTarget(preferredStorageRef.current, preferredStorageKeyRef.current)
    }
    if (targets.length === 0) {
      for (const storage of storages) addTarget(storage, storageKey)
    }
    for (const { storage, key } of targets) {
      const companionWritten = writeCompletionTombstone(
        storage,
        completionStorageKey(key, expected.draftId),
        expected,
        eventSlug,
      )
      const primaryWritten = writeCompletionTombstone(storage, key, expected, eventSlug)
      if (companionWritten || primaryWritten) durableCompletions += 1
      cleared = companionWritten && primaryWritten && cleared
    }
    if (durableCompletions === 0) {
      completedDraftRef.current = false
      pendingCompletionRef.current = expected
      setPersistenceStatus("unavailable")
      setConflictMessage(
        "Your event was created, but we couldn't finish saving that result. Keep this page open and try again.",
      )
      return "completion_failed"
    }
    return cleared ? "cleared" : "cleanup_failed"
  }, [legacyStorageKeys, persistEnvelope, source, storageKey])

  const getCurrentEnvelope = useCallback(() => envelopeRef.current, [])

  return {
    envelope,
    state: envelope.state,
    hydrated,
    persistenceStatus,
    conflictMessage,
    hasStoredDraft,
    recentCompletedEventSlug,
    replaceState,
    updateState,
    patchState,
    ensureSavedDraft,
    getCurrentEnvelope,
    preserveDraftAfterConflict,
    clearSavedDraft,
  }
}
