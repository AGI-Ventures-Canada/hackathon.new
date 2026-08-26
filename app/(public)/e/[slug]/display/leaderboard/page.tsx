import { notFound } from "next/navigation"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { FullscreenLeaderboard } from "@/components/hackathon/display/fullscreen-leaderboard"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  return {
    title: hackathon ? `Leaderboard | ${hackathon.name}` : "Leaderboard",
  }
}

export default async function DisplayLeaderboardPage({ params }: PageProps) {
  const { slug } = await params

  const hackathon = await getPublicHackathon(slug)
  if (!hackathon) notFound()

  return (
    <FullscreenLeaderboard slug={slug} hackathonName={hackathon.name} />
  )
}
