import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { safeRedirectUrl } from "@/lib/utils/url"
import { CustomSignIn } from "./custom-sign-in"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; email?: string }>
}) {
  const { userId } = await auth()
  const { redirect_url, email } = await searchParams
  const safeRedirect = safeRedirectUrl(redirect_url)
  const initialEmail = redirect_url ? email : undefined

  if (userId) {
    redirect(safeRedirect)
  }

  return <CustomSignIn redirectUrl={safeRedirect} initialEmail={initialEmail} />
}
