import { listHackathonPeople } from "@/lib/services/hackathon-people"
import { PeopleTabClient } from "./_people-tab-client"

export type PeopleTabProps = {
  hackathonId: string
  slug: string
}

export async function PeopleTab({ hackathonId, slug }: PeopleTabProps) {
  const people = await listHackathonPeople(hackathonId)
  return <PeopleTabClient hackathonId={hackathonId} slug={slug} people={people} />
}
