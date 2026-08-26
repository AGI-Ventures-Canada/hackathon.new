import { notFound } from "next/navigation"
import { getPublicHackathon } from "@/lib/services/public-hackathons"
import { getWinnerPageData } from "@/lib/services/winner-pages"
import { WinnerGrid } from "@/components/hackathon/winners/winner-grid"
import type { Metadata } from "next"

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  return {
    title: hackathon?.results_published_at
      ? `Winners | ${hackathon.name}`
      : "Winners",
  }
}

export default async function WinnersPage({ params }: PageProps) {
  const { slug } = await params
  const hackathon = await getPublicHackathon(slug)

  if (!hackathon?.results_published_at) {
    notFound()
  }

  const winners = await getWinnerPageData(hackathon.id)

  const mappedWinners = winners.map((w) => ({
    prizeName: w.prizeName,
    prizeDescription: w.prizeDescription,
    prizeValue: w.prizeValue,
    submissionTitle: w.submissionTitle,
    teamName: hackathon.anonymous_judging
      ? "Anonymous project"
      : w.teamName ?? "Unknown Team",
  }))

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{hackathon.name}</h1>
        <p className="text-muted-foreground">Winners</p>
      </div>
      <WinnerGrid winners={mappedWinners} />
    </div>
  )
}
