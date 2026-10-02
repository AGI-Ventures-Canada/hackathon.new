import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { AUTH_REQUEST_ORIGIN_HEADER, safeAuthRedirectUrl } from "@/lib/auth/redirect"
import { CustomSignIn } from "./custom-sign-in"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect_url?: string | string[]
    email?: string | string[]
  }>
}) {
  const { userId } = await auth()
  const { redirect_url, email } = await searchParams
  const requestHeaders = await headers()
  const safeRedirect = safeAuthRedirectUrl(redirect_url, requestHeaders.get(AUTH_REQUEST_ORIGIN_HEADER))
  const emailValue = Array.isArray(email) ? email[0] : email
  const initialEmail = redirect_url ? emailValue?.slice(0, 254) : undefined

  if (userId) {
    redirect(safeRedirect)
  }

  return <CustomSignIn redirectUrl={safeRedirect} initialEmail={initialEmail} />
}
