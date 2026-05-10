import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { safeRedirectUrl } from "@/lib/utils/url"
import { CustomSignUp } from "./custom-sign-up"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; email?: string }>
}) {
  const { userId, orgId } = await auth()
  const { redirect_url, email } = await searchParams
  const safeRedirect = redirect_url ? safeRedirectUrl(redirect_url) : undefined

  if (userId && orgId) {
    redirect(safeRedirect ?? "/home")
  }

  return <CustomSignUp redirectUrl={safeRedirect} initialEmail={email} />
}
