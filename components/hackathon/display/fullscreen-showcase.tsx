"use client"

import Image from "next/image"
import { ExternalLink, Github, Play } from "lucide-react"
import { FullscreenWrapper } from "./fullscreen-wrapper"

type ShowcaseSubmission = {
  id: string
  title: string
  description: string | null
  githubUrl: string | null
  liveAppUrl: string | null
  demoVideoUrl: string | null
  screenshotUrl: string | null
  submitter: string
}

interface FullscreenShowcaseProps {
  hackathonName: string
  viewName: string | null
  submissions: ShowcaseSubmission[]
  message?: string | null
}

export function FullscreenShowcase({
  hackathonName,
  viewName,
  submissions,
  message,
}: FullscreenShowcaseProps) {
  if (message || submissions.length === 0) {
    return (
      <FullscreenWrapper>
        <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
          <h1 className="text-2xl font-bold sm:text-4xl">{hackathonName}</h1>
          {viewName && <p className="text-lg text-muted-foreground">{viewName}</p>}
          <p className="text-base text-muted-foreground sm:text-lg">{message}</p>
        </div>
      </FullscreenWrapper>
    )
  }

  return (
    <FullscreenWrapper className="justify-start py-10 sm:py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-3xl font-bold sm:text-5xl">{hackathonName}</h1>
          {viewName && (
            <p className="text-lg text-muted-foreground sm:text-2xl">{viewName}</p>
          )}
        </header>
        <ul className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {submissions.map((s) => (
            <li
              key={s.id}
              className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
            >
              {s.screenshotUrl ? (
                <div className="relative aspect-video w-full bg-muted">
                  {/* unoptimized: screenshot URLs come from arbitrary user-submitted hosts; allowlisting them in next.config would be brittle and noisy. */}
                  <Image
                    src={s.screenshotUrl}
                    alt={s.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted">
                  <span className="text-2xl font-bold text-muted-foreground">
                    {s.title.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h2 className="text-xl font-semibold leading-tight sm:text-2xl">
                  {s.title}
                </h2>
                <p className="text-sm text-muted-foreground">{s.submitter}</p>
                {s.description && (
                  <p className="line-clamp-3 text-sm text-foreground/80 sm:text-base">
                    {s.description}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-2 text-sm">
                  {s.liveAppUrl && (
                    <ShowcaseLink href={s.liveAppUrl} icon={ExternalLink} label="Live app" />
                  )}
                  {s.demoVideoUrl && (
                    <ShowcaseLink href={s.demoVideoUrl} icon={Play} label="Demo" />
                  )}
                  {s.githubUrl && (
                    <ShowcaseLink href={s.githubUrl} icon={Github} label="Code" />
                  )}
                  {!s.liveAppUrl && !s.demoVideoUrl && !s.githubUrl && (
                    <span className="text-muted-foreground">No links</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </FullscreenWrapper>
  )
}

function ShowcaseLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof ExternalLink | typeof Github | typeof Play
  label: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-foreground/80 hover:bg-muted"
    >
      <Icon className="size-4" />
      {label}
    </a>
  )
}
