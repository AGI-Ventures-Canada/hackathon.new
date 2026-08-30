import {
  TEST_EVENT_ATTENDEES,
  TEST_EVENT_JUDGES,
} from "@/lib/fixtures/test-event"

export type SyntheticUserIdentity = {
  displayName: string
  email: string
}

const sandboxIdentities = new Map<string, SyntheticUserIdentity>(
  [...TEST_EVENT_ATTENDEES, ...TEST_EVENT_JUDGES].map((person, index) => [
    person.clerkUserId,
    {
      displayName: person.name,
      email: `sandbox-person-${index + 1}@example.invalid`,
    },
  ]),
)

export function isSyntheticUserId(value: string): boolean {
  return value.startsWith("seed_user_")
}

export function isSyntheticEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.endsWith("@seed.local") || normalized.endsWith("@example.invalid")
}

export function getSyntheticUserIdentity(userId: string): SyntheticUserIdentity | null {
  const sandbox = sandboxIdentities.get(userId)
  if (sandbox) return sandbox
  if (!isSyntheticUserId(userId)) return null

  const raw = userId.replace(/^seed_user_/, "").replace(/_\d+$/, "")
  const displayName = raw
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ")
  return {
    displayName: displayName || "Test person",
    email: `${raw || "test-person"}@seed.local`,
  }
}
