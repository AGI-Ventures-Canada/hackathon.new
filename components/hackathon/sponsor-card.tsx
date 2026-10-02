import Link from "next/link"
import type { HackathonSponsor, TenantProfile } from "@/lib/db/hackathon-types"

type SponsorWithTenant = HackathonSponsor & {
  tenant?: Pick<
    TenantProfile,
    "slug" | "name" | "logo_url" | "logo_url_dark" | "website_url" | "description"
  > | null
}

interface SponsorCardProps {
  sponsor: SponsorWithTenant
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "h-12 w-24",
  md: "h-16 w-32",
  lg: "h-20 w-40",
}

export function SponsorCard({ sponsor, size = "md" }: SponsorCardProps) {
  const org = sponsor.tenant
  const useOrgAssets = sponsor.use_org_assets && !!org
  const lightLogoUrl = useOrgAssets
    ? org?.logo_url || sponsor.logo_url
    : sponsor.logo_url
  const darkLogoUrl = useOrgAssets
    ? org?.logo_url_dark || org?.logo_url || sponsor.logo_url_dark
    : sponsor.logo_url_dark
  const name = useOrgAssets ? org?.name || sponsor.name : sponsor.name
  const href = useOrgAssets
    ? org?.slug
      ? `/o/${org.slug}`
      : org?.website_url || sponsor.website_url
    : sponsor.website_url || (org?.slug ? `/o/${org.slug}` : org?.website_url)

  const content = (
    <div
      className={`${sizeClasses[size]} relative flex items-center justify-center rounded-lg border transition-colors`}
    >
      {lightLogoUrl ? (
        <>
          <div className="absolute inset-0 bg-[#f5f5f4] dark:hidden rounded-lg" />
          <div className="absolute inset-0 bg-[#262626] hidden dark:block rounded-lg" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightLogoUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            className="relative max-h-[70%] max-w-[85%] object-contain dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={darkLogoUrl || lightLogoUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            className="relative max-h-[70%] max-w-[85%] object-contain hidden dark:block"
          />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-muted/50 rounded-lg" />
          <span className="relative text-xs text-muted-foreground text-center px-2 break-words line-clamp-2">
            {name}
          </span>
        </>
      )}
    </div>
  )

  if (href) {
    const isExternal = href.startsWith("http")
    return (
      <Link
        href={href}
        title={name}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {content}
      </Link>
    )
  }

  return <div title={name}>{content}</div>
}
