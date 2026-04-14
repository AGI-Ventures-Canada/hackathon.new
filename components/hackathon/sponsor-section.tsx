import { SponsorCard } from "./sponsor-card"
import type { HackathonSponsor, SponsorTier, TenantProfile } from "@/lib/db/hackathon-types"

type SponsorWithTenant = HackathonSponsor & {
  tenant?: Pick<
    TenantProfile,
    "slug" | "name" | "logo_url" | "logo_url_dark" | "website_url" | "description"
  > | null
}

interface SponsorSectionProps {
  sponsors: SponsorWithTenant[]
}

const tierOrder: SponsorTier[] = ["custom", "gold", "silver", "bronze", "none"]

const tierLabels: Record<SponsorTier, string> = {
  custom: "Sponsors",
  gold: "Gold Sponsors",
  silver: "Silver Sponsors",
  bronze: "Bronze Sponsors",
  none: "Sponsors",
}

const tierSizes: Record<SponsorTier, "sm" | "md" | "lg"> = {
  custom: "lg",
  gold: "lg",
  silver: "md",
  bronze: "sm",
  none: "md",
}

interface SponsorGroup {
  key: string
  label: string
  size: "sm" | "md" | "lg"
  sponsors: SponsorWithTenant[]
}

function groupSponsors(sponsors: SponsorWithTenant[]): SponsorGroup[] {
  const groups: SponsorGroup[] = []

  for (const tier of tierOrder) {
    const tierSponsors = sponsors.filter((s) => s.tier === tier)
    if (tierSponsors.length === 0) continue

    if (tier === "custom") {
      const byLabel = new Map<string, SponsorWithTenant[]>()
      for (const s of tierSponsors) {
        const label = s.custom_tier_label || "Sponsors"
        const group = byLabel.get(label) ?? []
        group.push(s)
        byLabel.set(label, group)
      }
      for (const [label, subs] of byLabel) {
        groups.push({
          key: `custom-${label}`,
          label: /(?:Sponsors?|Partners?)$/i.test(label) ? label : `${label} Sponsors`,
          size: tierSizes.custom,
          sponsors: subs,
        })
      }
    } else {
      groups.push({
        key: tier,
        label: tierLabels[tier],
        size: tierSizes[tier],
        sponsors: tierSponsors,
      })
    }
  }

  return groups
}

export function SponsorSection({ sponsors }: SponsorSectionProps) {
  if (sponsors.length === 0) {
    return null
  }

  const groups = groupSponsors(sponsors)

  return (
    <section className="py-12">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-2xl font-bold mb-8 text-center">Sponsors</h2>
        <div className="space-y-10">
          {groups.map((group) => (
            <div key={group.key} className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground text-center uppercase tracking-wider">
                {group.label}
              </h3>
              <div className="flex flex-wrap justify-center gap-4">
                {group.sponsors.map((sponsor) => (
                  <SponsorCard
                    key={sponsor.id}
                    sponsor={sponsor}
                    size={group.size}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
