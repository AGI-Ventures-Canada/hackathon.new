export async function hashTerms(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content.trim())
  const digest = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
