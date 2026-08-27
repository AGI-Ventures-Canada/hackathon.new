import { render } from "@react-email/components"
import { toPlainText } from "@react-email/render"

export function buildEventUrl(slug: string, path?: string): string
export function buildEventUrl(slug?: string, path?: string): string | undefined
export function buildEventUrl(slug?: string, path?: string): string | undefined {
  if (!slug) return undefined
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hackathon.new"
  const base = `${baseUrl}/e/${slug}`
  return path ? `${base}${path}` : base
}

export function getReplyToAddress(fromAddress = process.env.RESEND_FROM_EMAIL): string | undefined {
  const configured = process.env.RESEND_REPLY_TO_EMAIL?.trim()
  if (configured && !/[\r\n]/.test(configured)) return extractEmailAddress(configured)

  const from = fromAddress?.trim()
  return from && !/[\r\n]/.test(from) ? extractEmailAddress(from) : undefined
}

export async function paceBulkSend(
  index: number,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<void> {
  if (index > 0 && index % 8 === 0) {
    await wait(1_000)
  }
}

export function buildUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  const mailto = getReplyToAddress()
  const targets = [`<${unsubscribeUrl}>`]
  if (mailto) targets.push(`<mailto:${mailto}?subject=unsubscribe>`)
  return {
    "List-Unsubscribe": targets.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

export function buildMailtoUnsubscribeHeaders(): Record<string, string> | undefined {
  const raw = process.env.RESEND_REPLY_TO_EMAIL || process.env.RESEND_FROM_EMAIL
  if (!raw) return undefined
  const mailto = extractEmailAddress(raw).replace(/[\r\n]/g, "")
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailto)) return undefined
  return {
    "List-Unsubscribe": `<mailto:${mailto}?subject=unsubscribe>`,
  }
}

export function htmlToPlainText(html: string): string {
  return toPlainText(html)
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

export function shortHackathonName(name: string, maxLength = 32): string {
  const beforeSeparator = name.split("|")[0]
  const trimmed = (beforeSeparator.trim() || name.replace(/\|/g, " ").trim())
    .replace(/\s+/g, " ")
  if (trimmed.length <= maxLength) return trimmed
  const truncated = trimmed.slice(0, maxLength - 1).trimEnd()
  const lastSpace = truncated.lastIndexOf(" ")
  const head = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated
  return `${head.trimEnd()}…`
}

export function sanitizeTag(name: string): string {
  const sanitized = name
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100)
  return sanitized || "event"
}

export function extractEmailAddress(emailLike: string): string {
  const match = emailLike.match(/<([^>]+)>/)
  return (match ? match[1] : emailLike).trim()
}

export function formatFromAddress(displayName: string, emailLike: string): string {
  const email = extractEmailAddress(emailLike)
  const safeName = displayName.replace(/[\r\n]+/g, " ").trim()
  if (!safeName) return email
  if (/[(),.:;<>@\[\]\\"]|[^\x20-\x7e]/.test(safeName)) {
    const escaped = safeName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    return `"${escaped}" <${email}>`
  }
  return `${safeName} <${email}>`
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
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours === 0) return "less than an hour"
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
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
