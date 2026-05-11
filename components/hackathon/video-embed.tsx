import type { VideoEmbedInfo } from "@/lib/utils/video-embed"

interface VideoEmbedProps {
  video: VideoEmbedInfo
}

export function VideoEmbed({ video }: VideoEmbedProps) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
      <iframe
        src={video.embedUrl}
        title={video.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        sandbox="allow-scripts allow-presentation allow-popups"
        allowFullScreen
        className="size-full"
      />
    </div>
  )
}
