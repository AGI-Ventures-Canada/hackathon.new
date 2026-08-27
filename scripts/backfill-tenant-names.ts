import { createClient } from "@supabase/supabase-js"
import { createClerkClient } from "@clerk/backend"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const clerkSecretKey = process.env.CLERK_SECRET_KEY!

if (!supabaseUrl || !supabaseServiceKey || !clerkSecretKey) {
  throw new Error("Supabase and Clerk credentials are required")
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const clerk = createClerkClient({ secretKey: clerkSecretKey })

async function backfillTenantNames() {
  const tenants: Array<{
    id: string
    name: string
    clerk_org_id: string | null
    clerk_user_id: string | null
  }> = []
  let lastId: string | null = null

  while (true) {
    let query = supabase
      .from("tenants")
      .select("id, name, clerk_org_id, clerk_user_id")
      .or("name.like.Org org_%,name.like.Personal user_%,name.eq.Unnamed Organization,name.eq.Personal Account")
      .order("id")
      .limit(500)
    if (lastId) query = query.gt("id", lastId)

    const { data: page, error } = await query
    if (error) throw error
    if (!page?.length) break
    tenants.push(...page)
    lastId = page[page.length - 1].id
    if (page.length < 500) break
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
        const { data: updatedTenant, error: updateErr } = await supabase
          .from("tenants")
          .update({ name: resolvedName, updated_at: new Date().toISOString() })
          .eq("id", tenant.id)
          .eq("name", tenant.name)
          .select("id")
          .maybeSingle()

        if (updateErr) {
          console.error(`Failed to update tenant ${tenant.id}:`, updateErr)
          failed++
        } else if (updatedTenant) {
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

backfillTenantNames().catch((error) => {
  console.error(error instanceof Error ? error.message : "Tenant backfill failed")
  process.exitCode = 1
})
