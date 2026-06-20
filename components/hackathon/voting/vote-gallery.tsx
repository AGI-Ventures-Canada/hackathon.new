"use client"

import { useState } from "react"
import { VoteCard } from "./vote-card"

interface Submission {
  id: string
  title: string
  description: string | null
  screenshotUrl: string | null
  submitterName?: string
  liveAppUrl: string | null
  githubUrl: string | null
  demoVideoUrl: string | null
}

interface VoteGalleryProps {
  hackathonSlug: string
  submissions: Submission[]
  voteCounts: { submissionId: string; voteCount: number }[]
  userVote: string | null
  isSignedIn: boolean
}

export function VoteGallery({
  hackathonSlug,
  submissions,
  voteCounts: initialCounts,
  userVote: initialVote,
  isSignedIn,
}: VoteGalleryProps) {
  const [userVote, setUserVote] = useState(initialVote)
  const [voteCounts, setVoteCounts] = useState(initialCounts)
  const [voting, setVoting] = useState(false)

  async function handleVote(submissionId: string) {
    if (!isSignedIn || voting) return

    setVoting(true)

    try {
      if (userVote === submissionId) {
        const res = await fetch(`/api/public/hackathons/${hackathonSlug}/vote`, {
          method: "DELETE",
        })
        if (res.ok) {
          setVoteCounts((prev) =>
            prev.map((c) =>
              c.submissionId === submissionId
                ? { ...c, voteCount: Math.max(0, c.voteCount - 1) }
                : c
            )
          )
          setUserVote(null)
        }
      } else {
        const res = await fetch(`/api/public/hackathons/${hackathonSlug}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId }),
        })
        if (res.ok) {
          setVoteCounts((prev) => {
            let counts = prev.map((c) => {
              if (c.submissionId === userVote) {
                return { ...c, voteCount: Math.max(0, c.voteCount - 1) }
              }
              return c
            })

            const existing = counts.find((c) => c.submissionId === submissionId)
            if (existing) {
              counts = counts.map((c) =>
                c.submissionId === submissionId
                  ? { ...c, voteCount: c.voteCount + 1 }
                  : c
              )
            } else {
              counts.push({ submissionId, voteCount: 1 })
            }

            return counts
          })
          setUserVote(submissionId)
        }
      }
    } finally {
      setVoting(false)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {submissions.map((submission) => {
        const count = voteCounts.find((c) => c.submissionId === submission.id)?.voteCount ?? 0
        const isVoted = userVote === submission.id

        return (
          <VoteCard
            key={submission.id}
            title={submission.title}
            description={submission.description}
            screenshotUrl={submission.screenshotUrl}
            submitterName={submission.submitterName}
            liveAppUrl={submission.liveAppUrl}
            githubUrl={submission.githubUrl}
            demoVideoUrl={submission.demoVideoUrl}
            voteCount={count}
            isVoted={isVoted}
            disabled={!isSignedIn || voting}
            onVote={() => handleVote(submission.id)}
          />
        )
      })}
    </div>
  )
}
