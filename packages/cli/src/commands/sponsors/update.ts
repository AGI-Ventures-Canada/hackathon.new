import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"

interface SponsorUpdateOptions {
  name?: string
  tier?: string
  customTierLabel?: string
  logoUrl?: string
  websiteUrl?: string
  sponsorTenantId?: string
  useOrgAssets?: boolean
  displayOrder?: number
  json?: boolean
}

const VALID_TIERS = ["none", "gold", "silver", "bronze", "custom"] as const

export function parseSponsorUpdateOptions(args: string[]): SponsorUpdateOptions {
  const options: SponsorUpdateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i]
        break
      case "--tier":
        options.tier = args[++i]
        break
      case "--custom-tier-label":
        options.customTierLabel = args[++i]
        break
      case "--logo-url":
        options.logoUrl = args[++i]
        break
      case "--website":
      case "--website-url":
        options.websiteUrl = args[++i]
        break
      case "--sponsor-tenant-id":
        options.sponsorTenantId = args[++i]
        break
      case "--use-org-assets":
        options.useOrgAssets = true
        break
      case "--display-order":
        options.displayOrder = Number(args[++i])
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runSponsorsUpdate(
  client: OatmealClient,
  hackathonId: string,
  sponsorId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !sponsorId) {
    console.error("Usage: hackathon sponsors update <hackathon-id> <sponsor-id> [--name ...]")
    process.exit(1)
  }

  const options = parseSponsorUpdateOptions(args)

  if (options.tier !== undefined && !VALID_TIERS.includes(options.tier as (typeof VALID_TIERS)[number])) {
    console.error(`Error: --tier must be one of ${VALID_TIERS.join(", ")}`)
    process.exit(1)
  }

  const body: Record<string, unknown> = {}
  if (options.name !== undefined) body.name = options.name
  if (options.tier !== undefined) body.tier = options.tier
  if (options.customTierLabel !== undefined) body.customTierLabel = options.customTierLabel
  if (options.logoUrl !== undefined) body.logoUrl = options.logoUrl
  if (options.websiteUrl !== undefined) body.websiteUrl = options.websiteUrl
  if (options.sponsorTenantId !== undefined) body.sponsorTenantId = options.sponsorTenantId
  if (options.useOrgAssets !== undefined) body.useOrgAssets = options.useOrgAssets
  if (options.displayOrder !== undefined) body.displayOrder = options.displayOrder

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const response = await client.patch<{ id: string; updatedAt?: string }>(
    `/api/dashboard/hackathons/${hackathonId}/sponsors/${sponsorId}`,
    body
  )

  if (options.json) {
    console.log(formatJson(response))
    return
  }

  console.log(formatSuccess(`Updated sponsor ${response.id}`))
}
