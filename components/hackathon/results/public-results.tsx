"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Trophy, Github, ExternalLink, ChevronDown } from "lucide-react"
import type { PublicResultWithDetails } from "@/lib/services/results"

interface PublicResultsProps {
  results: PublicResultWithDetails[]
}

function WinnerCard({ result }: { result: PublicResultWithDetails }) {
  return (
    <Card className="border-primary overflow-hidden">
      {result.submissionScreenshotUrl && (
        <div className="w-full aspect-video bg-muted overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.submissionScreenshotUrl}
            alt={result.submissionTitle}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-primary shrink-0" />
              <span className="text-sm font-medium text-primary">1st Place</span>
            </div>
            <h3 className="text-2xl font-bold leading-tight">{result.submissionTitle}</h3>
            {result.teamName && (
              <p className="text-muted-foreground font-medium">{result.teamName}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {result.submissionGithubUrl && (
              <a
                href={result.submissionGithubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="size-4" />
                GitHub
              </a>
            )}
            {result.submissionLiveAppUrl && (
              <a
                href={result.submissionLiveAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-4" />
                Live App
              </a>
            )}
          </div>
        </div>

        {result.members.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.members.map((name, i) => (
              <Badge key={i} variant="secondary">
                {name}
              </Badge>
            ))}
          </div>
        )}

        {result.submissionDescription && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
            {result.submissionDescription}
          </p>
        )}

        {result.prizes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.prizes.map((p) => (
              <Badge key={p.id} variant="default">
                {p.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RunnerUpExpandedContent({ result }: { result: PublicResultWithDetails }) {
  return (
    <div className="space-y-4 p-6">
      {result.submissionScreenshotUrl && (
        <div className="w-full aspect-video bg-muted overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.submissionScreenshotUrl}
            alt={result.submissionTitle}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        {result.submissionGithubUrl && (
          <a
            href={result.submissionGithubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="size-4" />
            GitHub
          </a>
        )}
        {result.submissionLiveAppUrl && (
          <a
            href={result.submissionLiveAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-4" />
            Live App
          </a>
        )}
      </div>

      {result.members.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.members.map((name) => (
            <Badge key={name} variant="secondary">
              {name}
            </Badge>
          ))}
        </div>
      )}

      {result.submissionDescription && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {result.submissionDescription}
        </p>
      )}

      {result.prizes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.prizes.map((p) => (
            <Badge key={p.id} variant="default">
              {p.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

interface RunnerUpSectionProps {
  second?: PublicResultWithDetails
  third?: PublicResultWithDetails
}

function RunnerUpSection({ second, third }: RunnerUpSectionProps) {
  const [open, setOpen] = useState<"second" | "third" | null>(null)
  const [displayed, setDisplayed] = useState<"second" | "third" | null>(null)

  function toggle(key: "second" | "third") {
    const isClosing = open === key
    if (!isClosing) setDisplayed(key)
    setOpen(isClosing ? null : key)
  }

  const isOpen = open !== null
  const displayedResult = displayed === "second" ? second : displayed === "third" ? third : null

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="grid grid-cols-2">
        {second && (
          <button
            onClick={() => toggle("second")}
            className={`flex items-start justify-between gap-2 p-6 text-left transition-colors hover:bg-muted/50 ${
              open === "second" ? "bg-muted/50" : ""
            } ${third ? "border-r" : ""}`}
          >
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                2nd Place
              </span>
              <p className="font-semibold text-lg leading-tight">{second.submissionTitle}</p>
              {second.teamName && (
                <p className="text-sm text-muted-foreground">{second.teamName}</p>
              )}
            </div>
            <ChevronDown
              className={`size-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${
                open === "second" ? "rotate-180" : ""
              }`}
            />
          </button>
        )}
        {third && (
          <button
            onClick={() => toggle("third")}
            className={`flex items-start justify-between gap-2 p-6 text-left transition-colors hover:bg-muted/50 ${
              open === "third" ? "bg-muted/50" : ""
            }`}
          >
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                3rd Place
              </span>
              <p className="font-semibold text-lg leading-tight">{third.submissionTitle}</p>
              {third.teamName && (
                <p className="text-sm text-muted-foreground">{third.teamName}</p>
              )}
            </div>
            <ChevronDown
              className={`size-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${
                open === "third" ? "rotate-180" : ""
              }`}
            />
          </button>
        )}
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {displayedResult && (
            <div className="border-t">
              <RunnerUpExpandedContent result={displayedResult} />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export function PublicResults({ results }: PublicResultsProps) {
  if (results.length === 0) return null

  const first = results.find((r) => r.rank === 1)
  const second = results.find((r) => r.rank === 2)
  const third = results.find((r) => r.rank === 3)

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <Trophy className="mx-auto size-8 text-primary" />
        <h2 className="text-2xl font-bold">Results</h2>
      </div>

      {first && <WinnerCard result={first} />}

      {(second || third) && <RunnerUpSection second={second} third={third} />}
    </div>
  )
}
