import {
  extractYouTubeVideoId,
  getYouTubeEmbedUrl,
} from "./video-embed"

export { extractYouTubeVideoId, getYouTubeEmbedUrl }

export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null
}
