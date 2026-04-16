import { render } from "@react-email/components"

export function buildEventUrl(slug: string, path?: string): string
export function buildEventUrl(slug?: string, path?: string): string | undefined
export function buildEventUrl(slug?: string, path?: string): string | undefined {
  if (!slug) return undefined
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://getoatmeal.com"
  const base = `${baseUrl}/e/${slug}`
  return path ? `${base}${path}` : base
}

export function sanitizeTag(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100)
}

export async function renderEmail(
  element: React.ReactElement
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { html, text }
}

export function formatTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return "less than an hour"
  const hours = Math.ceil(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  return `${days} day${days === 1 ? "" : "s"}`
}

export async function resolveEmailsForTenant(tenant: {
  clerk_org_id: string | null
  clerk_user_id: string | null
}): Promise<string[]> {
  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()
  const emails: string[] = []

  if (tenant.clerk_org_id) {
    const PAGE_SIZE = 500
    let offset = 0
    const allMemberIds: string[] = []

    for (;;) {
      const memberships = await clerk.organizations.getOrganizationMembershipList({
        organizationId: tenant.clerk_org_id,
        limit: PAGE_SIZE,
        offset,
      })
      for (const m of memberships.data) {
        const uid = m.publicUserData?.userId
        if (uid) allMemberIds.push(uid)
      }
      if (memberships.data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    for (let i = 0; i < allMemberIds.length; i += PAGE_SIZE) {
      const batch = allMemberIds.slice(i, i + PAGE_SIZE)
      const users = await clerk.users.getUserList({ userId: batch, limit: PAGE_SIZE })
      for (const user of users.data) {
        const email = user.primaryEmailAddress?.emailAddress
        if (email) emails.push(email)
      }
    }
  } else if (tenant.clerk_user_id) {
    const user = await clerk.users.getUser(tenant.clerk_user_id)
    const email = user.primaryEmailAddress?.emailAddress
    if (email) emails.push(email)
  }

  return emails
}
