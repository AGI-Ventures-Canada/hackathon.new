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
  hackathon: HackathonTermsFields & { id: string },
  clerkUserId: string,
  expectedHash: string
): Promise<void> {
  const currentHash = await currentTermsHash(hackathon)
  if (!currentHash) {
    throw new Error("Hackathon does not require terms acceptance")
  }
  if (currentHash !== expectedHash) {
    throw new Error("Terms hash mismatch")
  }

  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("hackathon_terms_acceptances")
    .upsert(
      {
        hackathon_id: hackathon.id,
        clerk_user_id: clerkUserId,
        terms_hash: currentHash,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "hackathon_id,clerk_user_id" }
    )

  if (error) {
    throw new Error(`Failed to record terms acceptance: ${error.message}`)
  }
}
