"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MarkdownContent } from "@/components/ui/markdown-content"
import { ExternalLink, Lock } from "lucide-react"
import type { Challenge } from "@/lib/services/challenges"

interface ChallengeSectionProps {
  challenges: Challenge[]
  releasedAt: string | null
  showResources?: boolean
}

const INITIAL_VISIBLE = 3

export function ChallengeSection({ challenges, releasedAt, showResources = false }: ChallengeSectionProps) {
  const [showAll, setShowAll] = useState(false)
  if (challenges.length === 0) return null

  const released = !!releasedAt

  if (!released) {
    return (
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          Challenges
          <Lock className="size-4 text-muted-foreground" />
        </h2>
        <p className="text-sm text-muted-foreground">
          Challenges will be shared when the event starts.
        </p>
      </div>
    )
  }

  const visibleChallenges = showAll ? challenges : challenges.slice(0, INITIAL_VISIBLE)
  const hiddenCount = Math.max(0, challenges.length - INITIAL_VISIBLE)

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Challenges</h2>
      <div className="space-y-4">
        {visibleChallenges.map((challenge) => (
          <Card key={challenge.id}>
            <CardHeader>
              <CardTitle>{challenge.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {challenge.description && (
                <MarkdownContent className="prose-headings:text-primary">
                  {challenge.description}
                </MarkdownContent>
              )}
              {showResources && challenge.resources.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {challenge.resources.map((r, i) => (
                    <Link
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Badge variant="outline" className="gap-1 hover:bg-muted">
                        <ExternalLink className="size-3" />
                        {r.label || r.url}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show less" : `Show ${hiddenCount} more`}
          </Button>
        </div>
      )}
    </div>
  )
}
