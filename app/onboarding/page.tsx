import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { safeRedirectUrl } from "@/lib/utils/url"
import { CreateOrgForm } from "@/components/auth/create-org-form"

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { userId, orgId } = await auth()
  const { redirect_url } = await searchParams
  const destination = redirect_url ? safeRedirectUrl(redirect_url) : "/home"

  if (!userId) {
    redirect("/sign-in")
  }

  if (orgId) {
    redirect(destination)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 text-center">
        <h1 className="font-bold text-2xl text-foreground">Welcome to Oatmeal</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create an organization or continue with your personal account
        </p>
      </div>
      <CreateOrgForm redirectUrl={destination} skipUrl={destination} />
    </div>
  )
}
