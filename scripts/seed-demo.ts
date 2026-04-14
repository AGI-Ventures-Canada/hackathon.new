import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in environment")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const DEV_USER = {
  clerkUserId: "user_38vEFI8UesKwM07qIuFNqEzFavS",
  name: "Hai The Dude",
}

async function seedDemo() {
  console.log("Starting demo seed...")

  console.log("Creating/updating personal tenant for dev user...")
  const { data: existingPersonal } = await supabase
    .from("tenants")
    .select("id")
    .eq("clerk_user_id", DEV_USER.clerkUserId)
    .single()

  if (!existingPersonal) {
    const { error: personalError } = await supabase
      .from("tenants")
      .insert({
        clerk_user_id: DEV_USER.clerkUserId,
        name: DEV_USER.name,
        slug: "hai",
        description: "Personal workspace",
      })

    if (personalError) {
      console.error("Failed to create personal tenant:", personalError)
    } else {
      console.log("Created personal tenant for dev user")
    }
  } else {
    console.log("Personal tenant already exists for dev user")
  }

  console.log("Looking for AGIVC tenant...")
  let { data: agivcTenant } = await supabase
    .from("tenants")
    .select("id, clerk_org_id, name")
    .ilike("name", "%AGI%")
    .single()

  if (!agivcTenant) {
    console.log("AGIVC tenant not found. Using personal tenant for demo hackathon...")
    const { data: personalTenant } = await supabase
      .from("tenants")
      .select("id, clerk_org_id, name")
      .eq("clerk_user_id", DEV_USER.clerkUserId)
      .single()

    if (!personalTenant) {
      console.error("No personal tenant found either. Run the script again after the app creates one.")
      process.exit(1)
    }

    agivcTenant = personalTenant
  }

  console.log(`Using tenant: ${agivcTenant.name} (${agivcTenant.id})`)

  const { error: updateError } = await supabase
    .from("tenants")
    .update({
      slug: "agivc",
      description: "AGI Ventures Canada - Advancing AI innovation through hackathons and community.",
      website_url: "https://agiventures.ca",
    })
    .eq("id", agivcTenant.id)
    .select()
    .single()

  if (updateError) {
    console.error("Failed to update AGIVC tenant:", updateError)
  } else {
    console.log("Updated AGIVC tenant with slug and description")
  }

  let tavilyTenantId: string | null = null
  const TAVILY_CLERK_ORG_ID = "org_3998gS77efJrXAYJfwOU2AQRrXI"

  const { data: tavilyTenant } = await supabase
    .from("tenants")
    .select("id, name")
    .or(`clerk_org_id.eq.${TAVILY_CLERK_ORG_ID},name.ilike.%Tavily%`)
    .single()

  if (tavilyTenant) {
    console.log(`Found Tavily tenant: ${tavilyTenant.name} (${tavilyTenant.id})`)
    tavilyTenantId = tavilyTenant.id

    await supabase
      .from("tenants")
      .update({
        name: "Tavily",
        slug: "tavily",
        clerk_org_id: TAVILY_CLERK_ORG_ID,
        description: "Tavily - AI-native search API for LLMs and AI agents.",
        website_url: "https://tavily.com",
      })
      .eq("id", tavilyTenant.id)
    console.log("Updated Tavily tenant with slug and clerk_org_id")
  } else {
    console.log("Creating Tavily tenant...")
    const { data: newTavily, error: tavilyError } = await supabase
      .from("tenants")
      .insert({
        name: "Tavily",
        slug: "tavily",
        clerk_org_id: TAVILY_CLERK_ORG_ID,
        description: "Tavily - AI-native search API for LLMs and AI agents.",
        website_url: "https://tavily.com",
      })
      .select()
      .single()

    if (tavilyError) {
      console.error("Failed to create Tavily tenant:", tavilyError)
    } else if (newTavily) {
      tavilyTenantId = newTavily.id
      console.log(`Created Tavily tenant: ${newTavily.name} (${newTavily.id})`)
    }
  }

  console.log("Checking for existing Research Agents hackathon...")
  const { data: existingHackathon } = await supabase
    .from("hackathons")
    .select("id")
    .eq("slug", "research-agents")
    .single()

  if (existingHackathon) {
    console.log("Research Agents hackathon already exists, updating...")

    await supabase
      .from("hackathons")
      .update({
        name: "Research Agents Hackathon",
        description: `Build the next generation of AI research agents!

This hackathon challenges developers to create innovative AI agents that can conduct research, gather information, and synthesize knowledge from various sources.

Whether you're building document analysis tools, web research assistants, or multi-modal knowledge systems, we want to see what you can create.

Prizes:
- 1st Place: $10,000
- 2nd Place: $5,000
- 3rd Place: $2,500
- Best Use of Tavily API: $2,500`,
        rules: `1. Teams of 1-4 people
2. All code must be written during the hackathon
3. Must use at least one AI API (OpenAI, Anthropic, etc.)
4. Projects must be open source
5. Submissions due by end of hackathon`,
        status: "registration_open",
        starts_at: new Date("2026-02-15T09:00:00Z").toISOString(),
        ends_at: new Date("2026-02-17T18:00:00Z").toISOString(),
        registration_opens_at: new Date("2026-02-01T00:00:00Z").toISOString(),
        registration_closes_at: new Date("2026-02-14T23:59:59Z").toISOString(),
      })
      .eq("id", existingHackathon.id)

    console.log("Updated existing hackathon")
    await addSponsors(existingHackathon.id, tavilyTenantId)
  } else {
    console.log("Creating Research Agents hackathon...")

    const { data: newHackathon, error: hackathonError } = await supabase
      .from("hackathons")
      .insert({
        tenant_id: agivcTenant.id,
        name: "Research Agents Hackathon",
        slug: "research-agents",
        description: `Build the next generation of AI research agents!

This hackathon challenges developers to create innovative AI agents that can conduct research, gather information, and synthesize knowledge from various sources.

Whether you're building document analysis tools, web research assistants, or multi-modal knowledge systems, we want to see what you can create.

Prizes:
- 1st Place: $10,000
- 2nd Place: $5,000
- 3rd Place: $2,500
- Best Use of Tavily API: $2,500`,
        rules: `1. Teams of 1-4 people
2. All code must be written during the hackathon
3. Must use at least one AI API (OpenAI, Anthropic, etc.)
4. Projects must be open source
5. Submissions due by end of hackathon`,
        status: "registration_open",
        starts_at: new Date("2026-02-15T09:00:00Z").toISOString(),
        ends_at: new Date("2026-02-17T18:00:00Z").toISOString(),
        registration_opens_at: new Date("2026-02-01T00:00:00Z").toISOString(),
        registration_closes_at: new Date("2026-02-14T23:59:59Z").toISOString(),
        min_team_size: 1,
        max_team_size: 4,
        allow_solo: true,
      })
      .select()
      .single()

    if (hackathonError || !newHackathon) {
      console.error("Failed to create hackathon:", hackathonError)
      process.exit(1)
    }

    console.log(`Created hackathon: ${newHackathon.name} (${newHackathon.id})`)
    await addSponsors(newHackathon.id, tavilyTenantId)
  }

  console.log("\nDemo seed completed!")
  console.log("\nTest the following URLs:")
  console.log("- Event page: http://localhost:3000/e/research-agents")
  console.log("- Org page: http://localhost:3000/o/agivc")
  if (tavilyTenantId) {
    console.log("- Tavily page: http://localhost:3000/o/tavily")
  }
}

