import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"
import { normalizeUrl, isSafeExternalUrl } from "@/lib/utils/url"
import { extractExternalEventData, extractExternalRichContent, isLumaUrl } from "@/lib/services/external-import"

function mergeTranslationLinks(
  a: { url: string; languageCode: string }[],
  b: { url: string; languageCode: string }[]
): { url: string; languageCode: string }[] {
  const seen = new Set<string>()
  const out: { url: string; languageCode: string }[] = []
  for (const link of [...a, ...b]) {
    const key = normalizeUrl(link.url)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ url: key, languageCode: link.languageCode })
  }
  return out
}

export const importRoutes = new Elysia({ prefix: "/public/import" })
  .post(
    "/url",
    async ({ body, set }) => {
      const url = normalizeUrl(body.url)

      if (!isSafeExternalUrl(url)) {
        set.status = 400
        return { error: "Invalid or disallowed URL" }
      }

      const data = await extractExternalEventData(url)

      if (!data) {
        set.status = 404
        return { error: "Could not extract event data from the provided URL" }
      }

      return data
    },
    {
      detail: {
        summary: "Preview external event page data",
        description: "Fetches any public event page (including Luma) and extracts structured data for preview. No authentication required.",
        tags: ["public"],
      },
      body: t.Object({
        url: t.String({ minLength: 1 }),
      }),
    }
  )

