import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

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
  const lower = url.toLowerCase()
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "twitter"
  if (lower.includes("linkedin.com")) return "linkedin"
  if (lower.includes("instagram.com")) return "instagram"
  if (lower.includes("tiktok.com")) return "tiktok"
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube"
  if (lower.includes("facebook.com") || lower.includes("fb.com")) return "facebook"
  return null
}

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HackathonNewBot/1.0 (+https://hackathon.new)" },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { title: null, description: null, imageUrl: null }

    const html = await res.text()
    const getMetaContent = (property: string): string | null => {
      const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i")
      const altRegex = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i")
      return regex.exec(html)?.[1] ?? altRegex.exec(html)?.[1] ?? null
    }

    return {
      title: getMetaContent("og:title"),
      description: getMetaContent("og:description"),
      imageUrl: getMetaContent("og:image"),
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
  const client = getSupabase() as unknown as SupabaseClient

  const platform = detectPlatform(url)
  const og = await fetchOgMetadata(url)

  const { data, error } = await client
    .from("social_media_submissions")
    .insert({
      hackathon_id: hackathonId,
      participant_id: participantId,
      team_id: teamId,
      url,
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
  status: "approved" | "rejected"
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error } = await client
    .from("social_media_submissions")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId)

  if (error) {
    console.error("Failed to review social submission:", error)
    return false
  }

  return true
}
