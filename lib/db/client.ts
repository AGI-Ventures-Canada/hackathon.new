import { createClient, SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./types"

let _supabase: SupabaseClient<Database> | null = null

export class MissingSupabaseCredentialsError extends Error {
  constructor() {
    super("Missing Supabase credentials")
    this.name = "MissingSupabaseCredentialsError"
  }
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (_supabase) return _supabase

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new MissingSupabaseCredentialsError()
  }

  _supabase = createClient<Database>(url, key)
  return _supabase
}

export { getSupabaseClient as supabase }
