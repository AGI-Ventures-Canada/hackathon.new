import sharp from "sharp"
import { supabase as getSupabase } from "@/lib/db/client"

const LOGOS_BUCKET = "logos"
const BANNERS_BUCKET = "banners"
const SCREENSHOTS_BUCKET = "screenshots"
const HEADSHOTS_BUCKET = "headshots"
const MAX_LOGO_WIDTH = 800
const MAX_LOGO_HEIGHT = 400
const MAX_BANNER_WIDTH = 1200
const MAX_BANNER_HEIGHT = 1200
const MAX_SCREENSHOT_WIDTH = 1280
const MAX_SCREENSHOT_HEIGHT = 800
const QUALITY = 85
const MAX_OPTIMIZED_SIZE = 200 * 1024 // 200KB
const MAX_BANNER_SIZE = 500 * 1024 // 500KB
const MAX_SCREENSHOT_SIZE = 500 * 1024 // 500KB

export type LogoVariant = "light" | "dark"

export interface UploadLogoResult {
  url: string
  path: string
}

export class ImageTooLargeError extends Error {
  constructor(size: number, maxSize: number = MAX_OPTIMIZED_SIZE) {
    super(`Optimized image is ${Math.round(size / 1024)}KB, max is ${maxSize / 1024}KB`)
    this.name = "ImageTooLargeError"
  }
}

export async function optimizeImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  // SVGs pass through unchanged
  if (mimeType === "image/svg+xml") {
    if (buffer.length > MAX_OPTIMIZED_SIZE) {
      throw new ImageTooLargeError(buffer.length)
    }
    return { buffer, mimeType }
  }

  const image = sharp(buffer)
  const metadata = await image.metadata()

  const needsResize =
    (metadata.width && metadata.width > MAX_LOGO_WIDTH) ||
    (metadata.height && metadata.height > MAX_LOGO_HEIGHT)

  let pipeline = image

  if (needsResize) {
    pipeline = pipeline.resize(MAX_LOGO_WIDTH, MAX_LOGO_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
  }

  // Try WebP first (best compression)
  let optimized = await pipeline.clone().webp({ quality: QUALITY }).toBuffer()
  const outputMimeType = "image/webp"

  // If still too large, try lower quality
  if (optimized.length > MAX_OPTIMIZED_SIZE) {
    optimized = await pipeline.clone().webp({ quality: 60 }).toBuffer()
  }

  // If still too large, try even smaller dimensions
  if (optimized.length > MAX_OPTIMIZED_SIZE) {
    optimized = await sharp(buffer)
      .resize(400, 200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 60 })
      .toBuffer()
  }

  // If still too large, give up
  if (optimized.length > MAX_OPTIMIZED_SIZE) {
    throw new ImageTooLargeError(optimized.length)
  }

  return { buffer: optimized, mimeType: outputMimeType }
}

export async function uploadLogo(
  tenantId: string,
  file: Buffer,
  originalMimeType: string,
  variant: LogoVariant
): Promise<UploadLogoResult | null> {
  const client = getSupabase()

  const { buffer, mimeType } = await optimizeImage(file, originalMimeType)

  const extension = mimeType === "image/svg+xml" ? "svg" : "webp"

  const filename = variant === "light" ? `logo.${extension}` : `logo-dark.${extension}`
  const path = `${tenantId}/${filename}`

  const { error } = await client.storage
    .from(LOGOS_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "3600",
    })

  if (error) {
    console.error("Failed to upload logo:", error)
    return null
  }

  const { data: urlData } = client.storage
    .from(LOGOS_BUCKET)
    .getPublicUrl(path)

  return {
    url: urlData.publicUrl,
    path,
  }
}

export async function deleteLogo(
  tenantId: string,
  variant: LogoVariant
): Promise<boolean> {
  const client = getSupabase()

  const extensions = ["webp", "png", "svg"]
  const filename = variant === "light" ? "logo" : "logo-dark"

  const paths = extensions.map((ext) => `${tenantId}/${filename}.${ext}`)

  const { error } = await client.storage
    .from(LOGOS_BUCKET)
    .remove(paths)

  if (error) {
    console.error("Failed to delete logo:", error)
    return false
  }

  return true
}

export interface UploadBannerResult {
  url: string
  path: string
}