export const dashboardImportRoutes = new Elysia({ prefix: "/dashboard/import" })
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    return { principal }
  })
  .post(
    "/event",
    async ({ principal, body, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { createHackathonFromImport, importTranslationVariants } = await import(
        "@/lib/services/luma-import-create"
      )
      const hackathon = await createHackathonFromImport(principal.tenantId, {
        name: body.name,
        description: body.description ?? null,
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null,
        registrationOpensAt: body.registrationOpensAt ?? null,
        registrationClosesAt: body.registrationClosesAt ?? null,
        locationType: body.locationType ?? null,
        locationName: body.locationName ?? null,
        locationUrl: body.locationUrl ?? null,
        imageUrl: body.imageUrl ?? null,
        rules: body.rules ?? null,
        defaultLocale: body.defaultLocale ?? null,
      })

      if (!hackathon) {
        set.status = 500
        return { error: "Failed to create hackathon" }
      }

      if (body.sponsors?.length) {
        const { createSponsorsFromImport } = await import("@/lib/services/luma-import-create")
        await createSponsorsFromImport(hackathon.id, body.sponsors)
      }

      if (body.prizes?.length) {
        const { createPrizesFromImport } = await import("@/lib/services/luma-import-create")
        await createPrizesFromImport(hackathon.id, body.prizes)
      }

      if (body.challenges?.length) {
        const { createChallengesFromImport } = await import("@/lib/services/luma-import-create")
        await createChallengesFromImport(hackathon.id, principal.tenantId, body.challenges)
      }

      if (body.agendaItems?.length) {
        const { createAgendaFromImport } = await import("@/lib/services/luma-import-create")
        await createAgendaFromImport(hackathon.id, body.agendaItems, body.startsAt ?? null)
      }

      if (body.translationLinks?.length) {
        importTranslationVariants({
          hackathonId: hackathon.id,
          tenantId: principal.tenantId,
          primaryLocale: hackathon.default_locale ?? "en",
          primary: {
            name: body.name,
            description: body.description ?? null,
            rules: body.rules ?? null,
            location_name: body.locationName ?? null,
            community_label: null,
          },
          translationLinks: body.translationLinks,
        }).catch(console.error)
      }

      const source = body.sourceUrl && isLumaUrl(body.sourceUrl) ? "luma_import" : "event_page_import"

      await logAudit({
        principal,
        action: "hackathon.created",
        resourceType: "hackathon",
        resourceId: hackathon.id,
        metadata: { source, ...(body.sourceUrl ? { sourceUrl: normalizeUrl(body.sourceUrl) } : {}) },
      })

      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      triggerWebhooks(principal.tenantId, "hackathon.created", {
        event: "hackathon.created",
        timestamp: new Date().toISOString(),
        data: { hackathonId: hackathon.id, source, ...(body.sourceUrl ? { sourceUrl: normalizeUrl(body.sourceUrl) } : {}) },
      }).catch(console.error)

      return {
        id: hackathon.id,
        name: hackathon.name,
        slug: hackathon.slug,
      }
    },
    {
      detail: {
        summary: "Create hackathon from imported event data",
        description: "Creates a new hackathon from structured event data (Luma or any external source). Pass sourceUrl to preserve import attribution. Pass agendaItems to populate the schedule — importing a non-empty agenda replaces the auto-seeded default sessions (trigger items like challenge_release and submission_deadline are preserved). Requires hackathons:write scope.",
        tags: ["dashboard"],
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        startsAt: t.Optional(t.Union([t.String(), t.Null()])),
        endsAt: t.Optional(t.Union([t.String(), t.Null()])),
        registrationOpensAt: t.Optional(t.Union([t.String(), t.Null()])),
        registrationClosesAt: t.Optional(t.Union([t.String(), t.Null()])),
        locationType: t.Optional(t.Union([t.Literal("in_person"), t.Literal("virtual"), t.Null()])),
        locationName: t.Optional(t.Union([t.String(), t.Null()])),
        locationUrl: t.Optional(t.Union([t.String(), t.Null()])),
        imageUrl: t.Optional(t.Union([t.String(), t.Null()])),
        sponsors: t.Optional(t.Array(t.Object({
          name: t.String({ minLength: 1 }),
          tier: t.Union([t.String(), t.Null()]),
        }))),
        rules: t.Optional(t.Union([t.String(), t.Null()])),
        prizes: t.Optional(t.Array(t.Object({
          name: t.String({ minLength: 1 }),
          description: t.Optional(t.Union([t.String(), t.Null()])),
          value: t.Optional(t.Union([t.String(), t.Null()])),
        }))),
        challenges: t.Optional(t.Array(t.Object({
          title: t.String({ minLength: 1 }),
          description: t.Optional(t.Union([t.String(), t.Null()])),
          resources: t.Optional(t.Array(t.Object({
            label: t.String(),
            url: t.String(),
          }))),
        }))),
        agendaItems: t.Optional(t.Array(t.Object({
          title: t.String({ minLength: 1 }),
          description: t.Optional(t.Union([t.String(), t.Null()])),
          startsAt: t.Optional(t.Union([t.String(), t.Null()])),
          endsAt: t.Optional(t.Union([t.String(), t.Null()])),
          location: t.Optional(t.Union([t.String(), t.Null()])),
          speakers: t.Optional(t.Array(t.String())),
        }))),
        sourceUrl: t.Optional(t.Union([t.String(), t.Null()])),
        defaultLocale: t.Optional(t.Union([t.String(), t.Null()])),
        translationLinks: t.Optional(t.Array(t.Object({
          url: t.String({ minLength: 1 }),
          languageCode: t.String({ minLength: 1 }),
        }), { maxItems: 10 })),
      }),
    }
  )
  .post(
    "/url",
    async ({ principal, body, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const url = normalizeUrl(body.url)

      if (!isSafeExternalUrl(url)) {
        set.status = 400
        return { error: "Invalid or disallowed URL" }
      }

      const eventData = await extractExternalEventData(url)

      if (!eventData) {
        set.status = 404
        return { error: "Could not extract event data from the provided URL" }
      }

      const richContent = await extractExternalRichContent(url, {
        eventStartsAt: eventData.startsAt ?? null,
      })

      const mergedTranslationLinks = mergeTranslationLinks(
        eventData.translationLinks,
        richContent?.translationLinks ?? []
      )

      const primaryLocale =
        eventData.language ??
        (mergedTranslationLinks.length ? "en" : null) ??
        null

      const primaryName = body.name?.trim() || eventData.name
      const primaryDescription =
        body.description?.trim() ||
        richContent?.cleanedDescription ||
        eventData.description

      const { createHackathonFromImport, importTranslationVariants } = await import(
        "@/lib/services/luma-import-create"
      )
      const hackathon = await createHackathonFromImport(principal.tenantId, {
        name: primaryName,
        description: primaryDescription,
        startsAt: eventData.startsAt,
        endsAt: eventData.endsAt,
        locationType: eventData.locationType,
        locationName: eventData.locationName,
        locationUrl: eventData.locationUrl,
        imageUrl: eventData.imageUrl,
        rules: richContent?.rules ?? null,
        defaultLocale: primaryLocale,
      })

      if (!hackathon) {
        set.status = 500
        return { error: "Failed to create hackathon" }
      }

      if (richContent?.sponsors?.length) {
        const { createSponsorsFromImport } = await import("@/lib/services/luma-import-create")
        await createSponsorsFromImport(hackathon.id, richContent.sponsors)
      }

      if (richContent?.prizes?.length) {
        const { createPrizesFromImport } = await import("@/lib/services/luma-import-create")
        await createPrizesFromImport(hackathon.id, richContent.prizes)
      }

      if (richContent?.challenges?.length) {
        const { createChallengesFromImport } = await import("@/lib/services/luma-import-create")
        await createChallengesFromImport(hackathon.id, principal.tenantId, richContent.challenges)
      }

      if (richContent?.agendaItems?.length) {
        const { createAgendaFromImport } = await import("@/lib/services/luma-import-create")
        await createAgendaFromImport(hackathon.id, richContent.agendaItems, eventData.startsAt)
      }

      if (mergedTranslationLinks.length) {
        importTranslationVariants({
          hackathonId: hackathon.id,
          tenantId: principal.tenantId,
          primaryLocale: hackathon.default_locale ?? "en",
          primary: {
            name: primaryName,
            description: primaryDescription,
            rules: richContent?.rules ?? null,
            location_name: eventData.locationName,
            community_label: null,
          },
          translationLinks: mergedTranslationLinks,
        }).catch(console.error)
      }

      const source = isLumaUrl(url) ? "luma_import" : "event_page_import"

      await logAudit({
        principal,
        action: "hackathon.created",
        resourceType: "hackathon",
        resourceId: hackathon.id,
        metadata: { source, sourceUrl: url },
      })

      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      triggerWebhooks(principal.tenantId, "hackathon.created", {
        event: "hackathon.created",
        timestamp: new Date().toISOString(),
        data: { hackathonId: hackathon.id, source, sourceUrl: url },
      }).catch(console.error)

      return {
        id: hackathon.id,
        name: hackathon.name,
        slug: hackathon.slug,
      }
    },
    {
      detail: {
        summary: "Create hackathon from external event URL",
        description: "Fetches any public event page (including Luma), extracts structured data, and creates a new hackathon. Requires hackathons:write scope.",
        tags: ["dashboard"],
      },
      body: t.Object({
        url: t.String({ minLength: 1 }),
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
      }),
    }
  )
