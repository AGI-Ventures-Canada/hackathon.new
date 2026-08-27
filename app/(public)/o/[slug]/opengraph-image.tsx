import { ImageResponse } from "next/og"
import { getPublicTenantBySlug } from "@/lib/services/tenant-profiles"

export const alt = "Organization"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

type Props = {
  params: Promise<{ slug: string }>
}

export default async function Image({ params }: Props) {
  const { slug } = await params
  const tenant = await getPublicTenantBySlug(slug)

  if (!tenant) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundColor: "#000",
            color: "#fff",
            fontSize: 48,
          }}
        >
          Organization Not Found
        </div>
      ),
      { ...size }
    )
  }

  const initial = tenant.name.charAt(0).toUpperCase()

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          backgroundColor: "#0a0a0a",
          color: "#fff",
          padding: 60,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            backgroundColor: "#1a1a1a",
            marginBottom: 32,
            fontSize: 56,
            fontWeight: "bold",
          }}
        >
          {initial}
        </div>

        <div
          style={{
            fontSize: 56,
            fontWeight: "bold",
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          {tenant.name}
        </div>

        {tenant.description && (
          <div
            style={{
              fontSize: 24,
              color: "#888",
              textAlign: "center",
              maxWidth: 800,
              lineHeight: 1.4,
            }}
          >
            {tenant.description.length > 120
              ? tenant.description.slice(0, 120) + "..."
              : tenant.description}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            bottom: 30,
            right: 60,
            fontSize: 18,
            color: "#666",
          }}
        >
          hackathon.new
        </div>
      </div>
    ),
    { ...size }
  )
}
