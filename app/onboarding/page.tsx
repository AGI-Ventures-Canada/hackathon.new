import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { OrganizationList } from "@clerk/nextjs"
import { safeRedirectUrl } from "@/lib/utils/url"

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
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center text-center space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome to Oatmeal</h1>
          <p className="text-muted-foreground">
            Create or select an organization, or continue with a personal
            account
          </p>
        </div>
        <OrganizationList
          afterCreateOrganizationUrl={destination}
          afterSelectOrganizationUrl={destination}
          afterSelectPersonalUrl={destination}
        />
        <div className="pt-2">
          <Link href={destination} className="text-sm text-muted-foreground underline">
            Continue with personal account
          </Link>
        </div>
      </div>
    </div>
  )
}
