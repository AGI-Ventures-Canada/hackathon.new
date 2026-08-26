export type OrganizationCreationMembership<TOrganization> = {
  id: string
  organization: TOrganization & {
    id: string
    name: string
    slug?: string | null
  }
}

export type PendingOrganizationCreation = {
  name: string
  knownMembershipIds: string[]
}

export type StoredOrganizationCreationAttempt = PendingOrganizationCreation & {
  slug: string
  profileWritePending: boolean
  completedOrganizationId: string | null
}

type StoredOrganizationCreationPayload = StoredOrganizationCreationAttempt & {
  version: 1
  userId: string
  createdAt: string
}

const ORGANIZATION_CREATION_STORAGE_PREFIX = "oatmeal:organization-create:"
const ORGANIZATION_CREATION_EXPIRY_MS = 24 * 60 * 60 * 1_000
const COMPLETED_ORGANIZATION_CREATION_EXPIRY_MS = 30 * 1_000
const ORGANIZATION_CREATION_LOCK_WAIT_MS = 10 * 1_000
const MAX_STORED_MEMBERSHIPS = 1_000

export function createPendingOrganizationCreation<TOrganization>(
  name: string,
  memberships: OrganizationCreationMembership<TOrganization>[],
): PendingOrganizationCreation {
  return {
    name: name.trim(),
    knownMembershipIds: memberships.map((membership) => membership.id),
  }
}

export async function snapshotPendingOrganizationCreation<
  TOrganization extends {
    id: string
    name: string
  },
>(
  name: string,
  getMemberships: (params: {
    initialPage: number
    pageSize: number
  }) => Promise<{
    data: OrganizationCreationMembership<TOrganization>[]
    total_count: number
  }>,
): Promise<PendingOrganizationCreation> {
  const normalizedName = name.trim()
  const knownMembershipIds: string[] = []
  const pageSize = 100

  for (let initialPage = 1; initialPage <= 10; initialPage += 1) {
    const page = await getMemberships({ initialPage, pageSize })
    for (const membership of page.data) {
      if (membership.organization.name.trim() === normalizedName) {
        knownMembershipIds.push(membership.id)
      }
    }
    if (initialPage * pageSize >= page.total_count) {
      return { name: normalizedName, knownMembershipIds }
    }
  }

  throw new Error(
    "We couldn't safely check all your organizations. Ask support to finish this setup.",
  )
}

function organizationCreationStorages(): Storage[] {
  const storages: Storage[] = []
  for (const getStorage of [
    () => globalThis.localStorage,
    () => globalThis.sessionStorage,
  ]) {
    try {
      const storage = getStorage()
      if (storage && !storages.includes(storage)) storages.push(storage)
    } catch {}
  }
  return storages
}

function organizationCreationStorageKey(userId: string): string | null {
  if (!userId || userId.length > 200 || /[\u0000-\u001f\u007f]/.test(userId))
    return null
  return `${ORGANIZATION_CREATION_STORAGE_PREFIX}${userId}`
}

function parseStoredOrganizationCreation(
  raw: string,
  userId: string,
  now: Date,
): StoredOrganizationCreationAttempt | null {
  try {
    const value = JSON.parse(raw) as StoredOrganizationCreationPayload
    const createdAt = new Date(value.createdAt).getTime()
    const completedOrganizationId = value.completedOrganizationId ?? null
    const expiryMs = completedOrganizationId
      ? COMPLETED_ORGANIZATION_CREATION_EXPIRY_MS
      : ORGANIZATION_CREATION_EXPIRY_MS
    if (
      value.version !== 1 ||
      value.userId !== userId ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      value.name.length > 120 ||
      typeof value.slug !== "string" ||
      !value.slug ||
      value.slug.length > 100 ||
      typeof value.profileWritePending !== "boolean" ||
      (completedOrganizationId !== null &&
        (typeof completedOrganizationId !== "string" ||
          !completedOrganizationId ||
          completedOrganizationId.length > 200)) ||
      !Array.isArray(value.knownMembershipIds) ||
      value.knownMembershipIds.length > MAX_STORED_MEMBERSHIPS ||
      value.knownMembershipIds.some(
        (id) => typeof id !== "string" || !id || id.length > 200,
      ) ||
      !Number.isFinite(createdAt) ||
      createdAt > now.getTime() + 60_000 ||
      now.getTime() - createdAt >= expiryMs
    )
      return null
    return {
      name: value.name.trim(),
      slug: value.slug,
      knownMembershipIds: [...value.knownMembershipIds],
      profileWritePending: value.profileWritePending,
      completedOrganizationId,
    }
  } catch {
    return null
  }
}

