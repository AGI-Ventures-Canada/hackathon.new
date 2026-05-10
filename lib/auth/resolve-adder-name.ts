import type { ClerkClient } from "@clerk/backend"

export async function resolveAdderName(
  principal: { kind: string; userId?: string },
  client?: ClerkClient
): Promise<string> {
  if (principal.kind !== "user" || !principal.userId) return "An organizer"
  try {
    const clerk = client ?? (await (await import("@clerk/nextjs/server")).clerkClient())
    const adder = await clerk.users.getUser(principal.userId)
    return [adder.firstName, adder.lastName].filter(Boolean).join(" ") || "An organizer"
  } catch {
    return "An organizer"
  }
}

export async function resolveAdderEmail(
  principal: { kind: string; userId?: string },
  client?: ClerkClient
): Promise<string | undefined> {
  if (principal.kind !== "user" || !principal.userId) return undefined
  try {
    const clerk = client ?? (await (await import("@clerk/nextjs/server")).clerkClient())
    const adder = await clerk.users.getUser(principal.userId)
    return adder.primaryEmailAddress?.emailAddress
  } catch {
    return undefined
  }
}
