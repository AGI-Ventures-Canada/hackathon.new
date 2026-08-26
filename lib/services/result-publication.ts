import type { SupabaseClient } from "@supabase/supabase-js"
import type { Hackathon } from "@/lib/db/hackathon-types"

export type ResultPublicationState =
  | { state: "committed"; hackathon: Hackathon }
  | { state: "not_committed" }
  | { state: "ambiguous" }

export async function stageResultPublication(
  client: SupabaseClient,
  hackathonId: string,
  publishedAt: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { data, error } = await client
    .from("hackathon_results")
    .update({ published_at: publishedAt })
    .eq("hackathon_id", hackathonId)
    .select("id")

  if (error || !data || data.length === 0) {
    return { success: false, error: "Failed to publish results" }
  }

  return { success: true }
}

export async function compensateResultPublication(
  client: SupabaseClient,
  hackathonId: string,
  publishedAt: string,
): Promise<void> {
  const { error } = await client
    .from("hackathon_results")
    .update({ published_at: null })
    .eq("hackathon_id", hackathonId)
    .eq("published_at", publishedAt)

  if (error) {
    throw new Error(`Failed to roll back result publication: ${error.message}`)
  }
}

export async function readResultPublicationState(
  client: SupabaseClient,
  hackathonId: string,
  tenantId: string,
  publishedAt: string,
): Promise<ResultPublicationState> {
  try {
    const [hackathonResult, resultsResult] = await Promise.all([
      client
        .from("hackathons")
        .select("*")
        .eq("id", hackathonId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      client
        .from("hackathon_results")
        .select("id, published_at")
        .eq("hackathon_id", hackathonId),
    ])

    if (hackathonResult.error || resultsResult.error) {
      return { state: "ambiguous" }
    }

    const hackathon = hackathonResult.data as Hackathon | null
    const results = resultsResult.data as Array<{
      id: string
      published_at: string | null
    }> | null

    if (!hackathon) return { state: "not_committed" }
    if (!results || results.length === 0) return { state: "ambiguous" }

    const eventCommitted =
      hackathon.status === "completed" &&
      hackathon.results_published_at === publishedAt
    const allResultsCommitted = results.every(
      (result) => result.published_at === publishedAt,
    )

    if (eventCommitted && allResultsCommitted) {
      return { state: "committed", hackathon }
    }
    if (hackathon.results_published_at !== publishedAt) {
      return { state: "not_committed" }
    }
    return { state: "ambiguous" }
  } catch {
    return { state: "ambiguous" }
  }
}
