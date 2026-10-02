import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import type { OatmealClient } from "../../client.js"
import { formatDetail, formatJson, formatSuccess, formatTable, formatWarning } from "../../output.js"

type Flags = Record<string, string | true>
type Setup = { version: string; name: string; settings: Record<string, unknown>; prizes: Record<string, unknown>[]; coreCriteria: Record<string, unknown>[]; prizeCriteria: Record<string, unknown>[]; readiness: { isReady: boolean; issues: { message: string }[] } }
type Preview = { version: string; targetReviewsPerProject: number; assignments: unknown[]; coverage: { projectTitle: string; prizeName: string; assigned: number; planned: number; target: number }[]; workload: { name: string; existing: number; added: number }[]; warnings: string[] }

export function parseWorkspaceFlags(args: string[], booleans: string[] = []): Flags {
  const flags: Flags = {}
  const switches = new Set(["json", "yes", ...booleans])
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!name.startsWith("--")) throw new Error(`Expected an option, got ${name}`)
    const key = name.slice(2)
    if (switches.has(key)) { flags[key] = true; continue }
    const value = args[++i]
    if (value === undefined || value.startsWith("--")) throw new Error(`Provide a value for ${name}`)
    flags[key] = value
  }
  return flags
}

function stringFlag(flags: Flags, key: string): string | undefined { return typeof flags[key] === "string" ? flags[key] : undefined }
function required(flags: Flags, key: string): string { const value = stringFlag(flags, key); if (!value) throw new Error(`--${key} is required`); return value }
function integer(flags: Flags, key: string, minimum: number, maximum: number): number | undefined {
  const raw = stringFlag(flags, key)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`--${key} must be between ${minimum} and ${maximum}`)
  return value
}
function booleanValue(flags: Flags, key: string): boolean | undefined {
  const value = stringFlag(flags, key)
  if (value === undefined) return undefined
  if (["true", "on", "enabled"].includes(value)) return true
  if (["false", "off", "disabled"].includes(value)) return false
  throw new Error(`--${key} must be on or off`)
}
function base(eventId: string): string { if (!eventId || eventId.startsWith("--")) throw new Error("An event ID is required"); return `/api/dashboard/hackathons/${encodeURIComponent(eventId)}` }
function dateFlag(flags: Flags, key: string): string | null | undefined {
  const value = stringFlag(flags, key)
  if (value === undefined) return undefined
  if (value === "clear") return null
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`--${key} needs a date with its timezone, such as 2026-09-10T09:00:00-04:00`)
  return new Date(value).toISOString()
}
async function payload(flags: Flags): Promise<Record<string, unknown>> {
  const file = stringFlag(flags, "file")
  const raw = file ? await readFile(file, "utf8") : stringFlag(flags, "data")
  if (!raw) return {}
  if (raw.length > 1_000_000) throw new Error("Keep the settings file under 1 MB")
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Settings must be a JSON object")
  return data as Record<string, unknown>
}
function reportSetup(setup: Setup): void {
  console.log(formatDetail([{ label: "Event", value: setup.name }, { label: "Ready", value: setup.readiness.isReady ? "Yes" : "Needs a few steps" }, { label: "Version", value: setup.version }]))
  for (const issue of setup.readiness.issues) console.log(formatWarning(issue.message))
  console.log(formatJson({ settings: setup.settings, prizes: setup.prizes, coreCriteria: setup.coreCriteria, prizeCriteria: setup.prizeCriteria }))
}

export async function runJudgingSetup(client: OatmealClient, action: string, eventId: string, args: string[]): Promise<void> {
  const flags = parseWorkspaceFlags(args, ["starter"])
  const endpoint = `${base(eventId)}/judging/setup`
  if (action === "inspect" || action === "show") {
    const result = await client.get<{ setup: Setup }>(endpoint)
    if (flags.json) console.log(formatJson(result)); else reportSetup(result.setup)
    return
  }
  if (action !== "configure") throw new Error("Use judging setup inspect or configure")
  const settings: Record<string, unknown> = await payload(flags)
  for (const [flag, field] of [["opens-at", "opensAt"], ["closes-at", "closesAt"]]) { const value = dateFlag(flags, flag); if (value !== undefined) settings[field] = value }
  for (const [flag, field] of [["timezone", "timezone"], ["instructions", "instructions"]]) { const value = stringFlag(flags, flag); if (value !== undefined) settings[field] = value }
  for (const [flag, field] of [["browse", "browseEnabled"], ["reminders", "remindersEnabled"]]) { const value = booleanValue(flags, flag); if (value !== undefined) settings[field] = value }
  const target = integer(flags, "reviews-per-project", 1, 20)
  if (target !== undefined) settings.targetReviewsPerProject = target
  if (!flags.starter && Object.keys(settings).length === 0) throw new Error("Choose settings to change or add --starter")
  const expectedVersion = stringFlag(flags, "expected-version") ?? (await client.get<{ setup: Setup }>(endpoint)).setup.version
  const requestKey = stringFlag(flags, "request-key") ?? randomUUID()
  const result = await client.patch<{ setup: Setup }>(endpoint, { expectedVersion, requestKey, settings, ...(flags.starter ? { applyStarter: true, starterPrizeName: stringFlag(flags, "prize-name") ?? "Best overall" } : {}) })
  if (flags.json) console.log(formatJson({ ...result, requestKey })); else { console.log(formatSuccess("Saved judging settings")); reportSetup(result.setup) }
}

