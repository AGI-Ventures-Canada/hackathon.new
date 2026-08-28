const REQUIRED_PRODUCTION_EMAIL_ENV = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_REPLY_TO_EMAIL",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
] as const

type ClerkEmailTemplate = {
  slug: string
  delivered_by_clerk: boolean
}

export function missingProductionEmailEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return REQUIRED_PRODUCTION_EMAIL_ENV.filter(
    (name) => !environment[name]?.trim(),
  )
}

function extractEmailAddress(value: string | undefined): string | null {
  if (!value) return null
  const bracketed = value.match(/<([^<>]+)>/)
  const candidate = (bracketed?.[1] ?? value).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null
}

export function invalidProductionEmailEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const problems: string[] = []
  const from = extractEmailAddress(environment.RESEND_FROM_EMAIL)
  const replyTo = extractEmailAddress(environment.RESEND_REPLY_TO_EMAIL)

  if (environment.RESEND_FROM_EMAIL?.trim() && !from) {
    problems.push("RESEND_FROM_EMAIL must contain a valid email address")
  }
  if (environment.RESEND_REPLY_TO_EMAIL?.trim() && !replyTo) {
    problems.push("RESEND_REPLY_TO_EMAIL must contain a valid email address")
  }
  if (from) {
    const [localPart, domain] = from.split("@") as [string, string]
    if (["noreply", "no-reply"].includes(localPart)) {
      problems.push("RESEND_FROM_EMAIL must use a reply-friendly mailbox, not no-reply")
    }
    if (domain === "hackathon.new" || !domain.endsWith(".hackathon.new")) {
      problems.push("RESEND_FROM_EMAIL must use a sending subdomain of hackathon.new")
    }
  }
  if (replyTo) {
    const localPart = replyTo.split("@")[0]
    if (["noreply", "no-reply"].includes(localPart)) {
      problems.push("RESEND_REPLY_TO_EMAIL must accept replies")
    }
  }

  return problems
}

export function clerkDeliveredEmailTemplateSlugs(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    throw new Error("Clerk returned an invalid email template list.")
  }

  const templates = payload.filter(
    (entry): entry is ClerkEmailTemplate =>
      Boolean(
        entry &&
          typeof entry === "object" &&
          typeof (entry as Record<string, unknown>).slug === "string" &&
          typeof (entry as Record<string, unknown>).delivered_by_clerk ===
            "boolean",
      ),
  )

  if (templates.length !== payload.length || templates.length === 0) {
    throw new Error("Clerk returned an incomplete email template list.")
  }

  return templates
    .filter((template) => template.delivered_by_clerk)
    .map((template) => template.slug)
    .sort()
}

export async function verifyProductionEmailDelivery(input: {
  environment?: NodeJS.ProcessEnv
  fetcher?: typeof fetch
} = {}): Promise<{ templateCount: number }> {
  const environment = input.environment ?? process.env
  const missing = missingProductionEmailEnvironment(environment)
  if (missing.length > 0) {
    throw new Error(
      `Production email delivery is missing: ${missing.join(", ")}.`,
    )
  }
  const invalid = invalidProductionEmailEnvironment(environment)
  if (invalid.length > 0) {
    throw new Error(`Production email delivery is invalid: ${invalid.join("; ")}.`)
  }

  const fetcher = input.fetcher ?? fetch
  const templates: ClerkEmailTemplate[] = []
  const pageSize = 100

  for (let offset = 0; offset < 1_000; offset += pageSize) {
    const response = await fetcher(
      `https://api.clerk.com/v1/templates/email?limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${environment.CLERK_SECRET_KEY!.trim()}`,
        },
        cache: "no-store",
      },
    )

    if (!response.ok) {
      throw new Error(
        `Clerk email template check failed with status ${response.status}.`,
      )
    }

    const payload: unknown = await response.json()
    if (offset > 0 && Array.isArray(payload) && payload.length === 0) break
    clerkDeliveredEmailTemplateSlugs(payload)
    templates.push(...(payload as ClerkEmailTemplate[]))
    if ((payload as ClerkEmailTemplate[]).length < pageSize) break
    if (offset === 900) {
      throw new Error("Clerk returned too many email templates to verify.")
    }
  }

  const clerkDelivered = clerkDeliveredEmailTemplateSlugs(templates)
  if (clerkDelivered.length > 0) {
    throw new Error(
      `These Clerk email templates bypass Resend: ${clerkDelivered.join(", ")}. Disable Delivered by Clerk for each template.`,
    )
  }

  return { templateCount: templates.length }
}
