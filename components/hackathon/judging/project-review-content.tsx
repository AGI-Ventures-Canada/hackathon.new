import Image from "next/image"
import { ExternalLink, Github, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ReviewProject } from "@/lib/utils/judging-review"

export function ProjectReviewContent({ project }: { project: ReviewProject }) {
  return <div className="min-w-0 space-y-4">
    <div>
      <h2 className="break-words text-xl font-semibold">{project.submissionTitle}</h2>
      {project.teamName && <p className="text-sm text-muted-foreground">{project.teamName}</p>}
    </div>
    {project.submissionScreenshotUrl && <a href={project.submissionScreenshotUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open the full screenshot for ${project.submissionTitle}`}>
      <Image src={project.submissionScreenshotUrl} alt={`${project.submissionTitle} screenshot`} width={960} height={540} className="h-auto w-full rounded-lg border object-contain" />
    </a>}
    {project.submissionDescription && <p className="whitespace-pre-wrap break-words text-sm">{project.submissionDescription}</p>}
    <div className="flex flex-wrap gap-2">
      {project.submissionLiveAppUrl && <Button asChild variant="outline"><a href={project.submissionLiveAppUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />Try the project</a></Button>}
      {project.submissionDemoVideoUrl && <Button asChild variant="outline"><a href={project.submissionDemoVideoUrl} target="_blank" rel="noopener noreferrer"><Play />Watch the video</a></Button>}
      {project.submissionGithubUrl && <Button asChild variant="outline"><a href={project.submissionGithubUrl} target="_blank" rel="noopener noreferrer"><Github />View the code</a></Button>}
    </div>
  </div>
}
