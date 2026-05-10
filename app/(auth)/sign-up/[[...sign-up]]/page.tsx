import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { safeRedirectUrl } from "@/lib/utils/url"
import { CustomSignUp } from "./custom-sign-up"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { userId, orgId } = await auth()
  const { redirect_url } = await searchParams
  const safeRedirect = redirect_url ? safeRedirectUrl(redirect_url) : undefined

  // Only bounce away if the user already has an *active* org. A signed-in
  // user mid-create-org (or whose org was deleted/revoked) needs to fall
  // through and re-run the org-creation step, not get redirected.
  if (userId && orgId) {
    redirect(safeRedirect ?? "/home")
  }

  return <CustomSignUp redirectUrl={safeRedirect} />
}