export async function runJudgingScorecards(client: OatmealClient, action: string, eventId: string, prizeId: string | undefined, args: string[]): Promise<void> {
  const flags = parseWorkspaceFlags(args)
  if (action === "list" || action === "inspect") {
    const { setup } = await client.get<{ setup: Setup }>(`${base(eventId)}/judging/setup`)
    console.log(formatJson({ coreCriteria: setup.coreCriteria, prizes: setup.prizes, prizeCriteria: setup.prizeCriteria }))
    return
  }
  if (action !== "update" || !prizeId) throw new Error("Use judging scorecards update <event> <prize> --file scorecard.json")
  const body = await payload(flags)
  if (stringFlag(flags, "style")) body.judgingStyle = stringFlag(flags, "style")
  if (stringFlag(flags, "round")) body.roundId = stringFlag(flags, "round") === "none" ? null : stringFlag(flags, "round")
  if (stringFlag(flags, "judge-scope")) body.judgeScope = stringFlag(flags, "judge-scope")
  const picks = integer(flags, "max-picks", 1, 100)
  if (picks !== undefined) body.maxPicks = picks
  if (!Object.keys(body).length) throw new Error("Provide --file, --data, or a scorecard option")
  const result = await client.patch(`${base(eventId)}/prizes/${encodeURIComponent(prizeId)}`, body)
  console.log(flags.json ? formatJson(result) : formatSuccess("Saved the prize scorecard"))
}

export async function runJudgingDistribution(client: OatmealClient, action: string, eventId: string, args: string[]): Promise<void> {
  const flags = parseWorkspaceFlags(args)
  const targetReviewsPerProject = integer(flags, "reviews-per-project", 1, 20) ?? 3
  const endpoint = `${base(eventId)}/judging/distribution`
  if (action === "preview") {
    const result = await client.post<{ preview: Preview }>(`${endpoint}/preview`, { targetReviewsPerProject })
    if (flags.json) console.log(formatJson(result))
    else {
      console.log(formatDetail([{ label: "New reviews", value: String(result.preview.assignments.length) }, { label: "Preview version", value: result.preview.version }]))
      console.log(formatTable(result.preview.workload, [{ key: "name", label: "Judge" }, { key: "existing", label: "Current projects" }, { key: "added", label: "New projects" }]))
      console.log(formatTable(result.preview.coverage, [{ key: "projectTitle", label: "Project" }, { key: "prizeName", label: "Prize" }, { key: "assigned", label: "Current" }, { key: "planned", label: "Added" }, { key: "target", label: "Target" }]))
      for (const warning of result.preview.warnings) console.log(formatWarning(warning))
    }
    return
  }
  if (action !== "apply") throw new Error("Use judging assignments preview or apply")
  const requestKey = stringFlag(flags, "request-key") ?? randomUUID()
  const result = await client.post<{ createdAssignments: number; warnings: string[] }>(`${endpoint}/apply`, { targetReviewsPerProject, expectedVersion: required(flags, "expected-version"), requestKey })
  if (flags.json) console.log(formatJson({ ...result, requestKey }))
  else { console.log(formatSuccess(`Assigned ${result.createdAssignments} new project reviews`)); for (const warning of result.warnings) console.log(formatWarning(warning)); console.log(formatDetail([{ label: "Request key", value: requestKey }])) }
}

