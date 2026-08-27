import { getOrCreateTenant, createTestHackathon, printReady, promptForOptionalTenantId } from "./_helpers"

const SLUG = "test-pre-registration"

async function run() {
  console.log("Setting up pre-registration scenario...")

  const overrideTenantId = await promptForOptionalTenantId()
  const tenantId = await getOrCreateTenant(overrideTenantId)

  const now = new Date()
  await createTestHackathon({
    tenantId,
    slug: SLUG,
    name: "Pre-Registration Test Hackathon",
    status: "published",
    startsAt: new Date(now.getTime() + 7 * 86400000),
    endsAt: new Date(now.getTime() + 9 * 86400000),
    registrationOpensAt: new Date(now.getTime() + 1 * 86400000),
    registrationClosesAt: new Date(now.getTime() + 6 * 86400000),
  })

  console.log("Hackathon created. Dev user is NOT registered.")
  printReady(SLUG)
}

await run()
