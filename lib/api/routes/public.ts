import { Elysia, t } from "elysia"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { normalizeUrl } from "@/lib/utils/url"
import { exchangeCodeForTokens, saveIntegration, getProviderConfig } from "@/lib/integrations/oauth"
import { getPublicHackathon, listPublicHackathons } from "@/lib/services/public-hackathons"
import { registerForHackathon, getParticipantCount, isUserRegistered } from "@/lib/services/hackathons"
import { getPublicTenantWithEvents } from "@/lib/services/tenant-profiles"
import {
  getParticipantWithTeam,
  getSubmissionForParticipant,
  getExistingSubmission,
  createSubmission,
  updateSubmission,
  getHackathonSubmissions,
  getTeamMemberCount,
} from "@/lib/services/submissions"
import { getTeamSizeWarning } from "@/lib/utils/team-size"

export const publicRoutes = new Elysia({ prefix: "/public" })
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }), {
    detail: {
      summary: "Health check",
      description: "Returns service health status and current timestamp.",
    },
  })
  .get("/integrations/:provider/callback", async ({ params, query }) => {
    const { provider } = params
    const code = query.code as string | undefined
    const state = query.state as string | undefined
    const error = query.error as string | undefined

    if (error) {
      const safeError = error
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
      return new Response(
        `<html><body><h1>Error</h1><p>${safeError}</p><script>window.close()</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      )
    }

    if (!code || !state) {
      return new Response(
        `<html><body><h1>Error</h1><p>Missing code or state</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      )
    }

    let stateData: { tenantId: string; userId: string }
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString())
    } catch {
      return new Response(
        `<html><body><h1>Error</h1><p>Invalid state</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      )
    }

    const providerType = provider as "gmail" | "google_calendar" | "notion" | "luma"
    const config = getProviderConfig(providerType)

    if (!config) {
      return new Response(
        `<html><body><h1>Error</h1><p>Provider not configured</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      )
    }

    const tokens = await exchangeCodeForTokens(providerType, code)

    if (!tokens) {
      return new Response(
        `<html><body><h1>Error</h1><p>Token exchange failed</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      )
    }

    await saveIntegration({
      tenantId: stateData.tenantId,
      provider: providerType,
      accountEmail: tokens.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      scopes: config.scopes,
    })

    return new Response(
      `<html><body><h1>Success!</h1><p>${provider} connected successfully.</p><script>setTimeout(() => window.close(), 2000)</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    )
  }, {
    detail: {
      summary: "OAuth callback",
      description: "Handles OAuth provider callback. Exchanges authorization code for tokens and saves the integration. Browser-only flow.",
    },
  })
  .get("/hackathons/:slug", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      description: hackathon.description,
      rules: hackathon.rules,
      bannerUrl: hackathon.banner_url,
      status: hackathon.status,
      phase: hackathon.phase,
      startsAt: hackathon.starts_at,
      endsAt: hackathon.ends_at,
      registrationOpensAt: hackathon.registration_opens_at,
      registrationClosesAt: hackathon.registration_closes_at,
      organizer: {
        id: hackathon.organizer.id,
        name: hackathon.organizer.name,
        slug: hackathon.organizer.slug,
        logoUrl: hackathon.organizer.logo_url,
      },
      sponsors: hackathon.sponsors.map((s) => ({
        id: s.id,
        name: s.name,
        logoUrl: s.logo_url,
        websiteUrl: s.website_url,
        tier: s.tier,
        useOrgAssets: s.use_org_assets,
        tenant: s.tenant
          ? {
              slug: s.tenant.slug,
              name: s.tenant.name,
              logoUrl: s.tenant.logo_url,
              logoUrlDark: s.tenant.logo_url_dark,
              websiteUrl: s.tenant.website_url,
              description: s.tenant.description,
            }
          : null,
      })),
    }
  }, {
    detail: {
      summary: "Get hackathon by slug",
      description: "Returns public hackathon details including sponsors.",
    },
  })
  .post("/hackathons/:slug/register", async ({ params, body }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    if (
      hackathon.require_location_verification &&
      hackathon.location_latitude != null &&
      hackathon.location_longitude != null
    ) {
      if (body?.latitude == null || body?.longitude == null) {
        return new Response(
          JSON.stringify({ error: "Location verification required. Please share your location.", code: "location_required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
      const { haversineDistance, MAX_DISTANCE_KM } = await import("@/lib/utils/geo")
      const distance = haversineDistance(
        body.latitude,
        body.longitude,
        hackathon.location_latitude,
        hackathon.location_longitude
      )
      if (distance > MAX_DISTANCE_KM) {
        return new Response(
          JSON.stringify({
            error: `You appear to be ${Math.round(distance)} km away. This in-person event requires you to be within ${MAX_DISTANCE_KM} km of the venue.`,
            code: "location_too_far",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
    }

    let teamName: string | undefined
    try {
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      const displayName = user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.username || user.emailAddresses?.[0]?.emailAddress?.split("@")[0]
      if (displayName) {
        teamName = `${displayName}'s Team`
      }
    } catch (err) {
      console.warn("Failed to fetch user for team name:", err)
    }

    const result = await registerForHackathon(hackathon.id, userId, teamName)

    if (!result.success) {
      const statusCode = result.code === "already_registered" ? 409 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    const { triggerWebhooks } = await import("@/lib/services/webhooks")
    triggerWebhooks(hackathon.tenant_id, "participant.registered", {
      event: "participant.registered",
      timestamp: new Date().toISOString(),
      data: { hackathonId: hackathon.id, participantId: result.participantId, teamId: result.teamId },
    }).catch(console.error)

    return { success: true, participantId: result.participantId, teamId: result.teamId }
  }, {
    detail: {
      summary: "Register for hackathon",
      description: "Registers the authenticated user for a hackathon. Requires Clerk session. Optionally accepts latitude/longitude for location verification.",
    },
    body: t.Optional(t.Object({
      latitude: t.Optional(t.Number()),
      longitude: t.Optional(t.Number()),
    })),
  })
  .get("/hackathons/:slug/submissions/me", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return { submission: null }
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return { submission: null }
    }

    const submission = await getSubmissionForParticipant(hackathon.id, userId)

    if (!submission) {
      return { submission: null }
    }

    return {
      submission: {
        id: submission.id,
        title: submission.title,
        description: submission.description,
        githubUrl: submission.github_url,
        liveAppUrl: submission.live_app_url,
        screenshotUrl: submission.screenshot_url,
        status: submission.status,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
      },
    }
  }, {
    detail: {
      summary: "Get my submission",
      description: "Returns the authenticated user's submission for a hackathon.",
    },
  })
  .get("/hackathons/:slug/submissions", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const submissions = await getHackathonSubmissions(hackathon.id)

    return {
      submissions: submissions.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        githubUrl: s.github_url,
        liveAppUrl: s.live_app_url,
        demoVideoUrl: s.demo_video_url,
        screenshotUrl: s.screenshot_url,
        status: s.status,
        createdAt: s.created_at,
        submitter: s.submitter_name,
      })),
    }
  }, {
    detail: {
      summary: "List submissions",
      description: "Lists all submissions for a hackathon.",
    },
  })
  .post(
    "/hackathons/:slug/submissions",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)

      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (hackathon.status !== "active") {
        return new Response(
          JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const participant = await getParticipantWithTeam(hackathon.id, userId)

      if (!participant) {
        return new Response(
          JSON.stringify({ error: "You must register before submitting", code: "not_registered" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      const existing = await getExistingSubmission(
        hackathon.id,
        participant.participantId,
        participant.teamId
      )

      if (existing) {
        return new Response(
          JSON.stringify({ error: "You have already submitted a project", code: "already_submitted" }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      }

      let teamSizeWarning: string | null = null
      let teamMemberCount = 1
      if (participant.teamId) {
        teamMemberCount = await getTeamMemberCount(participant.teamId)
        const warning = getTeamSizeWarning({
          memberCount: teamMemberCount,
          minTeamSize: hackathon.min_team_size,
          allowSolo: hackathon.allow_solo,
        })
        if (warning) teamSizeWarning = warning.message
      } else if (!hackathon.allow_solo) {
        teamSizeWarning = `Solo participants are not allowed — this event requires teams of at least ${hackathon.min_team_size}.`
      }

      const githubUrl = normalizeUrl(body.githubUrl)
      const liveAppUrl = body.liveAppUrl ? normalizeUrl(body.liveAppUrl) : body.liveAppUrl

      try {
        const url = new URL(githubUrl)
        if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
          return new Response(
            JSON.stringify({ error: "GitHub URL must be from github.com", code: "invalid_github_url" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid GitHub URL", code: "invalid_github_url" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const submission = await createSubmission(
        hackathon.id,
        participant.participantId,
        participant.teamId,
        {
          title: body.title,
          description: body.description,
          githubUrl,
          liveAppUrl,
          metadata: teamSizeWarning
            ? { teamSizeWarning, teamMemberCount }
            : undefined,
        }
      )

      if (!submission) {
        return new Response(
          JSON.stringify({ error: "Failed to create submission", code: "create_failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      }

      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      triggerWebhooks(hackathon.tenant_id, "submission.created", {
        event: "submission.created",
        timestamp: new Date().toISOString(),
        data: { hackathonId: hackathon.id, submissionId: submission.id, title: body.title },
      }).catch(console.error)

      return { success: true, submissionId: submission.id, teamSizeWarning }
    },
    {
      detail: {
        summary: "Create submission",
        description: "Creates a new project submission. Requires registration and active hackathon.",
      },
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 100 }),
        description: t.String({ minLength: 1, maxLength: 280 }),
        githubUrl: t.String(),
        liveAppUrl: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  )
  .patch(
    "/hackathons/:slug/submissions",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)

      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (hackathon.status !== "active") {
        return new Response(
          JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const participant = await getParticipantWithTeam(hackathon.id, userId)

      if (!participant) {
        return new Response(
          JSON.stringify({ error: "You must register before submitting", code: "not_registered" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      const existing = await getExistingSubmission(
        hackathon.id,
        participant.participantId,
        participant.teamId
      )

      if (!existing) {
        return new Response(
          JSON.stringify({ error: "No submission found to update", code: "no_submission" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const normalizedGithubUrl = body.githubUrl ? normalizeUrl(body.githubUrl) : body.githubUrl
      const normalizedLiveAppUrl = body.liveAppUrl ? normalizeUrl(body.liveAppUrl) : body.liveAppUrl

      if (normalizedGithubUrl) {
        try {
          const url = new URL(normalizedGithubUrl)
          if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
            return new Response(
              JSON.stringify({ error: "GitHub URL must be from github.com", code: "invalid_github_url" }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            )
          }
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid GitHub URL", code: "invalid_github_url" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
      }

      const submission = await updateSubmission(
        existing.id,
        participant.participantId,
        participant.teamId,
        {
          title: body.title,
          description: body.description,
          githubUrl: normalizedGithubUrl,
          liveAppUrl: normalizedLiveAppUrl,
        }
      )

      if (!submission) {
        return new Response(
          JSON.stringify({ error: "Failed to update submission", code: "update_failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      }

      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      triggerWebhooks(hackathon.tenant_id, "submission.updated", {
        event: "submission.updated",
        timestamp: new Date().toISOString(),
        data: { hackathonId: hackathon.id, submissionId: submission.id },
      }).catch(console.error)

      return { success: true, submissionId: submission.id }
    },
    {
      detail: {
        summary: "Update submission",
        description: "Updates an existing submission. All fields optional.",
      },
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        description: t.Optional(t.String({ minLength: 1, maxLength: 280 })),
        githubUrl: t.Optional(t.String()),
        liveAppUrl: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  )
  .post("/hackathons/:slug/submissions/screenshot", async ({ params, request }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    if (hackathon.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const participant = await getParticipantWithTeam(hackathon.id, userId)

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "You must register before uploading", code: "not_registered" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const existing = await getExistingSubmission(
      hackathon.id,
      participant.participantId,
      participant.teamId
    )

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Create a submission first before uploading a screenshot", code: "no_submission" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided", code: "no_file" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: "Invalid file type. Use PNG, JPEG, or WebP", code: "invalid_file_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (file.size > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "File too large (max 10MB)", code: "file_too_large" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { uploadScreenshot } = await import("@/lib/services/storage")
    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadResult = await uploadScreenshot(existing.id, buffer)

    if (!uploadResult) {
      return new Response(
        JSON.stringify({ error: "Failed to upload screenshot", code: "upload_failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const updated = await updateSubmission(
      existing.id,
      participant.participantId,
      participant.teamId,
      { screenshotUrl: uploadResult.url }
    )

    if (!updated) {
      return new Response(
        JSON.stringify({ error: "Failed to save screenshot URL", code: "update_failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true, screenshotUrl: uploadResult.url }
  }, {
    detail: {
      summary: "Upload submission screenshot",
      description: "Uploads a screenshot image for the user's submission. Accepts PNG, JPEG, or WebP (max 10MB).",
    },
  })
  .delete("/hackathons/:slug/submissions/screenshot", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found", code: "hackathon_not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    if (hackathon.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Submissions are not currently open", code: "submissions_closed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const participant = await getParticipantWithTeam(hackathon.id, userId)

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "Not registered", code: "not_registered" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const existing = await getExistingSubmission(
      hackathon.id,
      participant.participantId,
      participant.teamId
    )

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "No submission found", code: "no_submission" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { deleteScreenshot } = await import("@/lib/services/storage")
    await deleteScreenshot(existing.id)

    await updateSubmission(
      existing.id,
      participant.participantId,
      participant.teamId,
      { screenshotUrl: null }
    )

    return { success: true }
  }, {
    detail: {
      summary: "Delete submission screenshot",
      description: "Removes the screenshot from the user's submission.",
    },
  })
  .get("/hackathons", async ({ query }) => {
    const params = query as Record<string, string | undefined>
    const q = params.q
    const page = Math.max(1, parseInt(params.page || "1", 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(params.limit || "9", 10) || 9))

    const { hackathons, total } = await listPublicHackathons({
      search: q,
      page,
      limit,
    })

    return {
      hackathons: hackathons.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        bannerUrl: h.banner_url,
        status: h.status,
        phase: h.phase,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationOpensAt: h.registration_opens_at,
        registrationClosesAt: h.registration_closes_at,
        organizer: {
          id: h.organizer.id,
          name: h.organizer.name,
          slug: h.organizer.slug,
          logoUrl: h.organizer.logo_url,
        },
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }
  }, {
    detail: {
      summary: "List hackathons",
      description: "Lists public hackathons with pagination. Supports ?q= for search, ?page= and ?limit= for pagination (default 9 per page).",
    },
  })
  .get("/hackathons/:slug/registration", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { userId } = await auth()
    const [participantCount, registered] = await Promise.all([
      getParticipantCount(hackathon.id),
      userId ? isUserRegistered(hackathon.id, userId) : Promise.resolve(false),
    ])

    return {
      participantCount,
      isRegistered: userId ? registered : null,
    }
  }, {
    detail: {
      summary: "Get registration info",
      description: "Returns participant count and current user's registration status.",
    },
  })
  .get("/orgs/:slug", async ({ params }) => {
    const tenant = await getPublicTenantWithEvents(params.slug)

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logo_url,
      logoUrlDark: tenant.logo_url_dark,
      description: tenant.description,
      websiteUrl: tenant.website_url,
      organizedHackathons: tenant.organizedHackathons.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        bannerUrl: h.banner_url,
        status: h.status,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
      })),
      sponsoredHackathons: tenant.sponsoredHackathons.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        bannerUrl: h.banner_url,
        status: h.status,
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        organizer: {
          id: h.organizer.id,
          name: h.organizer.name,
          slug: h.organizer.slug,
          logoUrl: h.organizer.logo_url,
        },
      })),
    }
  }, {
    detail: {
      summary: "Get organization profile",
      description: "Returns an organization's public profile with organized and sponsored hackathons.",
    },
  })
  .get("/invitations/:token", async ({ params }) => {
    const { getInvitationByToken } = await import("@/lib/services/team-invitations")
    const invitation = await getInvitationByToken(params.token)

    if (!invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const now = new Date()
    const isExpired = new Date(invitation.expires_at) < now

    return {
      id: invitation.id,
      status: isExpired && invitation.status === "pending" ? "expired" : invitation.status,
      teamName: invitation.team.name,
      hackathonName: invitation.hackathon.name,
      hackathonSlug: invitation.hackathon.slug,
      hackathonStatus: invitation.hackathon.status,
      email: invitation.email,
      expiresAt: invitation.expires_at,
    }
  }, {
    detail: {
      summary: "Get team invitation",
      description: "Returns team invitation details by token.",
    },
  })
  .post("/invitations/:token/accept", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.primaryEmailAddress?.emailAddress

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "No email address found", code: "no_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { acceptTeamInvitation } = await import("@/lib/services/team-invitations")
    const result = await acceptTeamInvitation(params.token, userId, userEmail)

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getPublicHackathonById } = await import("@/lib/services/public-hackathons")
    const hackathon = await getPublicHackathonById(result.hackathonId)

    return { success: true, teamId: result.teamId, hackathonSlug: hackathon?.slug || null }
  }, {
    detail: {
      summary: "Accept team invitation",
      description: "Accepts a team invitation and joins the team. Requires Clerk session.",
    },
  })
  .post("/invitations/:token/decline", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmail = user.primaryEmailAddress?.emailAddress

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "No email address found", code: "no_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { declineTeamInvitation } = await import("@/lib/services/team-invitations")
    const result = await declineTeamInvitation(params.token, userEmail)

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 403
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: result.success }
  }, {
    detail: {
      summary: "Decline team invitation",
      description: "Declines a team invitation. Requires Clerk session.",
    },
  })
  .get("/prize-claims/:token", async ({ params }) => {
    const { getClaimByToken } = await import("@/lib/services/prize-fulfillment")
    const claim = await getClaimByToken(params.token)

    if (!claim) {
      return new Response(
        JSON.stringify({ error: "Prize claim not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    return claim
  }, {
    detail: {
      summary: "Get prize claim details",
      description: "Returns prize claim details by token. No authentication required.",
    },
  })
  .post("/prize-claims/:token/claim", async ({ params, body }) => {
    const { checkRateLimit, RateLimitError } = await import("@/lib/services/rate-limit")
    const rateLimit = await checkRateLimit(`prize_claim:${params.token}`, {
      maxRequests: 10,
      windowMs: 60_000,
    })
    if (!rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const { recipientName, recipientEmail, shippingAddress, paymentMethod, paymentDetail } = body as {
      recipientName: string
      recipientEmail: string
      shippingAddress?: string
      paymentMethod?: string
      paymentDetail?: string
    }

    if (!recipientName || !recipientEmail) {
      return new Response(
        JSON.stringify({ error: "Name and email are required", code: "validation" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { claimPrize } = await import("@/lib/services/prize-fulfillment")
    const result = await claimPrize(params.token, { recipientName, recipientEmail, shippingAddress, paymentMethod, paymentDetail })

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    // Product decision: sibling tokens are intentionally returned to enable
    // one team member to claim all of their submission's prizes in a single
    // session. The claim token is the authorization — no additional auth is
    // required. All tokens belong to the same submission, so cross-member
    // claiming is by design (any teammate can fulfill on behalf of the team).
    const { getSiblingClaims } = await import("@/lib/services/prize-fulfillment")
    const siblings = await getSiblingClaims(params.token)
    const publicSiblings = siblings.map(({ recipientEmail: _email, shippingAddress: _addr, ...rest }) => rest)

    return { success: true, siblings: publicSiblings }
  }, {
    body: t.Object({
      recipientName: t.String({ minLength: 1, description: "Full name of the prize recipient" }),
      recipientEmail: t.String({ format: "email", description: "Email address of the prize recipient" }),
      shippingAddress: t.Optional(t.String({ maxLength: 500, description: "Shipping address for physical prizes" })),
      paymentMethod: t.Optional(t.Union([t.Literal("venmo"), t.Literal("paypal"), t.Literal("bank_transfer"), t.Literal("other")], { description: "Payment method for cash prizes" })),
      paymentDetail: t.Optional(t.String({ maxLength: 500, description: "Payment handle or account details (e.g., @username, email)" })),
    }),
    detail: {
      summary: "Claim a prize",
      description: "Submits a prize claim with recipient details. No authentication required — the token is the authorization.",
    },
  })
  .get("/hackathons/:slug/judging/assignments", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgeAssignments } = await import("@/lib/services/judging")
    const assignments = await getJudgeAssignments(hackathon.id, userId)

    const anonymize = hackathon.anonymous_judging
    return {
      assignments: assignments.map((a) => ({
        id: a.id,
        submissionId: a.submissionId,
        submissionTitle: a.submissionTitle,
        submissionDescription: a.submissionDescription,
        submissionGithubUrl: a.submissionGithubUrl,
        submissionLiveAppUrl: a.submissionLiveAppUrl,
        submissionScreenshotUrl: a.submissionScreenshotUrl,
        teamName: anonymize ? null : a.teamName,
        isComplete: a.isComplete,
        notes: a.notes,
      })),
    }
  }, {
    detail: {
      summary: "List my judging assignments",
      description: "Returns the authenticated judge's assignments for a hackathon. Requires Clerk session.",
    },
  })
  .patch(
    "/hackathons/:slug/judging/assignments/:assignmentId/notes",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const { saveNotes } = await import("@/lib/services/judging")
      const success = await saveNotes(params.assignmentId, userId, (body as { notes: string }).notes)

      if (!success) {
        return new Response(
          JSON.stringify({ error: "Failed to save notes" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      return { success: true }
    },
    {
      detail: {
        summary: "Save judge notes",
        description: "Saves private notes for a judging assignment.",
      },
    }
  )
  .get("/hackathons/:slug/judging/picks", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const regInfo = await getRegistrationInfo(hackathon.id, userId)
    if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
      return new Response(
        JSON.stringify({ error: "Not a judge" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgePicks } = await import("@/lib/services/judge-picks")
    const picks = await getJudgePicks(hackathon.id, regInfo.participantId)

    return {
      picks: picks.map((p) => ({
        id: p.id,
        prizeId: p.prize_id,
        submissionId: p.submission_id,
        rank: p.rank,
        reason: p.reason,
      })),
    }
  }, {
    detail: {
      summary: "Get judge's picks",
      description: "Returns all picks for the current judge in subjective judging mode.",
    },
  })
  .post(
    "/hackathons/:slug/judging/picks",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const { getRegistrationInfo } = await import("@/lib/services/hackathons")
      const regInfo = await getRegistrationInfo(hackathon.id, userId)
      if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
        return new Response(
          JSON.stringify({ error: "Not a judge" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      const typedBody = body as { prizeId: string; submissionId: string; rank?: number; reason?: string }
      const { submitPick } = await import("@/lib/services/judge-picks")
      const result = await submitPick(
        hackathon.id,
        regInfo.participantId,
        typedBody.prizeId,
        typedBody.submissionId,
        typedBody.rank ?? 1,
        typedBody.reason
      )

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const { calculatePrizeResults } = await import("@/lib/services/judging")
      calculatePrizeResults(hackathon.id, typedBody.prizeId).catch((err) => {
        console.error(`[judging] auto-recalculate failed for prize ${typedBody.prizeId}:`, err)
      })

      return { id: result.pick.id }
    },
    {
      detail: {
        summary: "Submit a judge pick",
        description: "Submits a pick for a prize category in subjective judging mode.",
      },
      body: t.Object({
        prizeId: t.String(),
        submissionId: t.String(),
        rank: t.Optional(t.Number({ minimum: 1 })),
        reason: t.Optional(t.String()),
      }),
    }
  )
  .delete("/hackathons/:slug/judging/picks/:prizeId/:submissionId", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const regInfo = await getRegistrationInfo(hackathon.id, userId)
    if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
      return new Response(
        JSON.stringify({ error: "Not a judge" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const { removePick } = await import("@/lib/services/judge-picks")
    const success = await removePick(hackathon.id, regInfo.participantId, params.prizeId, params.submissionId)

    if (!success) {
      return new Response(
        JSON.stringify({ error: "Pick not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { calculatePrizeResults } = await import("@/lib/services/judging")
    calculatePrizeResults(hackathon.id, params.prizeId).catch((err) => {
      console.error(`[judging] auto-recalculate failed for prize ${params.prizeId}:`, err)
    })

    return { success: true }
  }, {
    detail: {
      summary: "Remove a judge pick",
      description: "Removes a pick for a prize category in subjective judging mode.",
    },
  })
  .get("/hackathons/:slug/judging/track-assignments", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)
    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getRegistrationInfo } = await import("@/lib/services/hackathons")
    const regInfo = await getRegistrationInfo(hackathon.id, userId)
    if (regInfo.participantRole !== "judge" || !regInfo.participantId) {
      return new Response(
        JSON.stringify({ error: "Not a judge" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgeTrackAssignments } = await import("@/lib/services/prize-tracks")
    const tracks = await getJudgeTrackAssignments(hackathon.id, regInfo.participantId)

    return { tracks }
  }, {
    detail: {
      summary: "Get judge track assignments",
      description: "Returns the authenticated judge's prize track assignments with progress.",
    },
  })
  .post(
    "/hackathons/:slug/judging/assignments/:assignmentId/bucket-sort",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (hackathon.status !== "judging" && hackathon.status !== "active") {
        return new Response(
          JSON.stringify({ error: "Hackathon is not in judging phase", code: "not_judging" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const { verifyAssignmentOwnership } = await import("@/lib/services/judging")
      const ownerCheck = await verifyAssignmentOwnership(params.assignmentId, userId)
      if (!ownerCheck) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const { submitBucketSortResponse } = await import("@/lib/services/prize-tracks")
      const result = await submitBucketSortResponse(params.assignmentId, {
        gates: body.gates ?? [],
        bucketId: body.bucketId,
        notes: body.notes,
      })

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error, code: result.code }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const { recalculateForAssignment } = await import("@/lib/services/judging")
      recalculateForAssignment(params.assignmentId).catch((err) => {
        console.error(`[judging] auto-recalculate failed for assignment ${params.assignmentId}:`, err)
      })

      return { success: true }
    },
    {
      detail: {
        summary: "Submit bucket sort response",
        description: "Submits a bucket sort evaluation (gate responses + bucket placement) for a judging assignment.",
      },
      body: t.Object({
        gates: t.Optional(t.Array(t.Object({
          criteriaId: t.String(),
          passed: t.Boolean(),
        }))),
        bucketId: t.String(),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/hackathons/:slug/judging/assignments/:assignmentId/gate-check",
    async ({ params, body }) => {
      const { userId } = await auth()

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      }

      const hackathon = await getPublicHackathon(params.slug)
      if (!hackathon) {
        return new Response(
          JSON.stringify({ error: "Hackathon not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      if (hackathon.status !== "judging" && hackathon.status !== "active") {
        return new Response(
          JSON.stringify({ error: "Hackathon is not in judging phase", code: "not_judging" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const { verifyAssignmentOwnership } = await import("@/lib/services/judging")
      const ownerCheck = await verifyAssignmentOwnership(params.assignmentId, userId)
      if (!ownerCheck) {
        return new Response(
          JSON.stringify({ error: "Assignment not found", code: "not_found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      const { submitGateCheckResponse } = await import("@/lib/services/prize-tracks")
      const result = await submitGateCheckResponse(params.assignmentId, body.gates)

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error, code: result.code }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const { recalculateForAssignment } = await import("@/lib/services/judging")
      recalculateForAssignment(params.assignmentId).catch((err) => {
        console.error(`[judging] auto-recalculate failed for assignment ${params.assignmentId}:`, err)
      })

      return { success: true }
    },
    {
      detail: {
        summary: "Submit gate check response",
        description: "Submits gate check evaluation (binary pass/fail per criterion) for a judging assignment.",
      },
      body: t.Object({
        gates: t.Array(t.Object({
          criteriaId: t.String(),
          passed: t.Boolean(),
        })),
      }),
    }
  )
  .get("/judge-invitations/:token", async ({ params }) => {
    const { getJudgeInvitationByToken } = await import("@/lib/services/judge-invitations")
    const invitation = await getJudgeInvitationByToken(params.token)

    if (!invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const now = new Date()
    const isExpired = new Date(invitation.expires_at) < now

    return {
      id: invitation.id,
      status: isExpired && invitation.status === "pending" ? "expired" : invitation.status,
      hackathonName: invitation.hackathon.name,
      hackathonSlug: invitation.hackathon.slug,
      email: invitation.email,
      expiresAt: invitation.expires_at,
    }
  }, {
    detail: {
      summary: "Get judge invitation",
      description: "Returns judge invitation details by token.",
    },
  })
  .post("/judge-invitations/:token/accept", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const userEmails = user.emailAddresses.map((e) => e.emailAddress)

    if (userEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No email address found", code: "no_email" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { acceptJudgeInvitation } = await import("@/lib/services/judge-invitations")
    const result = await acceptJudgeInvitation(params.token, userId, userEmails)

    if (!result.success) {
      const statusCode = result.code === "not_found" ? 404 : 400
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true, hackathonSlug: result.hackathonSlug }
  }, {
    detail: {
      summary: "Accept judge invitation",
      description: "Accepts a judge invitation and adds user as judge. Requires Clerk session.",
    },
  })
  .post("/judge-invitations/:token/decline", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getJudgeInvitationByToken } = await import("@/lib/services/judge-invitations")
    const { cancelJudgeInvitation } = await import("@/lib/services/judge-invitations")

    const invitation = await getJudgeInvitationByToken(params.token)
    if (!invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found", code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const result = await cancelJudgeInvitation(invitation.id, invitation.hackathon_id)
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true }
  }, {
    detail: {
      summary: "Decline judge invitation",
      description: "Declines a judge invitation. Requires Clerk session.",
    },
  })
  .get("/hackathons/:slug/results", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getPublicResults } = await import("@/lib/services/results")
    const results = await getPublicResults(hackathon.id)

    if (!results) {
      return new Response(
        JSON.stringify({ error: "Results not yet published" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    return {
      results: results.map((r) => ({
        rank: r.rank,
        submissionTitle: r.submissionTitle,
        teamName: r.teamName,
        weightedScore: r.weighted_score,
        judgeCount: r.judge_count,
        prizes: r.prizes,
      })),
    }
  }, {
    detail: {
      summary: "Get public results",
      description: "Returns published results and rankings for a hackathon.",
    },
  })
  .get("/hackathons/:slug/judges", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { listJudgeDisplayProfiles } = await import("@/lib/services/judge-display")
    const judges = await listJudgeDisplayProfiles(hackathon.id)

    return {
      judges: judges.map((j) => ({
        id: j.id,
        name: j.name,
        title: j.title,
        organization: j.organization,
        headshotUrl: j.headshot_url,
      })),
    }
  }, {
    detail: {
      summary: "List judges",
      description: "Returns public judge display profiles for a hackathon.",
    },
  })
  .get("/hackathons/:slug/prizes", async ({ params }) => {
    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { listPrizes } = await import("@/lib/services/prizes")
    const { listPrizeAssignments } = await import("@/lib/services/prizes")
    const [prizes, assignments] = await Promise.all([
      listPrizes(hackathon.id),
      listPrizeAssignments(hackathon.id),
    ])

    return {
      prizes: prizes.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        value: p.value,
        type: p.type,
        rank: p.rank,
        winner: assignments.find((a) => a.prize_id === p.id)
          ? {
              submissionTitle: assignments.find((a) => a.prize_id === p.id)!.submissionTitle,
              teamName: assignments.find((a) => a.prize_id === p.id)!.teamName,
            }
          : null,
      })),
    }
  }, {
    detail: {
      summary: "List prizes",
      description: "Returns prizes for a hackathon with winner info for completed events.",
    },
  })
  .post("/hackathons/:slug/vote", async ({ params, body }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { castVote } = await import("@/lib/services/crowd-voting")
    const result = await castVote(hackathon.id, body.submissionId, userId)

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true }
  }, {
    detail: {
      summary: "Cast vote",
      description: "Casts a vote for a submission. One vote per user per hackathon. Requires Clerk session.",
    },
    body: t.Object({
      submissionId: t.String({ description: "The submission ID to vote for" }),
    }),
  })
  .delete("/hackathons/:slug/vote", async ({ params }) => {
    const { userId } = await auth()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Sign in required", code: "not_authenticated" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { removeVote } = await import("@/lib/services/crowd-voting")
    const success = await removeVote(hackathon.id, userId)

    if (!success) {
      return new Response(
        JSON.stringify({ error: "Failed to remove vote" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    return { success: true }
  }, {
    detail: {
      summary: "Remove vote",
      description: "Removes user's vote for a hackathon. Requires Clerk session.",
    },
  })
  .get("/cli-auth/poll", async ({ query }) => {
    if (query.token.length < 32) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { createCliAuthSession, pollCliAuthSession } = await import("@/lib/services/cli-auth")

    let result = await pollCliAuthSession(query.token)

    if (result.status === "expired") {
      try {
        await createCliAuthSession(query.token)
        result = { status: "pending" }
      } catch {
        return { status: "pending" }
      }
    }

    return result
  }, {
    detail: {
      summary: "Poll CLI auth session",
      description: "Polls for CLI authentication completion. Creates session on first call. Returns status and API key when complete.",
    },
    query: t.Object({
      token: t.String({ minLength: 1, description: "The device token from the CLI" }),
    }),
  })
  .get("/hackathons/:slug/vote", async ({ params }) => {
    const { userId } = await auth()

    const hackathon = await getPublicHackathon(params.slug)

    if (!hackathon) {
      return new Response(
        JSON.stringify({ error: "Hackathon not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const { getVoteCounts, getUserVote } = await import("@/lib/services/crowd-voting")
    const [counts, userVote] = await Promise.all([
      getVoteCounts(hackathon.id),
      userId ? getUserVote(hackathon.id, userId) : Promise.resolve(null),
    ])

    return {
      userVote,
      counts,
    }
  }, {
    detail: {
      summary: "Get vote info",
      description: "Returns vote counts per submission and user's current vote.",
    },
  })
