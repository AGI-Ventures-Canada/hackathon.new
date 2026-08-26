import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { safeRedirectUrl } from "@/lib/utils/url"
import { CustomSignUp } from "./custom-sign-up"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect_url?: string | string[]
    email?: string | string[]
  }>
}) {
  const { userId, orgId } = await auth()
  const { redirect_url, email } = await searchParams
  const safeRedirect = redirect_url ? safeRedirectUrl(redirect_url) : undefined
  const emailValue = Array.isArray(email) ? email[0] : email
  const initialEmail = redirect_url ? emailValue?.slice(0, 254) : undefined

  if (userId) {
    redirect(safeRedirect ?? (orgId ? "/home" : "/onboarding"))
  }

  return <CustomSignUp redirectUrl={safeRedirect} initialEmail={initialEmail} />
}
