import { Elysia, t } from "elysia"
import {
  resolvePrincipal,
  requirePrincipal,
} from "@/lib/auth/principal"
import { matchesExpectedOrganization } from "@/lib/auth/types"
import { normalizeUrl, isSafeExternalUrl, redactImportSourceUrl } from "@/lib/utils/url"
import { extractExternalEventData, extractExternalRichContent, isLumaUrl } from "@/lib/services/external-import"
import { RateLimitError } from "@/lib/services/rate-limit"
import { consumePublicImportRateLimit } from "@/lib/services/public-import-rate-limit"
import { normalizeLocale } from "@/lib/utils/language"

const MAX_TRANSLATION_LINKS = 10

function mergeTranslationLinks(
  a: { url: string; languageCode: string }[],
  b: { url: string; languageCode: string }[]
): { url: string; languageCode: string }[] {
  const seen = new Set<string>()
  const out: { url: string; languageCode: string }[] = []
  for (const links of [a, b]) {
    for (const link of links) {
      if (out.length >= MAX_TRANSLATION_LINKS) return out
      const url = normalizeUrl(link.url)
      const languageCode = normalizeLocale(link.languageCode)
      if (
        url.length > 2048 ||
        !languageCode ||
        !isSafeExternalUrl(url) ||
        !isLumaUrl(url)
      ) continue
      if (seen.has(url)) continue
      seen.add(url)
      out.push({ url, languageCode })
    }
  }
  return out
}

