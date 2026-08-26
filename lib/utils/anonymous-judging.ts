export type AnonymousJudgingState = {
  anonymous_judging: boolean
  results_published_at: string | null
}

export function publicSubmitterName(
  hackathon: AnonymousJudgingState,
  submitterName: string,
): string {
  if (hackathon.anonymous_judging) {
    return "Anonymous project"
  }

  return submitterName
}

export function publicTeamName(
  hackathon: AnonymousJudgingState,
  teamName: string | null,
): string | null {
  return hackathon.anonymous_judging ? null : teamName
}

export function publicMemberNames(
  hackathon: AnonymousJudgingState,
  members: string[],
): string[] {
  return hackathon.anonymous_judging ? [] : members
}
