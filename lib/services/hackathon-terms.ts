import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { hashTerms } from "@/lib/utils/terms-hash"

type HackathonTermsFields = {
  require_terms_acceptance: boolean | null
  terms_content: string | null
}

export async function currentTermsHash(
  hackathon: HackathonTermsFields
): Promise<string | null> {
  if (!hackathon.require_terms_acceptance) return null
  const content = hackathon.terms_content?.trim()
  if (!content) return null
  return hashTerms(content)
}

export async function recordTermsAcceptance(
  hackathonId: string,
  clerkUserId: string,
  hash: string
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("hackathon_terms_acceptances")
    .upsert(
      {
        hackathon_id: hackathonId,
        clerk_user_id: clerkUserId,
        terms_hash: hash,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "hackathon_id,clerk_user_id" }
    )

  if (error) {
    throw new Error(`Failed to record terms acceptance: ${error.message}`)
  }
}