export function loadOrganizationCreationAttempt(
  userId: string,
  now = new Date(),
): StoredOrganizationCreationAttempt | null {
  const key = organizationCreationStorageKey(userId)
  if (!key) return null
  for (const storage of organizationCreationStorages()) {
    let raw: string | null = null
    try {
      raw = storage.getItem(key)
    } catch {}
    if (!raw) continue
    const parsed = parseStoredOrganizationCreation(raw, userId, now)
    if (parsed) return parsed
    try {
      storage.removeItem(key)
    } catch {}
  }
  return null
}

export function saveOrganizationCreationAttempt(
  userId: string,
  pending: PendingOrganizationCreation,
  slug: string,
  profileWritePending = false,
  now = new Date(),
): "saved" | "conflict" | "unavailable" {
  const key = organizationCreationStorageKey(userId)
  if (
    !key ||
    !pending.name.trim() ||
    pending.name.length > 120 ||
    !slug ||
    slug.length > 100 ||
    pending.knownMembershipIds.length > MAX_STORED_MEMBERSHIPS
  )
    return "unavailable"

  const existing = loadOrganizationCreationAttempt(userId, now)
  if (
    existing &&
    (existing.name !== pending.name.trim() ||
      existing.knownMembershipIds.length !==
        pending.knownMembershipIds.length ||
      existing.knownMembershipIds.some(
        (id, index) => id !== pending.knownMembershipIds[index],
      ) ||
      existing.completedOrganizationId !== null ||
      (existing.slug !== slug && existing.profileWritePending))
  )
    return "conflict"

  const value = JSON.stringify({
    version: 1,
    userId,
    name: pending.name.trim(),
    slug,
    knownMembershipIds: pending.knownMembershipIds,
    profileWritePending,
    completedOrganizationId: null,
    createdAt: now.toISOString(),
  } satisfies StoredOrganizationCreationPayload)
  let saved = false
  let sharedSaved = false
  let sharedStorage: Storage | null = null
  try {
    sharedStorage = globalThis.localStorage
  } catch {}
  for (const storage of organizationCreationStorages()) {
    try {
      storage.setItem(key, value)
      if (storage.getItem(key) === value) {
        saved = true
        if (storage === sharedStorage) sharedSaved = true
      }
    } catch {}
  }
  if (saved && sharedSaved) return "saved"
  for (const storage of organizationCreationStorages()) {
    try {
      storage.removeItem(key)
    } catch {}
  }
  return "unavailable"
}

export function completeOrganizationCreationAttempt(
  userId: string,
  pending: PendingOrganizationCreation,
  slug: string,
  organizationId: string,
  now = new Date(),
): "saved" | "conflict" | "unavailable" {
  const key = organizationCreationStorageKey(userId)
  if (!key || !organizationId || organizationId.length > 200) {
    return "unavailable"
  }
  const existing = loadOrganizationCreationAttempt(userId, now)
  if (
    existing &&
    (existing.name !== pending.name.trim() ||
      existing.slug !== slug ||
      existing.knownMembershipIds.length !==
        pending.knownMembershipIds.length ||
      existing.knownMembershipIds.some(
        (id, index) => id !== pending.knownMembershipIds[index],
      ) ||
      (existing.completedOrganizationId !== null &&
        existing.completedOrganizationId !== organizationId))
  )
    return "conflict"

  const value = JSON.stringify({
    version: 1,
    userId,
    name: pending.name.trim(),
    slug,
    knownMembershipIds: pending.knownMembershipIds,
    profileWritePending: false,
    completedOrganizationId: organizationId,
    createdAt: now.toISOString(),
  } satisfies StoredOrganizationCreationPayload)
  let saved = false
  let sharedStorage: Storage | null = null
  try {
    sharedStorage = globalThis.localStorage
  } catch {}
  for (const storage of organizationCreationStorages()) {
    try {
      storage.setItem(key, value)
      if (storage === sharedStorage && storage.getItem(key) === value) {
        saved = true
      }
    } catch {}
  }
  return saved ? "saved" : "unavailable"
}

