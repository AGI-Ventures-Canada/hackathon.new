import { sha256Fingerprint } from "@/lib/utils/hash"
import type { ConfigureJudgingInput } from "@/lib/judging/setup"

export async function judgingSetupRequestKey(
  eventId: string,
  version: string,
  input: Omit<ConfigureJudgingInput, "expectedVersion" | "requestKey">,
) {
  const settings = input.settings
    ? Object.fromEntries(Object.entries(input.settings).sort(([a], [b]) => a.localeCompare(b)))
    : undefined
  return `setup:${await sha256Fingerprint(JSON.stringify({ eventId, version, settings, applyStarter: input.applyStarter ?? false, starterPrizeName: input.starterPrizeName }), 64)}`
}
