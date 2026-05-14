"use client"

import { useEventPoll } from "@/hooks/use-event-poll"
import { FullscreenWrapper } from "./fullscreen-wrapper"
import { PhaseBadge } from "@/components/hackathon/phase-badge"
import type { HackathonPhase } from "@/lib/db/hackathon-types"
import type { Challenge } from "@/lib/services/challenges"

interface FullscreenChallengeProps {
  slug: string
  initialChallenges: Challenge[]
  hackathonName: string
}

export function FullscreenChallenge({
  slug,
  initialChallenges,
  hackathonName,
}: FullscreenChallengeProps) {
  const { data } = useEventPoll(slug, { interval: 5000 })

  const challenges = data?.challenge?.challenges ?? initialChallenges
  const releasedChallenges = challenges.filter((c) => !!c.releasedAt)
  const phase = (data?.phase ?? null) as HackathonPhase | null

  return (
    <FullscreenWrapper>
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
          {hackathonName}
        </h1>
        <PhaseBadge phase={phase} />
        {releasedChallenges.length > 0 ? (
          <div className="flex w-full max-w-5xl flex-col items-center gap-6">
            {releasedChallenges.map((c) => (
              <div
                key={c.id}
                className="flex w-full flex-col items-center gap-2 rounded-lg border bg-card/40 p-6 text-center"
              >
                <p className="text-2xl font-bold text-foreground sm:text-4xl">
                  {c.title}
                </p>
                {c.description ? (
                  <p className="max-w-3xl whitespace-pre-wrap text-base text-muted-foreground sm:text-lg">
                    {c.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl text-muted-foreground sm:text-3xl">
              Challenge not yet released
            </p>
            <div className="h-3 w-3 animate-pulse rounded-full bg-muted-foreground" />
          </div>
        )}
      </div>
    </FullscreenWrapper>
  )
}
