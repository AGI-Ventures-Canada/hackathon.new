import { listHackathonPeople } from "@/lib/services/hackathon-people"
import { PeopleTabClient } from "./_people-tab-client"

export type PeopleTabProps = {
  hackathonId: string
}

export async function PeopleTab({ hackathonId }: PeopleTabProps) {
  const people = await listHackathonPeople(hackathonId)
  return <PeopleTabClient hackathonId={hackathonId} people={people} />
}
