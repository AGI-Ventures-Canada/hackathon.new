import { listHackathonPeople } from "@/lib/services/hackathon-people"
import { listAssignableTeams } from "@/lib/services/hackathons"
import { PeopleTabClient } from "./_people-tab-client"

export type PeopleTabProps = {
  hackathonId: string
  hackathonStatus: string | null
}

export async function PeopleTab({ hackathonId, hackathonStatus }: PeopleTabProps) {
  const [people, teams] = await Promise.all([
    listHackathonPeople(hackathonId),
    listAssignableTeams(hackathonId),
  ])

  return <PeopleTabClient hackathonId={hackathonId} people={people} teams={teams} hackathonStatus={hackathonStatus} />
}
