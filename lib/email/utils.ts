import { render } from "@react-email/components"

export function buildEventUrl(slug: string, path?: string): string
export function buildEventUrl(slug?: string, path?: string): string | undefined
export function buildEventUrl(slug?: string, path?: string): string | undefined {
  if (!slug) return undefined
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hackathon.new"
  const base = `${baseUrl}/e/${slug}`
  return path ? `${base}${path}` : base
}

export function getReplyToAddress(): string | undefined {
  return process.env.RESEND_REPLY_TO_EMAIL || process.env.RESEND_FROM_EMAIL || undefined
}

export function buildUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  const mailto = process.env.RESEND_REPLY_TO_EMAIL
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

function codePointOr(original: string, code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return original
  try {
    return String.fromCodePoint(code)
  } catch {
    return original
  }
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "…",
  }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => codePointOr(m, parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => codePointOr(m, Number(dec)))
    .replace(/&[a-z]+;/gi, (m) => named[m.toLowerCase()] ?? m)
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

export function shortHackathonName(name: string, maxLength = 45): string {
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
  return name
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100)
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
