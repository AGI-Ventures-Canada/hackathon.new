import { createClient } from "@supabase/supabase-js"
import { createClerkClient } from "@clerk/backend"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const clerkSecretKey = process.env.CLERK_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const clerk = createClerkClient({ secretKey: clerkSecretKey })

async function backfillTenantNames() {
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name, clerk_org_id, clerk_user_id")
    .or("name.like.Org org_%,name.like.Personal user_%,name.eq.Unnamed Organization,name.eq.Personal Account")

  if (error || !tenants) {
    console.error("Failed to fetch tenants:", error)
    process.exit(1)
  }

  console.log(`Found ${tenants.length} tenants with fallback names`)

  let updated = 0
  let failed = 0

  for (const tenant of tenants) {
    try {
      let resolvedName: string | null = null

      if (tenant.clerk_org_id) {
        const org = await clerk.organizations.getOrganization({
          organizationId: tenant.clerk_org_id,
        })
        resolvedName = org.name
      } else if (tenant.clerk_user_id) {
        const user = await clerk.users.getUser(tenant.clerk_user_id)
        resolvedName =
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.emailAddresses[0]?.emailAddress ||
          null
      }

      if (resolvedName && resolvedName !== tenant.name) {
        const { error: updateErr } = await supabase
          .from("tenants")
          .update({ name: resolvedName, updated_at: new Date().toISOString() })
          .eq("id", tenant.id)

        if (updateErr) {
          console.error(`Failed to update tenant ${tenant.id}:`, updateErr)
          failed++
        } else {
          console.log(`Updated: "${tenant.name}" → "${resolvedName}"`)
          updated++
        }
      }
    } catch (err) {
      console.error(`Failed to resolve name for tenant ${tenant.id}:`, err)
      failed++
    }
  }

  console.log(
    `Done. Updated: ${updated}, Failed: ${failed}, Skipped: ${tenants.length - updated - failed}`
  )
}

backfillTenantNames()
