import { auth } from "@clerk/nextjs/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { CliAuthClient } from "@/components/cli-auth/cli-auth-client"
import { CliAuthAuthorizeClient } from "@/components/cli-auth/cli-auth-authorize-client"
import {
  completeCliAuthSession,
  getCliKeyScopes,
  isValidCliDeviceToken,
} from "@/lib/services/cli-auth"
import { scopesForRole } from "@/lib/auth/types"
import { getOrCreateTenant } from "@/lib/services/tenants"
import { logAudit } from "@/lib/services/audit"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "CLI Authentication | hackathon.new",
  description: "Authorize the hackathon.new CLI to access your account.",
}

type PageProps = {
  searchParams: Promise<{ result?: string }>
}

async function authorizeCli(formData: FormData) {
  "use server"

  const token = formData.get("token")
  const userCode = formData.get("userCode")
  if (typeof token !== "string" || !isValidCliDeviceToken(token)) {
    redirect("/cli-auth?result=invalid")
  }

  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) {
    redirect("/sign-in?redirect_url=%2Fcli-auth")
  }

  const tenant = await getOrCreateTenant(orgId)
  if (!tenant) redirect("/cli-auth?result=failed")

  const callerScopes = scopesForRole(orgRole ?? "org:member")
  const grantedScopes = getCliKeyScopes(callerScopes)
  const headersList = await headers()
  const hostname = headersList.get("host")?.split(":")[0]
  const result = await completeCliAuthSession(
    token,
    tenant.id,
    grantedScopes,
    hostname,
    typeof userCode === "string" ? userCode : undefined,
  )

  if (!result.success) redirect("/cli-auth?result=failed")

  await logAudit({
    principal: {
      kind: "user",
      tenantId: tenant.id,
      userId,
      orgId,
      orgRole: orgRole ?? "org:member",
      scopes: callerScopes,
    },
    action: "cli_auth.completed",
    resourceType: "cli_auth_session",
    resourceId: token.slice(0, 12),
  })

  redirect("/cli-auth?result=success")
}

export default async function CliAuthPage({ searchParams }: PageProps) {
  const { result } = await searchParams

  if (result === "success") {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
        <CliAuthClient result={{ success: true }} />
      </div>
    )
  }

  if (result === "failed") {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
        <CliAuthClient result={{ success: false, error: "The sign-in request failed or expired." }} />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
      <CliAuthAuthorizeClient action={authorizeCli} />
    </div>
  )
}
