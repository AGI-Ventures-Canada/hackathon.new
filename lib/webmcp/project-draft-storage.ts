const PROJECT_DRAFT_PREFIX = "oatmeal:submission-draft:v2"
const LEGACY_PROJECT_DRAFT_PREFIX = "oatmeal:submission-draft"

type ProjectDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function projectDraftOwner(userId: string | null): string {
  return userId ? `user:${encodeURIComponent(userId)}` : "anonymous"
}

export function projectDraftStorageKey(
  slug: string,
  userId: string | null,
): string {
  return `${PROJECT_DRAFT_PREFIX}:${encodeURIComponent(slug)}:${projectDraftOwner(userId)}`
}

function legacyProjectDraftStorageKey(slug: string): string {
  return `${LEGACY_PROJECT_DRAFT_PREFIX}:${slug}`
}

export function readProjectDraft(
  storage: ProjectDraftStorage,
  slug: string,
  userId: string | null,
): string | null {
  const key = projectDraftStorageKey(slug, userId)
  const current = storage.getItem(key)
  if (current || !userId) return current

  const anonymousKey = projectDraftStorageKey(slug, null)
  const anonymousDraft = storage.getItem(anonymousKey)
  if (anonymousDraft) {
    storage.setItem(key, anonymousDraft)
    storage.removeItem(anonymousKey)
    return anonymousDraft
  }

  const legacyKey = legacyProjectDraftStorageKey(slug)
  const legacyDraft = storage.getItem(legacyKey)
  if (!legacyDraft) return null
  storage.setItem(key, legacyDraft)
  storage.removeItem(legacyKey)
  return legacyDraft
}

export function writeProjectDraft(
  storage: ProjectDraftStorage,
  slug: string,
  userId: string | null,
  serializedDraft: string,
): void {
  storage.setItem(projectDraftStorageKey(slug, userId), serializedDraft)
}

export function removeProjectDraft(
  storage: ProjectDraftStorage,
  slug: string,
  userId: string | null,
): void {
  storage.removeItem(projectDraftStorageKey(slug, userId))
}
