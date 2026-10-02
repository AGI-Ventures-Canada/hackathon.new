import type { OatmealClient } from "../../client.js"

export async function runLevelsDelete(_client: OatmealClient, eventId: string, _criteriaId: string, _levelId: string, _options: { yes?: boolean; json?: boolean }): Promise<void> {
  throw new Error(`The old rubric-level API is no longer available. Inspect scorecards with hackathon judging scorecards list ${eventId || "<event>"}; edit prize rules with judging scorecards update <event> <prize> --file scorecard.json. Existing reviews are kept.`)
}
