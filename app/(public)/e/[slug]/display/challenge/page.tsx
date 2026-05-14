import { notFound } from "next/navigation"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { listChallenges } from "@/lib/services/challenges"
import { FullscreenChallenge } from "@/components/hackathon/display/fullscreen-challenge"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })

  return {
    title: hackathon ? `Challenge | ${hackathon.name}` : "Challenge",
  }
}

export default async function DisplayChallengePage({ params }: PageProps) {
  const { slug } = await params

  const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })
  if (!hackathon) notFound()

  const challenges = await listChallenges(hackathon.id)

  return (
    <FullscreenChallenge
      slug={slug}
      initialChallenges={challenges}
      hackathonName={hackathon.name}
    />
  )
}
