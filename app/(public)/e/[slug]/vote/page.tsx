import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getHackathonSubmissions } from "@/lib/services/submissions"
import { getVoteCounts, getUserVote } from "@/lib/services/crowd-voting"
import { VoteGallery } from "@/components/hackathon/voting/vote-gallery"
import { publicSubmitterName } from "@/lib/utils/anonymous-judging"
import { listPrizes } from "@/lib/services/prizes"

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

  const votingIsOpen = hackathon.status === "active" || hackathon.status === "judging"
  if (!votingIsOpen && !hackathon.results_published_at) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Voting is closed</h1>
        <p className="text-muted-foreground">Results will show here when the organizer shares them.</p>
      </div>
    )
  }

  const [submissions, prizes] = await Promise.all([
    getHackathonSubmissions(hackathon.id),
    listPrizes(hackathon.id),
  ])
  const crowdPrizes = prizes.filter((prize) => prize.judging_style === "crowd_vote" || prize.type === "crowd")
  const voting = await Promise.all(crowdPrizes.map(async (prize) => ({
    prize,
    voteCounts: await getVoteCounts(hackathon.id, prize.id),
    userVote: userId ? await getUserVote(hackathon.id, prize.id, userId) : null,
  })))

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

  if (voting.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Voting isn’t open</h1>
        <p className="text-muted-foreground">The organizer hasn’t added a crowd prize yet.</p>
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

      {voting.map(({ prize, voteCounts, userVote }) => (
        <section key={prize.id} className="space-y-4">
          {voting.length > 1 && <h2 className="text-xl font-semibold">{prize.name}</h2>}
          <VoteGallery
            hackathonSlug={slug}
            prizeId={prize.id}
            submissions={submittedProjects
              .filter((submission) =>
                !prize.allowed_team_modes?.length ||
                (submission.team_mode !== null && prize.allowed_team_modes.includes(submission.team_mode)),
              )
              .map((s) => ({
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
        </section>
      ))}
    </div>
  )
}
