import { normalizeUrl } from "./url"

export type VideoProvider = "youtube" | "loom" | "vimeo"

export type VideoEmbedInfo = {
  provider: VideoProvider
  embedUrl: string
  title: string
}

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const LOOM_ID_PATTERN = /^[A-Za-z0-9-]+$/
const VIMEO_ID_PATTERN = /^\d+$/

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(normalizeUrl(rawUrl))
  } catch {
    return null
  }
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean)
}

function extractYouTubeIdFromUrl(url: URL): string | null {
  const hostname = url.hostname.toLowerCase()
  const segments = pathSegments(url)
  let videoId: string | null = null

  if (hostname === "youtu.be") {
    videoId = segments[0] ?? null
  } else if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtube-nocookie.com" ||
    hostname === "www.youtube-nocookie.com"
  ) {
    if (segments[0] === "watch") {
      videoId = url.searchParams.get("v")
    } else if (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") {
      videoId = segments[1] ?? null
    }
  }

  return videoId && YOUTUBE_ID_PATTERN.test(videoId) ? videoId : null
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  const url = parseUrl(rawUrl)
  return url ? extractYouTubeIdFromUrl(url) : null
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}

function getYouTubeEmbedInfo(url: URL): VideoEmbedInfo | null {
  const videoId = extractYouTubeIdFromUrl(url)
  if (!videoId) return null

  return {
    provider: "youtube",
    embedUrl: getYouTubeEmbedUrl(videoId),
    title: "YouTube video",
  }
}

function getLoomEmbedInfo(url: URL): VideoEmbedInfo | null {
  const hostname = url.hostname.toLowerCase()
  if (hostname !== "loom.com" && hostname !== "www.loom.com") {
    return null
  }

  const segments = pathSegments(url)
  if (segments[0] !== "share" && segments[0] !== "embed") {
    return null
  }

  const videoId = segments[1]
  if (!videoId || !LOOM_ID_PATTERN.test(videoId)) {
    return null
  }

  return {
    provider: "loom",
    embedUrl: `https://www.loom.com/embed/${videoId}`,
    title: "Loom video",
  }
}

function getVimeoEmbedInfo(url: URL): VideoEmbedInfo | null {
  const hostname = url.hostname.toLowerCase()
  const segments = pathSegments(url)
  let videoId: string | null = null

  if (hostname === "vimeo.com" || hostname === "www.vimeo.com") {
    videoId = [...segments].reverse().find((segment) => VIMEO_ID_PATTERN.test(segment)) ?? null
  } else if (hostname === "player.vimeo.com" && segments[0] === "video") {
    videoId = segments[1] ?? null
  }

  if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) {
    return null
  }

  return {
    provider: "vimeo",
    embedUrl: `https://player.vimeo.com/video/${videoId}`,
    title: "Vimeo video",
  }
}

export function getVideoEmbedInfo(rawUrl: string): VideoEmbedInfo | null {
  const url = parseUrl(rawUrl)
  if (!url) return null

  return getYouTubeEmbedInfo(url) ?? getLoomEmbedInfo(url) ?? getVimeoEmbedInfo(url)
}
