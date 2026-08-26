import { purgeExpiredExports } from "@/lib/services/submission-exports"
import { isAuthorizedCronRequest } from "@/lib/auth/cron"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await purgeExpiredExports()
  return Response.json(result)
}