async function addSponsors(hackathonId: string, tavilyTenantId: string | null) {
  console.log("Adding sponsors...")

  await supabase
    .from("hackathon_sponsors")
    .delete()
    .eq("hackathon_id", hackathonId)

  const sponsors = [
    {
      hackathon_id: hackathonId,
      name: "Tavily",
      logo_url: null,
      website_url: "https://tavily.com",
      tier: "custom",
      custom_tier_label: "Title",
      display_order: 0,
      sponsor_tenant_id: tavilyTenantId,
    },
    {
      hackathon_id: hackathonId,
      name: "Langchain",
      logo_url: null,
      website_url: "https://langchain.com",
      tier: "gold",
      display_order: 1,
      sponsor_tenant_id: null,
    },
    {
      hackathon_id: hackathonId,
      name: "AGI House",
      logo_url: null,
      website_url: "https://agihouse.ai",
      tier: "gold",
      display_order: 2,
      sponsor_tenant_id: null,
    },
  ]

  const { error: sponsorsError } = await supabase
    .from("hackathon_sponsors")
    .insert(sponsors)

  if (sponsorsError) {
    console.error("Failed to add sponsors:", sponsorsError)
  } else {
    console.log(`Added ${sponsors.length} sponsors`)
  }
}

seedDemo().catch(console.error)
