import { ImageResponse } from "next/og"
import { getPublicHackathon } from "@/lib/services/public-hackathons"

export const runtime = "edge"
export const alt = "Hackathon"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

type Props = {
  params: Promise<{ slug: string }>
}

export default async function Image({ params }: Props) {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  if (!hackathon) {
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
          Hackathon Not Found
        </div>
      ),
      { ...size }
    )
  }

  const formatDate = (date: string | null) => {
    if (!date) return ""
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const dateRange = hackathon.starts_at
    ? hackathon.ends_at
      ? `${formatDate(hackathon.starts_at)} - ${formatDate(hackathon.ends_at)}`
      : formatDate(hackathon.starts_at)
    : "Dates TBD"

  const topSponsors = hackathon.sponsors
    .filter((s) => s.tier === "custom" || s.tier === "gold")
    .slice(0, 4)

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
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
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 24,
              color: "#888",
              marginBottom: 16,
            }}
          >
            Organized by {hackathon.organizer.name}
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: "bold",
              marginBottom: 24,
              lineHeight: 1.1,
            }}
          >
            {hackathon.name}
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#888",
            }}
          >
            {dateRange}
          </div>
        </div>

        {topSponsors.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              borderTop: "1px solid #333",
              paddingTop: 32,
            }}
          >
            <span style={{ fontSize: 16, color: "#666" }}>Sponsors</span>
            <div style={{ display: "flex", gap: 16 }}>
              {topSponsors.map((sponsor, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#1a1a1a",
                    fontSize: 14,
                    color: "#999",
                  }}
                >
                  {sponsor.name}
                </div>
              ))}
            </div>
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
          oatmeal.dev
        </div>
      </div>
    ),
    { ...size }
  )
}