export async function runJudgingInvitationBatch(client: OatmealClient, action: "batch" | "remind", eventId: string, args: string[]): Promise<void> {
  const flags = parseWorkspaceFlags(args, ["preview", "send"])
  if (flags.preview && flags.send) throw new Error("Choose --preview or --send")
  const emails = required(flags, "emails").split(/[;,\n]/).map((email) => email.trim()).filter(Boolean)
  if (!emails.length || emails.length > 20) throw new Error("Invite between 1 and 20 email addresses at a time")
  const requestKey = stringFlag(flags, "request-key") ?? randomUUID()
  const split = (key: string) => stringFlag(flags, key)?.split(",").map((value) => value.trim()).filter(Boolean)
  const result = await client.post<{ preview: boolean; results: { email: string; outcome: string; delivery?: string; message?: string; error?: string }[] }>(`${base(eventId)}/judging/judges/${action}`, {
    emails, preview: !flags.send, ...(!flags.send ? {} : { requestKey }), message: stringFlag(flags, "message"), prizeIds: split("prizes"), roomIds: split("rooms"),
  })
  if (flags.json) console.log(formatJson({ ...result, ...(flags.send ? { requestKey } : {}) }))
  else {
    console.log(formatTable(result.results.map((row) => ({ email: row.email, outcome: row.outcome.replaceAll("_", " "), delivery: row.delivery?.replaceAll("_", " ") ?? "", details: row.message ?? row.error ?? "" })), [{ key: "email", label: "Email" }, { key: "outcome", label: "Outcome" }, { key: "delivery", label: "Delivery" }, { key: "details", label: "Details" }]))
    if (!flags.send) console.log("Preview only. Add --send to invite these judges.")
  }
}

export async function runJudgingRounds(client: OatmealClient, action: string, eventId: string, roundId: string | undefined, args: string[]): Promise<void> {
  const flags = parseWorkspaceFlags(args)
  const endpoint = `${base(eventId)}/rounds`
  if (action === "list") { console.log(formatJson(await client.get(endpoint))); return }
  const body = await payload(flags)
  if (stringFlag(flags, "name")) body.name = stringFlag(flags, "name")
  if (stringFlag(flags, "advancement")) body.advancement = stringFlag(flags, "advancement")
  if (stringFlag(flags, "preset")) body.preset = stringFlag(flags, "preset")
  for (const [flag, field] of [["opens-at", "opensAt"], ["closes-at", "closesAt"]]) { const value = dateFlag(flags, flag); if (value !== undefined) body[field] = value }
  let result: unknown
  if (action === "create" || action === "preset") result = await client.post(action === "preset" ? `${endpoint}/preset` : endpoint, body)
  else {
    if (!roundId) throw new Error("A round ID is required")
    const roundEndpoint = `${endpoint}/${encodeURIComponent(roundId)}`
    if (action === "update") result = await client.patch(roundEndpoint, body)
    else if (action === "delete") { if (!flags.yes) throw new Error("Add --yes to delete this round"); result = await client.delete(roundEndpoint) }
    else if (["activate", "complete", "advance"].includes(action)) result = await client.post(`${roundEndpoint}/${action}`, body)
    else if (action === "candidates") result = await client.get(`${roundEndpoint}/advance-candidates`)
    else throw new Error("Unknown judging rounds action")
  }
  console.log(formatJson(result ?? { success: true }))
}

export async function runJudgeScope(client: OatmealClient, eventId: string, judgeId: string, args: string[]): Promise<void> {
  if (!judgeId || judgeId.startsWith("--")) throw new Error("A judge ID is required. Find it with judging judges list.")
  const flags = parseWorkspaceFlags(args)
  const endpoint = `${base(eventId)}/judging/judges/${encodeURIComponent(judgeId)}/scope`
  const result = await client.get<{ options: { version: string; prizeScope: "all" | "selected"; prizeIds: string[]; roomIds: string[]; locked: boolean } }>(endpoint)
  const prizes = stringFlag(flags, "prizes")
  const rooms = stringFlag(flags, "rooms")
  if (prizes === undefined && rooms === undefined) { console.log(formatJson(result)); return }
  if (result.options.locked) throw new Error("This judge has submitted reviews. Their prizes and rooms must stay fixed.")
  const split = (value: string) => value === "all" ? [] : value.split(",").map((id) => id.trim()).filter(Boolean)
  const saved = await client.patch(endpoint, { expectedVersion: stringFlag(flags, "expected-version") ?? result.options.version, prizeScope: prizes === undefined ? result.options.prizeScope : prizes === "all" ? "all" : "selected", prizeIds: prizes === undefined ? result.options.prizeIds : split(prizes), roomIds: rooms === undefined ? result.options.roomIds : split(rooms) })
  console.log(flags.json ? formatJson(saved) : formatSuccess("Saved the judge's prizes and rooms"))
}
