import { notFound } from "next/navigation"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { FullscreenTimer } from "@/components/hackathon/display/fullscreen-timer"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ room?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  return {
    title: hackathon ? `Timer | ${hackathon.name}` : "Timer",
  }
}

export default async function DisplayTimerPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { room: roomId } = await searchParams

  const hackathon = await getPublicHackathon(slug)
  if (!hackathon) notFound()

  return (
    <FullscreenTimer
      slug={slug}
      initialEndsAt={hackathon.ends_at}
      initialLabel={hackathon.status === "active" ? "Build ends" : null}
      initialPhase={hackathon.phase}
      hackathonName={hackathon.name}
      roomId={roomId}
    />
  )
}
