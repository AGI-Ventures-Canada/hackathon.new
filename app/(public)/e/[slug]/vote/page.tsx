import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { getVoteCounts, getUserVote } from "@/lib/services/crowd-voting"
import { VoteGallery } from "@/components/hackathon/voting/vote-gallery"
import { publicSubmitterName } from "@/lib/utils/anonymous-judging"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function VotePage({ params }: PageProps) {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  if (!hackathon) {
    notFound()
  }

  const { userId } = await auth()

  const [submissions, voteCounts, userVote] = await Promise.all([
    getHackathonSubmissions(hackathon.id),
    getVoteCounts(hackathon.id),
    userId ? getUserVote(hackathon.id, userId) : Promise.resolve(null),
  ])

  const submittedProjects = submissions.filter((s) => s.status === "submitted")

  if (submittedProjects.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">No submissions yet</h1>
        <p className="text-muted-foreground">
          Voting will be available once projects are submitted.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Vote for your favorite project</h1>
        <p className="text-muted-foreground">
          {hackathon.name} — pick one project to get your vote
        </p>
      </div>

      <VoteGallery
        hackathonSlug={slug}
        submissions={submittedProjects.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          screenshotUrl: s.screenshot_url,
          submitterName: publicSubmitterName(hackathon, s.submitter_name),
          liveAppUrl: s.live_app_url,
          githubUrl: s.github_url,
          demoVideoUrl: s.demo_video_url,
        }))}
        voteCounts={voteCounts}
        userVote={userVote}
        isSignedIn={!!userId}
      />
    </div>
  )
}
