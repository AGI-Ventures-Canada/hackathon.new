import { cache } from "react"
import { auth } from "@clerk/nextjs/server"
import { getPublicHackathon } from "./public-hackathons"

export type ManageHackathonSuccess = {
  ok: true
  hackathon: NonNullable<Awaited<ReturnType<typeof getPublicHackathon>>>
}

export type ManageHackathonError =
  | { ok: false; reason: "unauthenticated" }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "not_organizer" }

export type ManageHackathonResult = ManageHackathonSuccess | ManageHackathonError

export const getManageHackathon = cache(
  async (slug: string): Promise<ManageHackathonResult> => {
    const { userId, orgId } = await auth()

    if (!userId) {
      return { ok: false, reason: "unauthenticated" }
    }

    const hackathon = await getPublicHackathon(slug, { includeUnpublished: true })

    if (!hackathon) {
      return { ok: false, reason: "not_found" }
    }

    const isOrganizer =
      (orgId != null && hackathon.organizer.clerk_org_id === orgId) ||
      (orgId == null && hackathon.organizer.clerk_user_id === userId)

    if (!isOrganizer) {
      return { ok: false, reason: "not_organizer" }
    }

    return { ok: true, hackathon }
  }
)
