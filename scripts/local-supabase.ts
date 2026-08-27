export function isLocalSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
    )
  } catch {
    return false
  }
}

export function requireLocalSupabaseUrl(value: string): void {
  if (!isLocalSupabaseUrl(value)) {
    throw new Error("This script only runs against a local Supabase URL.")
  }
}
