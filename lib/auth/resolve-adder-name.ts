import type { ClerkClient } from "@clerk/backend"

export type ResolvedAdder = {
  name: string
  email?: string
}

export async function resolveAdder(
  principal: { kind: string; userId?: string },
  client?: ClerkClient
): Promise<ResolvedAdder> {
  if (principal.kind !== "user" || !principal.userId) return { name: "An organizer" }
  try {
    const clerk = client ?? (await (await import("@clerk/nextjs/server")).clerkClient())
    const adder = await clerk.users.getUser(principal.userId)
    const name = [adder.firstName, adder.lastName].filter(Boolean).join(" ") || "An organizer"
    return { name, email: adder.primaryEmailAddress?.emailAddress }
  } catch {
    return { name: "An organizer" }
  }
}

export async function resolveAdderName(
  principal: { kind: string; userId?: string },
  client?: ClerkClient
): Promise<string> {
  return (await resolveAdder(principal, client)).name
}

export async function resolveAdderEmail(
  principal: { kind: string; userId?: string },
  client?: ClerkClient
): Promise<string | undefined> {
  return (await resolveAdder(principal, client)).email
}
