export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSlugFormat(slug: string): boolean {
  return slug.length >= 3 && SLUG_REGEX.test(slug)
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
