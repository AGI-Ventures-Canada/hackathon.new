import { getWebMcpOriginTrialToken } from "@/lib/webmcp/origin-trial"

export function WebMcpOriginTrialMeta({
  token = getWebMcpOriginTrialToken(),
}: {
  token?: string | null
}) {
  if (!token) return null
  return <meta httpEquiv="origin-trial" content={token} />
}
