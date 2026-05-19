import { redirect } from "next/navigation"
import { isAdminEnabled } from "@/lib/auth/principal"
import { safeRedirectUrl } from "@/lib/utils/url"
import { DevSwitchClient } from "./switch-client"

export default async function DevSwitchPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; redirect?: string; org?: string; signed_out?: string }>
}) {
  if (!isAdminEnabled()) {
    redirect("/")
  }

  const { token, redirect: redirectParam, org, signed_out } = await searchParams

  if (!token) {
    redirect("/sign-in")
  }

  const safeRedirect = safeRedirectUrl(redirectParam)

  return <DevSwitchClient token={token} redirect={safeRedirect} org={org ?? null} signedOut={signed_out === "1"} />
}