export async function optimizeBanner(
  buffer: Buffer
): Promise<{ buffer: Buffer; mimeType: string }> {
  const image = sharp(buffer)
  const metadata = await image.metadata()

  const needsResize =
    (metadata.width && metadata.width > MAX_BANNER_WIDTH) ||
    (metadata.height && metadata.height > MAX_BANNER_HEIGHT)

  let pipeline = image

  if (needsResize) {
    pipeline = pipeline.resize(MAX_BANNER_WIDTH, MAX_BANNER_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
  }

  const outputMimeType = "image/webp"
  const qualityLevels = [QUALITY, 70, 50]

  for (const quality of qualityLevels) {
    const optimized = await pipeline.clone().webp({ quality }).toBuffer()
    if (optimized.length <= MAX_BANNER_SIZE) {
      return { buffer: optimized, mimeType: outputMimeType }
    }
  }

  const finalBuffer = await pipeline.clone().webp({ quality: 50 }).toBuffer()
  throw new ImageTooLargeError(finalBuffer.length, MAX_BANNER_SIZE)
}

export async function uploadBanner(
  hackathonId: string,
  file: Buffer
): Promise<UploadBannerResult | null> {
  const client = getSupabase()

  const { buffer, mimeType } = await optimizeBanner(file)

  const filename = "banner.webp"
  const path = `${hackathonId}/${filename}`

  const { error } = await client.storage
    .from(BANNERS_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "3600",
    })

  if (error) {
    console.error("Failed to upload banner:", error)
    return null
  }

  const { data: urlData } = client.storage
    .from(BANNERS_BUCKET)
    .getPublicUrl(path)

  return {
    url: `${urlData.publicUrl}?v=${Date.now()}`,
    path,
  }
}

export async function deleteBanner(hackathonId: string): Promise<boolean> {
  const client = getSupabase()

  const extensions = ["webp", "png", "jpg", "svg"]
  const paths = extensions.map((ext) => `${hackathonId}/banner.${ext}`)

  const { error } = await client.storage
    .from(BANNERS_BUCKET)
    .remove(paths)

  if (error) {
    console.error("Failed to delete banner:", error)
    return false
  }

  return true
}

export interface UploadScreenshotResult {
  url: string
  path: string
}

export async function optimizeScreenshot(
  buffer: Buffer
): Promise<{ buffer: Buffer; mimeType: string }> {
  const image = sharp(buffer)
  const metadata = await image.metadata()

  const needsResize =
    (metadata.width && metadata.width > MAX_SCREENSHOT_WIDTH) ||
    (metadata.height && metadata.height > MAX_SCREENSHOT_HEIGHT)

  let pipeline = image

  if (needsResize) {
    pipeline = pipeline.resize(MAX_SCREENSHOT_WIDTH, MAX_SCREENSHOT_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
  }

  const outputMimeType = "image/webp"
  const qualityLevels = [QUALITY, 70, 50]

  for (const quality of qualityLevels) {
    const optimized = await pipeline.clone().webp({ quality }).toBuffer()
    if (optimized.length <= MAX_SCREENSHOT_SIZE) {
      return { buffer: optimized, mimeType: outputMimeType }
    }
  }

  const finalBuffer = await pipeline.clone().webp({ quality: 50 }).toBuffer()
  throw new ImageTooLargeError(finalBuffer.length, MAX_SCREENSHOT_SIZE)
}

export async function uploadScreenshot(
  submissionId: string,
  file: Buffer,
  slot = 0
): Promise<UploadScreenshotResult | null> {
  const client = getSupabase()

  const { buffer, mimeType } = await optimizeScreenshot(file)

  const filename = slot === 0 ? "screenshot.webp" : `screenshot-${slot + 1}.webp`
  const path = `${submissionId}/${filename}`

  const { error } = await client.storage
    .from(SCREENSHOTS_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "3600",
    })

  if (error) {
    console.error("Failed to upload screenshot:", error)
    return null
  }

  const { data: urlData } = client.storage
    .from(SCREENSHOTS_BUCKET)
    .getPublicUrl(path)

  return {
    url: urlData.publicUrl,
    path,
  }
}

export async function deleteScreenshot(submissionId: string, slot?: number): Promise<boolean> {
  const client = getSupabase()

  const extensions = ["webp", "png", "jpg", "svg"]
  const filenames = slot === undefined
    ? ["screenshot", "screenshot-2"]
    : [slot === 0 ? "screenshot" : `screenshot-${slot + 1}`]
  const paths = filenames.flatMap((filename) =>
    extensions.map((ext) => `${submissionId}/${filename}.${ext}`)
  )

  const { error } = await client.storage
    .from(SCREENSHOTS_BUCKET)
    .remove(paths)

  if (error) {
    console.error("Failed to delete screenshot:", error)
    return false
  }

  return true
}

export interface UploadSponsorLogoResult {
  url: string
  path: string
}

export type SponsorLogoVariant = "light" | "dark"

export async function uploadSponsorLogo(
  hackathonId: string,
  sponsorId: string,
  file: Buffer,
  originalMimeType: string,
  variant: SponsorLogoVariant = "light"
): Promise<UploadSponsorLogoResult | null> {
  const client = getSupabase()

  const { buffer, mimeType } = await optimizeImage(file, originalMimeType)

  const extension = mimeType === "image/svg+xml" ? "svg" : "webp"
  const filename = variant === "dark" ? "logo-dark" : "logo"
  const path = `sponsors/${hackathonId}/${sponsorId}/${filename}.${extension}`

  const { error } = await client.storage
    .from(LOGOS_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "3600",
    })

  if (error) {
    console.error("Failed to upload sponsor logo:", error)
    return null
  }

  const { data: urlData } = client.storage
    .from(LOGOS_BUCKET)
    .getPublicUrl(path)

  return {
    url: `${urlData.publicUrl}?v=${Date.now()}`,
    path,
  }
}

