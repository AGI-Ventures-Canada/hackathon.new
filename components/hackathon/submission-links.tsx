import { Github, ExternalLink, Play } from "lucide-react"

interface SubmissionLinksProps {
  githubUrl: string | null
  liveAppUrl: string | null
  demoVideoUrl: string | null
  hasEmbeddedVideo: boolean
}

const linkClassName =
  "inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"

export function SubmissionLinks({
  githubUrl,
  liveAppUrl,
  demoVideoUrl,
  hasEmbeddedVideo,
}: SubmissionLinksProps) {
  const hasLinks = githubUrl || liveAppUrl || (demoVideoUrl && !hasEmbeddedVideo)

  if (!hasLinks) return null

  return (
    <div className="flex flex-wrap gap-3">
      {githubUrl && (
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          <Github className="size-3.5" />
          <span>Repository</span>
        </a>
      )}
      {liveAppUrl && (
        <a href={liveAppUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          <ExternalLink className="size-3.5" />
          <span>Live Demo</span>
        </a>
      )}
      {demoVideoUrl && !hasEmbeddedVideo && (
        <a href={demoVideoUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          <Play className="size-3.5" />
          <span>Demo Video</span>
        </a>
      )}
    </div>
  )
}
