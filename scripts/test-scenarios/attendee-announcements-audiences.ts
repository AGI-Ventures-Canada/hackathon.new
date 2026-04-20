import {
  getOrCreateTenant,
  createTestHackathon,
  createTeamWithMembers,
  createAnnouncementSeed,
  DEV_USER_ID,
  printReady,
  promptForOptionalTenantId,
  type AnnouncementAudience,
} from "./_helpers"

const SLUG = "test-attendee-announcements-audiences"

async function run() {
  console.log("Setting up attendee-announcements-audiences scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  const hackathonId = await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Announcements Audience Test",
    status: "active",
    startsAt: new Date(now.getTime() - 1 * 86400000),
    endsAt: new Date(now.getTime() + 6 * 86400000),
  })

  await createTeamWithMembers(hackathonId, DEV_USER_ID, [])

  const audiences: AnnouncementAudience[] = [
    "everyone",
    "organizers",
    "judges",
    "mentors",
    "attendees",
    "submitted",
    "not_submitted",
  ]

  for (const audience of audiences) {
    await createAnnouncementSeed(hackathonId, {
      title: `[${audience}] Targeted announcement`,
      body: `This announcement should ONLY be visible to: **${audience}**. If a registered non-submitted attendee sees all 7 on the event page, the audience filter is broken.`,
      audience,
    })
  }

  console.log("Seeded 7 announcements, one per audience enum value.")
  console.log("Dev user is a registered attendee (not submitted). Expect to see: everyone, attendees, not_submitted.")
  console.log("If the event page shows all 7 → confirms the `listPublishedAnnouncements` audience-filter bug.")
  printReady(SLUG)
}

run().catch(console.error)
