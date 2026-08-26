import { notFound } from "next/navigation"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { RoomGrid } from "@/components/hackathon/display/room-grid"
import { buildPollPayload } from "@/lib/services/polling"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  return {
    title: hackathon ? `Rooms | ${hackathon.name}` : "Rooms",
  }
}

export default async function DisplayRoomsPage({ params }: PageProps) {
  const { slug } = await params

  const hackathon = await getPublicHackathon(slug)
  if (!hackathon) notFound()

  const poll = await buildPollPayload(hackathon.id)
  const initialRooms = poll?.timers.rooms ?? []

  return <RoomGrid slug={slug} initialRooms={initialRooms} />
}
