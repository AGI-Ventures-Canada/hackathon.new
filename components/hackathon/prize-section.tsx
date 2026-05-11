import { PrizeCard } from "./prize-card"
import { Button } from "@/components/ui/button"
import { Vote } from "lucide-react"
import Link from "next/link"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import type { PublicPrize } from "@/lib/services/public-hackathons"

type PrizeWithWinner = PublicPrize & {
  winner?: {
    submissionTitle: string
    teamName: string | null
  } | null
}

interface PrizeSectionProps {
  prizes: PrizeWithWinner[]
  hackathonSlug?: string
  hackathonStatus?: HackathonStatus
}

export function PrizeSection({ prizes, hackathonSlug, hackathonStatus }: PrizeSectionProps) {
  if (prizes.length === 0) {
    return null
  }

  const hasCrowdPrize = prizes.some((p) => p.judging_style === "crowd_vote" || p.type === "crowd")
  const showVotingCta =
    hasCrowdPrize &&
    hackathonSlug &&
    hackathonStatus &&
    ["active", "judging"].includes(hackathonStatus)

  return (
    <section className="py-12">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-2xl font-bold mb-8 text-center">Prizes</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {prizes.map((prize) => (
            <PrizeCard
              key={prize.id}
              name={prize.name}
              description={prize.description}
              value={prize.display_value ?? prize.value}
              winner={prize.winner}
            />
          ))}
        </div>
        {showVotingCta && (
          <div className="mt-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Help decide the Crowd&apos;s Favorite winner!
            </p>
            <Button asChild>
              <Link href={`/e/${hackathonSlug}/vote`}>
                <Vote className="mr-2 size-4" />
                Vote Now
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