export async function deleteSponsorLogo(
  hackathonId: string,
  sponsorId: string,
  variant: SponsorLogoVariant = "light"
): Promise<boolean> {
  const client = getSupabase()

  const extensions = ["webp", "png", "svg"]
  const filename = variant === "dark" ? "logo-dark" : "logo"
  const paths = extensions.map((ext) => `sponsors/${hackathonId}/${sponsorId}/${filename}.${ext}`)

  const { error } = await client.storage
    .from(LOGOS_BUCKET)
    .remove(paths)

  if (error) {
    console.error("Failed to delete sponsor logo:", error)
    return false
  }

  return true
}

export async function downloadAndUploadBanner(
  hackathonId: string,
  imageUrl: string | null
): Promise<UploadBannerResult | null> {
  if (!imageUrl) return null

  // Validate URL scheme to prevent SSRF
  try {
    const url = new URL(imageUrl)
    if (url.protocol !== "https:") {
      console.warn(`Rejected non-HTTPS banner URL: ${imageUrl}`)
      return null
    }
    // Block private IP ranges and localhost
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "0000:0000:0000:0000:0000:0000:0000:0001" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80")
    ) {
      console.warn(`Rejected private/internal banner URL: ${imageUrl}`)
      return null
    }
  } catch (err) {
    console.error(`Invalid banner URL: ${imageUrl}`, err)
    return null
  }

  let response: Response
  try {
    response = await fetch(imageUrl)
  } catch (err) {
    console.error(`Failed to fetch banner image from ${imageUrl}:`, err)
    return null
  }

  if (!response.ok) {
    console.warn(`Banner image fetch returned ${response.status} for ${imageUrl}`)
    return null
  }

  try {
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return await uploadBanner(hackathonId, buffer)
  } catch (err) {
    console.error(`Failed to process/upload banner for hackathon ${hackathonId}:`, err)
    return null
  }
}

export interface UploadHeadshotResult {
  url: string
  path: string
}

const MAX_HEADSHOT_WIDTH = 400
const MAX_HEADSHOT_HEIGHT = 400

export async function optimizeHeadshot(
  buffer: Buffer
): Promise<{ buffer: Buffer; mimeType: string }> {
  const image = sharp(buffer)
  const metadata = await image.metadata()

  const needsResize =
    (metadata.width && metadata.width > MAX_HEADSHOT_WIDTH) ||
    (metadata.height && metadata.height > MAX_HEADSHOT_HEIGHT)

  let pipeline = image

  if (needsResize) {
    pipeline = pipeline.resize(MAX_HEADSHOT_WIDTH, MAX_HEADSHOT_HEIGHT, {
      fit: "cover",
      withoutEnlargement: true,
    })
  }

  const outputMimeType = "image/webp"
  const qualityLevels = [QUALITY, 70, 50]

  for (const quality of qualityLevels) {
    const optimized = await pipeline.clone().webp({ quality }).toBuffer()
    if (optimized.length <= MAX_OPTIMIZED_SIZE) {
      return { buffer: optimized, mimeType: outputMimeType }
    }
  }

  const finalBuffer = await pipeline.clone().webp({ quality: 50 }).toBuffer()
  throw new ImageTooLargeError(finalBuffer.length)
}

export async function uploadJudgeHeadshot(
  hackathonId: string,
  judgeDisplayId: string,
  file: Buffer
): Promise<UploadHeadshotResult | null> {
  const client = getSupabase()

  const { buffer, mimeType } = await optimizeHeadshot(file)

  const path = `${hackathonId}/${judgeDisplayId}/headshot.webp`

  const { error } = await client.storage
    .from(HEADSHOTS_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: "3600",
    })

  if (error) {
    console.error("Failed to upload judge headshot:", error)
    return null
  }

  const { data: urlData } = client.storage
    .from(HEADSHOTS_BUCKET)
    .getPublicUrl(path)

  return {
    url: `${urlData.publicUrl}?v=${Date.now()}`,
    path,
  }
}

export async function deleteJudgeHeadshot(
  hackathonId: string,
  judgeDisplayId: string
): Promise<boolean> {
  const client = getSupabase()

  const extensions = ["webp", "png", "jpg"]
  const paths = extensions.map((ext) => `${hackathonId}/${judgeDisplayId}/headshot.${ext}`)

  const { error } = await client.storage
    .from(HEADSHOTS_BUCKET)
    .remove(paths)

  if (error) {
    console.error("Failed to delete judge headshot:", error)
    return false
  }

  return true
}
