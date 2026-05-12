import { supabase as getSupabase } from "@/lib/db/client"
import type { HackathonNotificationSettings } from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"

const DEFAULTS: Omit<HackathonNotificationSettings, "hackathon_id" | "created_at" | "updated_at"> = {
  email_on_registration_open: true,
  email_on_hackathon_active: true,
  email_on_judging_started: true,
  email_on_results_published: true,
  email_on_challenges_released: true,
}

export async function getNotificationSettings(
  hackathonId: string
): Promise<HackathonNotificationSettings> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data } = await client
    .from("hackathon_notification_settings")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .single()

  if (data) return data as HackathonNotificationSettings

  return {
    hackathon_id: hackathonId,
    ...DEFAULTS,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export async function upsertNotificationSettings(
  hackathonId: string,
  settings: Partial<Omit<HackathonNotificationSettings, "hackathon_id" | "created_at" | "updated_at">>
): Promise<HackathonNotificationSettings | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathon_notification_settings")
    .upsert(
      {
        hackathon_id: hackathonId,
        ...settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hackathon_id" }
    )
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to upsert notification settings:", error)
    return null
  }

  return data as HackathonNotificationSettings
}
