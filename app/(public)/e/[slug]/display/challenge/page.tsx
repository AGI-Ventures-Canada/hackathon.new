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
  const hackathon = await getPublicHackathon(slug)

  return {
    title: hackathon ? `Challenge | ${hackathon.name}` : "Challenge",
  }
}

export default async function DisplayChallengePage({ params }: PageProps) {
  const { slug } = await params

  const hackathon = await getPublicHackathon(slug)
  if (!hackathon) notFound()

  const challenges = hackathon.challenge_released_at
    ? await listChallenges(hackathon.id)
    : []

  return (
    <FullscreenChallenge
      slug={slug}
      initialChallenges={challenges}
      initialReleased={!!hackathon.challenge_released_at}
      hackathonName={hackathon.name}
    />
  )
}
