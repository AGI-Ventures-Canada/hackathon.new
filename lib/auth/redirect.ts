import { safeRedirectUrl } from "@/lib/utils/url"

export const AUTH_REQUEST_ORIGIN_HEADER = "x-oatmeal-request-origin"

export function safeAuthRedirectUrl(
  value: string | string[] | undefined,
  requestOrigin: string | null,
  fallback = "/home",
): string {
  const candidate = Array.isArray(value) ? value[0] : value
  const local = safeRedirectUrl(candidate, "")
  if (local) return local
  if (!candidate || !requestOrigin || candidate.length > 8192 || candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) return fallback
  try {
    const target = new URL(candidate)
    const origin = new URL(requestOrigin)
    if (!["https:", "http:"].includes(target.protocol) || target.origin !== origin.origin || target.username || target.password) return fallback
    return safeRedirectUrl(`${target.pathname}${target.search}${target.hash}`, fallback)
  } catch {
    return fallback
  }
}
