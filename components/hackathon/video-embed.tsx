import type { VideoEmbedInfo } from "@/lib/utils/video-embed"

interface VideoEmbedProps {
  video: VideoEmbedInfo
}

export function VideoEmbed({ video }: VideoEmbedProps) {
  const sandbox =
    video.provider === "youtube"
      ? "allow-scripts allow-same-origin allow-presentation allow-popups"
      : "allow-scripts allow-presentation allow-popups"

  return (
    <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
      <iframe
        src={video.embedUrl}
        title={video.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        sandbox={sandbox}
        allowFullScreen
        className="size-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}