type OrganizationCreationLockManager = {
  request<T>(
    name: string,
    options: { mode: "exclusive"; signal: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T>
}

export async function withOrganizationCreationLock<T>(
  userId: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockName = organizationCreationStorageKey(userId)
  const lockManager = (
    globalThis.navigator as Navigator & {
      locks?: OrganizationCreationLockManager
    }
  )?.locks
  if (!lockName || !lockManager?.request) {
    throw new Error(
      "This browser can't safely create an organization. Use an up-to-date browser and try again.",
    )
  }

  const controller = new AbortController()
  let acquired = false
  const timeout = setTimeout(
    () => controller.abort(),
    ORGANIZATION_CREATION_LOCK_WAIT_MS,
  )
  try {
    return await lockManager.request(
      lockName,
      { mode: "exclusive", signal: controller.signal },
      async () => {
        acquired = true
        clearTimeout(timeout)
        return task()
      },
    )
  } catch (error) {
    if (!acquired && controller.signal.aborted) {
      throw new Error(
        "Another tab is creating an organization. Finish it there, then try again.",
      )
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function clearOrganizationCreationAttempt(userId: string): void {
  const key = organizationCreationStorageKey(userId)
  if (!key) return
  for (const storage of organizationCreationStorages()) {
    try {
      storage.removeItem(key)
    } catch {}
  }
}

export async function reconcilePendingOrganization<
  TOrganization extends {
    id: string
    name: string
    slug?: string | null
  },
>(
  pending: PendingOrganizationCreation,
  getMemberships: (params: {
    initialPage: number
    pageSize: number
  }) => Promise<{
    data: OrganizationCreationMembership<TOrganization>[]
    total_count: number
  }>,
  slug?: string,
): Promise<TOrganization | null> {
  const knownIds = new Set(pending.knownMembershipIds)
  const matches = new Map<string, TOrganization>()
  const pageSize = 100

  for (let initialPage = 1; initialPage <= 10; initialPage += 1) {
    const page = await getMemberships({ initialPage, pageSize })
    for (const membership of page.data) {
      if (
        !knownIds.has(membership.id) &&
        membership.organization.name.trim() === pending.name &&
        (!slug || membership.organization.slug === slug)
      ) {
        matches.set(membership.organization.id, membership.organization)
      }
    }
    if (initialPage * pageSize >= page.total_count) break
  }

  if (matches.size > 1) {
    throw new Error(
      "We found more than one new organization with this name. Pick one from the organization menu.",
    )
  }
  return matches.values().next().value ?? null
}

export async function findOrganizationBySlug<
  TOrganization extends {
    id: string
    name: string
    slug?: string | null
  },
>(
  name: string,
  slug: string,
  getMemberships: (params: {
    initialPage: number
    pageSize: number
  }) => Promise<{
    data: OrganizationCreationMembership<TOrganization>[]
    total_count: number
  }>,
): Promise<TOrganization | null> {
  const matches = new Map<string, TOrganization>()
  let conflictingName = false
  const normalizedName = name.trim()
  const pageSize = 100

  for (let initialPage = 1; initialPage <= 10; initialPage += 1) {
    const page = await getMemberships({ initialPage, pageSize })
    for (const membership of page.data) {
      if (membership.organization.slug === slug) {
        if (membership.organization.name.trim() === normalizedName) {
          matches.set(membership.organization.id, membership.organization)
        } else {
          conflictingName = true
        }
      }
    }
    if (initialPage * pageSize >= page.total_count) break
    if (initialPage === 10) {
      throw new Error(
        "We couldn't safely check all your organizations. Ask support to finish this setup.",
      )
    }
  }

  if (matches.size > 1) {
    throw new Error(
      "We found more than one organization with this address. Pick one from the organization menu.",
    )
  }
  if (matches.size === 0 && conflictingName) {
    throw new Error("This address is already used by another organization.")
  }
  return matches.values().next().value ?? null
}