export const importRoutes = new Elysia({ prefix: "/public/import" })
  .post(
    "/url",
    async ({ body, request, set }) => {
      const url = normalizeUrl(body.url)

      if (!isSafeExternalUrl(url)) {
        set.status = 400
        return { error: "Invalid or disallowed URL" }
      }

      const rateLimit = await consumePublicImportRateLimit(request.headers)
      if (rateLimit && !rateLimit.allowed) {
        throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
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

      if (!matchesExpectedOrganization(principal, body.expectedOrganizationId)) {
        set.status = 409
        return {
          error: "Your active organization changed. Review it and try again.",
          code: "organization_context_changed",
          retryable: true,
        }
      }

      const { isOrgTenant, organizationRequiredResponse } = await import("@/lib/services/tenants")
      if (!(await isOrgTenant(principal.tenantId))) {
        return organizationRequiredResponse()
      }

      const sourceUrl = body.sourceUrl ? normalizeUrl(body.sourceUrl) : null
      if (sourceUrl && !isSafeExternalUrl(sourceUrl)) {
        set.status = 400
        return { error: "Invalid or disallowed source URL" }
      }
      const name = body.name.trim()
      if (!name) {
        set.status = 400
        return { error: "Give your event a name." }
      }

      const { createHackathonAggregateWithResult, finalizeHackathonCreation } = await import(
        "@/lib/services/luma-import-create"
      )
      const result = await createHackathonAggregateWithResult(principal.tenantId, {
        draftId: body.draftId,
        name,
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
        sponsors: body.sponsors?.map((sponsor) => ({
          name: sponsor.name,
          tier: sponsor.tier ?? null,
        })) ?? [],
        prizes: body.prizes?.map((prize) => ({
          name: prize.name,
          description: prize.description ?? null,
          value: prize.value ?? null,
        })) ?? [],
        challenges: body.challenges?.map((challenge) => ({
          title: challenge.title,
          description: challenge.description ?? null,
          resources: challenge.resources ?? [],
        })) ?? [],
        agendaItems: body.agendaItems?.map((item) => ({
          title: item.title,
          description: item.description ?? null,
          startsAt: item.startsAt ?? null,
          endsAt: item.endsAt ?? null,
          location: item.location ?? null,
          speakers: item.speakers ?? [],
        })) ?? [],
      })

      if (result.status === "in_progress") {
        set.status = 409
        set.headers["Retry-After"] = "2"
        return {
          error: "Event creation is already in progress. Try again shortly.",
          code: "creation_in_progress",
          retryable: true,
        }
      }

      if (result.status === "invalid") {
        set.status = 422
        return {
          error: result.error.message,
          code: result.error.code,
          retryable: false,
          ...(result.error.code === "draft_conflict" && result.hackathon
            ? {
                existingEvent: {
                  id: result.hackathon.id,
                  name: result.hackathon.name,
                  slug: result.hackathon.slug,
                },
              }
            : {}),
        }
      }

      if (result.status === "failed") {
        set.status = 500
        return { error: "Failed to create hackathon", code: "creation_failed", retryable: true }
      }

      const hackathon = result.hackathon
      const redactedSourceUrl = sourceUrl ? redactImportSourceUrl(sourceUrl) : null
      const source = redactedSourceUrl && isLumaUrl(redactedSourceUrl)
        ? "luma_import"
        : "event_page_import"
      const sourceMetadata = {
        source,
        ...(redactedSourceUrl ? { sourceUrl: redactedSourceUrl } : {}),
      }
      const translationLinks = mergeTranslationLinks(
        body.translationLinks ?? [],
        [],
      )
      const finalizationInput = {
        tenantId: principal.tenantId,
        principal,
        hackathon,
        auditMetadata: sourceMetadata,
        webhookData: { hackathonId: hackathon.id, ...sourceMetadata },
        ...(translationLinks.length
          ? {
              translations: {
                primaryLocale: hackathon.default_locale ?? "en",
                primary: {
                  name,
                  description: body.description ?? null,
                  rules: body.rules ?? null,
                  location_name: body.locationName ?? null,
                  community_label: null,
                },
                translationLinks,
              },
            }
          : {}),
      }
      const { startHackathonCreationFinalizationWorkflow } = await import(
        "@/lib/workflows/creation-finalization"
      )
      let finalizationRunId = await startHackathonCreationFinalizationWorkflow(
        finalizationInput,
      )
      const finalization = await finalizeHackathonCreation(finalizationInput)
      if (
        !finalizationRunId &&
        (finalization.status === "failed" || finalization.status === "in_progress")
      ) {
        finalizationRunId = await startHackathonCreationFinalizationWorkflow(
          finalizationInput,
        )
      }
      if (finalization.status === "invalid") {
        set.status = 422
        return {
          error: finalization.error.message,
          code: finalization.error.code,
          retryable: false,
          existingEvent: {
            id: hackathon.id,
            name: hackathon.name,
            slug: hackathon.slug,
          },
        }
      }
      if (!finalizationRunId && finalization.status !== "complete") {
        set.status = 503
        set.headers["Retry-After"] = "2"
        return {
          error: "Your event was created, but setup could not be scheduled. Keep this page open and try again.",
          code: "finalization_unscheduled",
          retryable: true,
          committed: true,
          existingEvent: {
            id: hackathon.id,
            name: hackathon.name,
            slug: hackathon.slug,
          },
        }
      }
      return {
        id: hackathon.id,
        name: hackathon.name,
        slug: hackathon.slug,
        replayed: result.status === "replayed",
        ...(finalization.status === "complete"
          ? {}
          : {
              finalization: {
                status: finalization.status,
                retryable: true,
                retryScheduled: Boolean(finalizationRunId),
                message: "The event was created. We're finishing setup now.",
              },
            }),
      }
    },
    {
      detail: {
        summary: "Create hackathon from imported event data",
        description: "Creates a new hackathon from structured event data (Luma or any external source). Pass sourceUrl to preserve import attribution. Pass agendaItems to populate the schedule — importing a non-empty agenda replaces the auto-seeded default sessions (trigger items like challenge_release and submission_deadline are preserved). Requires hackathons:write scope.",
        tags: ["dashboard"],
      },
      body: t.Object({
        draftId: t.Optional(t.String({ format: "uuid" })),
        expectedOrganizationId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        name: t.String({ minLength: 1, maxLength: 120 }),
        description: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
        startsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        endsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        registrationOpensAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        registrationClosesAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        locationType: t.Optional(t.Union([t.Literal("in_person"), t.Literal("virtual"), t.Literal("hybrid"), t.Null()])),
        locationName: t.Optional(t.Union([t.String({ maxLength: 240 }), t.Null()])),
        locationUrl: t.Optional(t.Union([t.String({ maxLength: 2048 }), t.Null()])),
        imageUrl: t.Optional(t.Union([t.String({ maxLength: 2048 }), t.Null()])),
        sponsors: t.Optional(t.Array(t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          tier: t.Union([t.String({ maxLength: 80 }), t.Null()]),
        }), { maxItems: 50 })),
        rules: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
        prizes: t.Optional(t.Array(t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          description: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
          value: t.Optional(t.Union([t.String({ maxLength: 120 }), t.Null()])),
        }), { maxItems: 50 })),
        challenges: t.Optional(t.Array(t.Object({
          title: t.String({ minLength: 1, maxLength: 200 }),
          description: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
          resources: t.Optional(t.Array(t.Object({
            label: t.String({ maxLength: 120 }),
            url: t.String({ minLength: 1, maxLength: 2048 }),
          }), { maxItems: 20 })),
        }), { maxItems: 50 })),
        agendaItems: t.Optional(t.Array(t.Object({
          title: t.String({ minLength: 1, maxLength: 200 }),
          description: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
          startsAt: t.Optional(t.Union([
            t.String({
              format: "date-time",
              description: "ISO 8601 timestamp with an offset (e.g. 2026-05-14T09:00:00-04:00).",
            }),
            t.Null(),
          ])),
          endsAt: t.Optional(t.Union([
            t.String({
              format: "date-time",
              description: "ISO 8601 timestamp with an offset. Same format as startsAt.",
            }),
            t.Null(),
          ])),
          location: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
          speakers: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 120 }), { maxItems: 20 })),
        }), { maxItems: 50 })),
        sourceUrl: t.Optional(t.Union([t.String({ maxLength: 2048 }), t.Null()])),
        defaultLocale: t.Optional(t.Union([t.String({ maxLength: 35 }), t.Null()])),
        translationLinks: t.Optional(t.Array(t.Object({
          url: t.String({ minLength: 1, maxLength: 2048 }),
          languageCode: t.String({ minLength: 1, maxLength: 35 }),
        }), { maxItems: 10 })),
      }),
    }
  )
  .post(
    "/url",
    async ({ principal, body, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { isOrgTenant, organizationRequiredResponse } = await import("@/lib/services/tenants")
      if (!(await isOrgTenant(principal.tenantId))) {
        return organizationRequiredResponse()
      }

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

      const { createHackathonAggregateWithResult, finalizeHackathonCreation } = await import(
        "@/lib/services/luma-import-create"
      )
      const result = await createHackathonAggregateWithResult(principal.tenantId, {
        draftId: body.draftId,
        name: primaryName,
        description: primaryDescription,
        startsAt: eventData.startsAt,
        endsAt: eventData.endsAt,
        registrationOpensAt: null,
        registrationClosesAt: null,
        locationType: eventData.locationType,
        locationName: eventData.locationName,
        locationUrl: eventData.locationUrl,
        imageUrl: eventData.imageUrl,
        rules: richContent?.rules ?? null,
        defaultLocale: primaryLocale,
        sponsors: richContent?.sponsors ?? [],
        prizes: richContent?.prizes?.map((prize) => ({
          name: prize.name,
          description: prize.description ?? null,
          value: prize.value ?? null,
        })) ?? [],
        challenges: richContent?.challenges?.map((challenge) => ({
          title: challenge.title,
          description: challenge.description ?? null,
          resources: challenge.resources ?? [],
        })) ?? [],
        agendaItems: richContent?.agendaItems?.map((item) => ({
          title: item.title,
          description: item.description ?? null,
          startsAt: item.startsAt ?? null,
          endsAt: item.endsAt ?? null,
          location: item.location ?? null,
          speakers: item.speakers ?? [],
        })) ?? [],
      })

      if (result.status === "in_progress") {
        set.status = 409
        set.headers["Retry-After"] = "2"
        return {
          error: "Event creation is already in progress. Try again shortly.",
          code: "creation_in_progress",
          retryable: true,
        }
      }

      if (result.status === "invalid") {
        set.status = 422
        return {
          error: result.error.message,
          code: result.error.code,
          retryable: false,
          ...(result.error.code === "draft_conflict" && result.hackathon
            ? {
                existingEvent: {
                  id: result.hackathon.id,
                  name: result.hackathon.name,
                  slug: result.hackathon.slug,
                },
              }
            : {}),
        }
      }

      if (result.status === "failed") {
        set.status = 500
        return { error: "Failed to create hackathon", code: "creation_failed", retryable: true }
      }

      const hackathon = result.hackathon
      const source = isLumaUrl(url) ? "luma_import" : "event_page_import"
      const redactedSourceUrl = redactImportSourceUrl(url)
      const sourceMetadata = {
        source,
        ...(redactedSourceUrl ? { sourceUrl: redactedSourceUrl } : {}),
      }
      const finalizationInput = {
        tenantId: principal.tenantId,
        principal,
        hackathon,
        auditMetadata: sourceMetadata,
        webhookData: { hackathonId: hackathon.id, ...sourceMetadata },
        ...(mergedTranslationLinks.length
          ? {
              translations: {
                primaryLocale: hackathon.default_locale ?? "en",
                primary: {
                  name: primaryName,
                  description: primaryDescription,
                  rules: richContent?.rules ?? null,
                  location_name: eventData.locationName,
                  community_label: null,
                },
                translationLinks: mergedTranslationLinks,
              },
            }
          : {}),
      }
      const { startHackathonCreationFinalizationWorkflow } = await import(
        "@/lib/workflows/creation-finalization"
      )
      let finalizationRunId = await startHackathonCreationFinalizationWorkflow(
        finalizationInput,
      )
      const finalization = await finalizeHackathonCreation(finalizationInput)
      if (
        !finalizationRunId &&
        (finalization.status === "failed" || finalization.status === "in_progress")
      ) {
        finalizationRunId = await startHackathonCreationFinalizationWorkflow(
          finalizationInput,
        )
      }
      if (finalization.status === "invalid") {
        set.status = 422
        return {
          error: finalization.error.message,
          code: finalization.error.code,
          retryable: false,
          existingEvent: {
            id: hackathon.id,
            name: hackathon.name,
            slug: hackathon.slug,
          },
        }
      }
      if (!finalizationRunId && finalization.status !== "complete") {
        set.status = 503
        set.headers["Retry-After"] = "2"
        return {
          error: "Your event was created, but setup could not be scheduled. Keep this page open and try again.",
          code: "finalization_unscheduled",
          retryable: true,
          committed: true,
          existingEvent: {
            id: hackathon.id,
            name: hackathon.name,
            slug: hackathon.slug,
          },
        }
      }
      return {
        id: hackathon.id,
        name: hackathon.name,
        slug: hackathon.slug,
        replayed: result.status === "replayed",
        ...(finalization.status === "complete"
          ? {}
          : {
              finalization: {
                status: finalization.status,
                retryable: true,
                retryScheduled: Boolean(finalizationRunId),
                message: "The event was created. We're finishing setup now.",
              },
            }),
      }
    },
    {
      detail: {
        summary: "Create hackathon from external event URL",
        description: "Fetches any public event page (including Luma), extracts structured data, and creates a new hackathon. Requires hackathons:write scope.",
        tags: ["dashboard"],
      },
      body: t.Object({
        draftId: t.Optional(t.String({ format: "uuid" })),
        url: t.String({ minLength: 1 }),
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
      }),
    }
  )
