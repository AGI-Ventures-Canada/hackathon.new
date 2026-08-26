import {
  fetchAllowedUrl,
  isAllowedHttpsUrl,
  readResponseBytes,
  redactFetchErrorForLogs,
  redactUrlForLogs,
} from "@/lib/utils/safe-fetch-url"

const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000
const IMAGE_MAX_BYTES = 20 * 1024 * 1024

export type DownloadedImage = { path: string; buffer: Buffer }

export async function downloadImageForExport(
  url: string,
  pathWithoutExtension: string
): Promise<DownloadedImage | null> {
  const safeUrl = redactUrlForLogs(url)
  if (!isAllowedHttpsUrl(url)) {
    console.warn(`Refusing to download image with disallowed URL: ${safeUrl}`)
    return null
  }

  try {
    const response = await fetchAllowedUrl(
      url,
      {},
      {
        maxRedirects: 0,
        requireHttps: true,
        timeoutMs: IMAGE_DOWNLOAD_TIMEOUT_MS,
      }
    )

    if (!response?.ok) return null

    const declaredLength = Number(response.headers.get("content-length") ?? 0)
    if (declaredLength > IMAGE_MAX_BYTES) {
      console.warn(
        `Skipping image ${safeUrl}: content-length ${declaredLength} exceeds ${IMAGE_MAX_BYTES}`
      )
      await response.body?.cancel()
      return null
    }

    const contentType = response.headers.get("content-type") ?? ""
    const extension = inferExtension(contentType, url)
    if (extension === "bin") {
      const safeContentType = contentType
        .replace(/[^\x20-\x7e]/g, "")
        .slice(0, 200) || "<none>"
      console.warn(
        `Image ${safeUrl} saved as .bin (unrecognized content-type: ${safeContentType})`
      )
    }

    const bytes = await readResponseBytes(response, IMAGE_MAX_BYTES)
    if (!bytes) {
      console.warn(
        `Skipping image ${safeUrl}: response exceeds ${IMAGE_MAX_BYTES} bytes`
      )
      return null
    }

    return {
      path: `${pathWithoutExtension}.${extension}`,
      buffer: Buffer.from(bytes),
    }
  } catch (error) {
    console.warn(
      `Failed to download image ${safeUrl}:`,
      redactFetchErrorForLogs(error, [url])
    )
    return null
  }
}

function inferExtension(contentType: string, url: string): string {
  if (contentType.includes("png")) return "png"
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg"
  if (contentType.includes("webp")) return "webp"
  if (contentType.includes("gif")) return "gif"

  const urlMatch = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.exec(url)
  if (!urlMatch) return "bin"
  const extension = urlMatch[1].toLowerCase()
  return extension === "jpeg" ? "jpg" : extension
}
