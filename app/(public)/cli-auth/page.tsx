import { auth } from "@clerk/nextjs/server"
import { OrganizationList } from "@clerk/nextjs"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CliAuthClient } from "@/components/cli-auth/cli-auth-client"
import { completeCliAuthSession } from "@/lib/services/cli-auth"
import { getOrCreateTenant, getOrCreatePersonalTenant } from "@/lib/services/tenants"
import { logAudit } from "@/lib/services/audit"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "CLI Authentication | Oatmeal",
  description: "Authorize the Oatmeal CLI to access your account.",
}

type PageProps = {
  searchParams: Promise<{ token?: string; personal?: string }>
}

export default async function CliAuthPage({ searchParams }: PageProps) {
  const { token, personal } = await searchParams

  if (!token || token.length < 32) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">Invalid Link</h1>
          <p className="text-muted-foreground">
            This CLI authentication link is invalid or has expired. Please run{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm">oatmeal login</code>{" "}
            again from your terminal.
          </p>
        </div>
      </div>
    )
  }

  const returnUrl = `/cli-auth?token=${encodeURIComponent(token)}`
  const personalUrl = `${returnUrl}&personal=1`

  const { userId, orgId } = await auth()

  if (!userId) {
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(personal === "1" ? personalUrl : returnUrl)}`
    )
  }

  if (!orgId && personal !== "1") {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
        <div className="flex max-w-md flex-col items-center space-y-6 text-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">Pick a workspace</h1>
            <p className="text-muted-foreground">
              The CLI will create events in the workspace you pick here.
            </p>
          </div>
          <OrganizationList
            afterCreateOrganizationUrl={returnUrl}
            afterSelectOrganizationUrl={returnUrl}
            afterSelectPersonalUrl={personalUrl}
          />
          <Link href={personalUrl} className="text-sm text-muted-foreground underline">
            Use my personal workspace
          </Link>
        </div>
      </div>
    )
  }

  const headersList = await headers()
  const hostname = headersList.get("host")?.split(":")[0]

  let tenant
  if (orgId) {
    tenant = await getOrCreateTenant(orgId)
  } else {
    tenant = await getOrCreatePersonalTenant(userId)
  }

  let result: { success: boolean; error?: string }
  if (!tenant) {
    result = { success: false, error: "Could not resolve your account. Please try again." }
  } else {
    try {
      result = await completeCliAuthSession(token, tenant.id, hostname)
      if (result.success) {
        await logAudit({
          principal: {
            kind: "user",
            tenantId: tenant.id,
            userId,
            orgId: orgId ?? null,
            orgRole: null,
            scopes: [],
          },
          action: "cli_auth.completed",
          resourceType: "cli_auth_session",
          resourceId: token.slice(0, 12),
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      console.error("[cli-auth] Failed to complete session:", message)
      result = { success: false, error: "Something went wrong. Please try again." }
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
      <CliAuthClient result={result} />
    </div>
  )
}
