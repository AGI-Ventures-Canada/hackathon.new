"use client"

import { Button } from "@/components/ui/button"
import { Heart, ExternalLink, Github, Play } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoteCardProps {
  title: string
  description: string | null
  screenshotUrl: string | null
  submitterName?: string
  liveAppUrl?: string | null
  githubUrl?: string | null
  demoVideoUrl?: string | null
  voteCount: number
  isVoted: boolean
  disabled: boolean
  onVote: () => void
}

export function VoteCard({
  title,
  description,
  screenshotUrl,
  submitterName,
  liveAppUrl,
  githubUrl,
  demoVideoUrl,
  voteCount,
  isVoted,
  disabled,
  onVote,
}: VoteCardProps) {
  const links = [
    { url: liveAppUrl, label: "Live demo", icon: ExternalLink },
    { url: githubUrl, label: "Code", icon: Github },
    { url: demoVideoUrl, label: "Video", icon: Play },
  ].filter((link) => link.url)
  return (
    <div className={cn(
      "rounded-lg border overflow-hidden transition-colors",
      isVoted && "ring-2 ring-primary"
    )}>
      {screenshotUrl && (
        <div className="aspect-video bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="font-semibold leading-tight">{title}</h3>
          {submitterName && (
            <p className="text-xs text-muted-foreground">by {submitterName}</p>
          )}
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map(({ url, label, icon: Icon }) => (
              <a
                key={label}
                href={url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon className="size-3" />
                {label}
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {voteCount} {voteCount === 1 ? "vote" : "votes"}
          </span>
          <Button
            variant={isVoted ? "default" : "outline"}
            size="sm"
            onClick={onVote}
            disabled={disabled}
          >
            <Heart className={cn("size-4 mr-1", isVoted && "fill-current")} />
            {isVoted ? "Voted" : "Vote"}
          </Button>
        </div>
      </div>
    </div>
  )
}
