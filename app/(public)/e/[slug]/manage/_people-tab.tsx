import { listHackathonPeople } from "@/lib/services/hackathon-people"
import { getHackathonStatus } from "@/lib/services/public-hackathons"
import { supabase as getSupabase } from "@/lib/db/client"
import { PeopleTabClient } from "./_people-tab-client"

export type PeopleTabProps = {
  hackathonId: string
}

export async function PeopleTab({ hackathonId }: PeopleTabProps) {
  const client = getSupabase()
  const [people, teamsRes, status] = await Promise.all([
    listHackathonPeople(hackathonId),
    client
      .from("teams")
      .select("id, name")
      .eq("hackathon_id", hackathonId)
      .neq("status", "disbanded")
      .order("name"),
    getHackathonStatus(hackathonId),
  ])

  const teams = ((teamsRes.data ?? []) as Array<{ id: string; name: string }>).map((t) => ({
    id: t.id,
    name: t.name,
  }))

  return <PeopleTabClient hackathonId={hackathonId} people={people} teams={teams} hackathonStatus={status} />
}
