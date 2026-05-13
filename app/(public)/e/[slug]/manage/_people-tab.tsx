import { listHackathonPeople } from "@/lib/services/hackathon-people"
import { getHackathonStatus } from "@/lib/services/public-hackathons"
import { listAssignableTeams } from "@/lib/services/hackathons"
import { PeopleTabClient } from "./_people-tab-client"

export type PeopleTabProps = {
  hackathonId: string
}

export async function PeopleTab({ hackathonId }: PeopleTabProps) {
  const [people, teams, status] = await Promise.all([
    listHackathonPeople(hackathonId),
    listAssignableTeams(hackathonId),
    getHackathonStatus(hackathonId),
  ])

  return <PeopleTabClient hackathonId={hackathonId} people={people} teams={teams} hackathonStatus={status} />
}
