import { clerkClient } from "@clerk/nextjs/server"

export type ClerkUserLookup = {
  displayNames: Record<string, string | null>
  emails: Record<string, string | null>
}

export async function resolveClerkUsers(userIds: string[]): Promise<ClerkUserLookup> {
  const displayNames: Record<string, string | null> = {}
  const emails: Record<string, string | null> = {}

  if (userIds.length === 0) return { displayNames, emails }

  const realUserIds = userIds.filter((id) => !id.startsWith("seed_user_"))
  const seedUserIds = userIds.filter((id) => id.startsWith("seed_user_"))

  for (const seedId of seedUserIds) {
    const name = seedId.replace(/^seed_user_/, "").replace(/_\d+$/, "")
    displayNames[seedId] = name.charAt(0).toUpperCase() + name.slice(1)
    emails[seedId] = `${name}@seed.local`
  }

  if (realUserIds.length === 0) return { displayNames, emails }

  try {
    const clerk = await clerkClient()
    for (let i = 0; i < realUserIds.length; i += 100) {
      const batch = realUserIds.slice(i, i + 100)
      const users = await clerk.users.getUserList({ userId: batch, limit: 100 })
      for (const user of users.data) {
        displayNames[user.id] = user.firstName
          ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
          : user.username || null
        const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        emails[user.id] = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
      }
    }
  } catch (err) {
    console.error("Failed to resolve Clerk users:", err)
  }

  return { displayNames, emails }
}
