import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"

interface SponsorAddOptions {
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

export function parseSponsorAddOptions(args: string[]): SponsorAddOptions {
  const options: SponsorAddOptions = {}
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

export async function runSponsorsAdd(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon sponsors add <hackathon-id> --name <name> [--tier ...] [--website ...] [--logo-url ...]")
    process.exit(1)
  }

  const options = parseSponsorAddOptions(args)

  let name = options.name
  if (!name && process.stdout.isTTY) {
    const result = await p.text({
      message: "Sponsor name:",
      validate: (v: string) => (v ? undefined : "Required"),
    })
    if (p.isCancel(result)) return
    name = result
  }

  if (!name) {
    console.error("Error: --name is required")
    process.exit(1)
  }

  if (options.tier && !VALID_TIERS.includes(options.tier as (typeof VALID_TIERS)[number])) {
    console.error(`Error: --tier must be one of ${VALID_TIERS.join(", ")}`)
    process.exit(1)
  }

  const sponsor = await client.post<{ id: string; name: string; tier?: string | null }>(
    `/api/dashboard/hackathons/${hackathonId}/sponsors`,
    {
      name,
      tier: options.tier,
      customTierLabel: options.customTierLabel,
      logoUrl: options.logoUrl,
      websiteUrl: options.websiteUrl,
      sponsorTenantId: options.sponsorTenantId,
      useOrgAssets: options.useOrgAssets,
      displayOrder: options.displayOrder,
    }
  )

  if (options.json) {
    console.log(formatJson(sponsor))
    return
  }

  console.log(formatSuccess(`Added sponsor "${sponsor.name}" (${sponsor.id})`))
}
