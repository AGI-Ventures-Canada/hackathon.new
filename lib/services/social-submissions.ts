import { supabase as getSupabase } from "@/lib/db/client"
import { fetchAllowedUrl, isAllowedHttpsUrl, readResponseText } from "@/lib/utils/safe-fetch-url"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isValidUuid } from "@/lib/utils/uuid"

export type SocialMediaSubmission = {
  id: string
  hackathon_id: string
  team_id: string | null
  participant_id: string
  url: string
  platform: string | null
  og_title: string | null
  og_description: string | null
  og_image_url: string | null
  status: "pending" | "approved" | "rejected"
  reviewed_at: string | null
  created_at: string
}

export type OgMetadata = {
  title: string | null
  description: string | null
  imageUrl: string | null
}

function detectPlatform(url: string): string | null {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }

  const matches = (domain: string) => hostname === domain || hostname.endsWith(`.${domain}`)
  if (matches("twitter.com") || matches("x.com")) return "twitter"
  if (matches("linkedin.com")) return "linkedin"
  if (matches("instagram.com")) return "instagram"
  if (matches("tiktok.com")) return "tiktok"
  if (matches("youtube.com") || matches("youtu.be")) return "youtube"
  if (matches("facebook.com") || matches("fb.com")) return "facebook"
  return null
}

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  try {
    const res = await fetchAllowedUrl(url, {
      headers: { "User-Agent": "HackathonNewBot/1.0 (+https://hackathon.new)" },
      signal: AbortSignal.timeout(5000),
    }, { requireHttps: true })
    if (!res?.ok) return { title: null, description: null, imageUrl: null }

    const html = await readResponseText(res, 1024 * 1024)
    if (html === null) return { title: null, description: null, imageUrl: null }
    const getMetaContent = (property: string): string | null => {
      const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i")
      const altRegex = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i")
      return regex.exec(html)?.[1] ?? altRegex.exec(html)?.[1] ?? null
    }

    const rawImageUrl = getMetaContent("og:image")
    let imageUrl: string | null = null
    if (rawImageUrl) {
      try {
        const resolvedImageUrl = new URL(rawImageUrl, res.url || url).toString()
        imageUrl = isAllowedHttpsUrl(resolvedImageUrl) ? resolvedImageUrl : null
      } catch {
        imageUrl = null
      }
    }

    return {
      title: getMetaContent("og:title"),
      description: getMetaContent("og:description"),
      imageUrl,
    }
  } catch {
    return { title: null, description: null, imageUrl: null }
  }
}

export async function submitSocialUrl(
  hackathonId: string,
  participantId: string,
  teamId: string | null,
  url: string
): Promise<SocialMediaSubmission | null> {
  if (
    !isValidUuid(hackathonId) ||
    !isValidUuid(participantId) ||
    (teamId !== null && !isValidUuid(teamId))
  ) return null

  const client = getSupabase() as unknown as SupabaseClient

  if (!isAllowedHttpsUrl(url)) return null

  const normalizedUrl = new URL(url).toString()

  const platform = detectPlatform(normalizedUrl)
  if (!platform) return null
  const og = await fetchOgMetadata(normalizedUrl)

  const { data, error } = await client
    .from("social_media_submissions")
    .insert({
      hackathon_id: hackathonId,
      participant_id: participantId,
      team_id: teamId,
      url: normalizedUrl,
      platform,
      og_title: og.title,
      og_description: og.description,
      og_image_url: og.imageUrl,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to submit social URL:", error)
    return null
  }

  return data as SocialMediaSubmission
}

export async function listSocialSubmissions(
  hackathonId: string,
  status?: "pending" | "approved" | "rejected"
): Promise<SocialMediaSubmission[]> {
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("social_media_submissions")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: false })

  if (status) {
    query = query.eq("status", status)
  }

  const { data, error } = await query

  if (error) {
    console.error("Failed to list social submissions:", error)
    return []
  }

  return data as SocialMediaSubmission[]
}

export async function reviewSocialSubmission(
  submissionId: string,
  hackathonId: string,
  status: "approved" | "rejected"
): Promise<boolean> {
  if (!isValidUuid(submissionId) || !isValidUuid(hackathonId)) return false

  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("social_media_submissions")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("hackathon_id", hackathonId)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("Failed to review social submission:", error)
    return false
  }

  return Boolean(data)
}
