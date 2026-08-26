import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { MentorWorkspace } from "@/components/hackathon/mentors/mentor-workspace"
import { AutoRefresh } from "@/components/ui/auto-refresh"
import {
  getMentorQueuePage,
  getMentorParticipantId,
  getQueueStats,
} from "@/lib/services/mentor-requests"
import type { Metadata } from "next"

const MENTOR_QUEUE_REFRESH_INTERVAL_MS = 10_000

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  return {
    title: hackathon ? `Mentor Queue | ${hackathon.name}` : "Mentor Queue",
  }
}

export default async function MentorsPage({ params }: PageProps) {
  const { slug } = await params
  const [{ userId }, hackathon] = await Promise.all([
    auth(),
    getPublicHackathon(slug),
  ])

  if (!hackathon) {
    notFound()
  }

  const [stats, mentorParticipantId] = await Promise.all([
    getQueueStats(hackathon.id),
    userId ? getMentorParticipantId(hackathon.id, userId) : Promise.resolve(null),
  ])
  const queue = mentorParticipantId
    ? await getMentorQueuePage(hackathon.id)
    : { requests: [], total: 0, truncated: false }
  const requests = queue.requests.map((request) => ({
    id: request.id,
    teamName: request.team_name,
    category: request.category,
    description: request.description,
    status: request.status === "claimed" ? "claimed" as const : "open" as const,
    createdAt: request.created_at,
    claimedByMe: request.claimed_by_participant_id === mentorParticipantId,
  }))

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-6">
      {mentorParticipantId && <AutoRefresh intervalMs={MENTOR_QUEUE_REFRESH_INTERVAL_MS} />}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{hackathon.name}</h1>
        <p className="text-muted-foreground">
          {mentorParticipantId ? "Help attendees who are stuck" : "Mentor queue totals"}
        </p>
      </div>
      <MentorWorkspace
        slug={slug}
        status={hackathon.status}
        stats={stats}
        isMentor={mentorParticipantId !== null}
        initialRequests={requests}
        initialTotal={queue.total}
        initialTruncated={queue.truncated}
      />
    </div>
  )
}
