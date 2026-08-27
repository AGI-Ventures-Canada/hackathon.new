import {
  getOrCreateAttendeeTenant,
  createTestHackathon,
  createTeamWithMembers,
  createPerkSeed,
  DEV_USER_ID,
  printReady,
  promptForOptionalTenantId,
} from "./_helpers"

const SLUG = "test-attendee-perks-mixed"

async function run() {
  console.log("Setting up attendee-perks-mixed scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateAttendeeTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Perks Mixed Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  await createTeamWithMembers(hackathonId, DEV_USER_ID, [])

  await createPerkSeed(hackathonId, {
    name: "OpenAI API Credits",
    description: "$50 in credits, already released to teams",
    type: "api_key",
    code: "sk-released-example",
    releasedAt: new Date(now.getTime() - 3600_000),
    sortOrder: 0,
  })

  await createPerkSeed(hackathonId, {
    name: "Anthropic Credits",
    description: "Scheduled to release in 24 hours",
    type: "credit",
    code: "anthropic-scheduled",
    scheduledReleaseAt: new Date(now.getTime() + 86400000),
    sortOrder: 1,
  })

  await createPerkSeed(hackathonId, {
    name: "Surprise Swag Coupon",
    description: "Hidden until manually released — no schedule, no released_at",
    type: "coupon",
    code: "HIDDEN-SURPRISE",
    scheduledReleaseAt: new Date(now.getTime() + 7 * 86400000),
    sortOrder: 2,
  })

  await createPerkSeed(hackathonId, {
    name: "Sponsor Deck",
    description: "Link perk (no code), released",
    type: "other",
    redemptionUrl: "https://example.com/sponsor-deck.pdf",
    releasedAt: new Date(now.getTime() - 7200_000),
    sortOrder: 3,
  })

  console.log("Seeded 4 perks: released / scheduled-future / hidden / link-only.")
  console.log("Expect only the released and link-released perks to be visible to attendees.")
  printReady(SLUG)
}

await run()
