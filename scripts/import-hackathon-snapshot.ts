import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const file = process.argv[2]
if (!file) {
  console.error("Usage: bun run scripts/import-hackathon-snapshot.ts <path-to-snapshot.json>")
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env")
  process.exit(1)
}

if (!supabaseUrl.includes("127.0.0.1") && !supabaseUrl.includes("localhost")) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local (${supabaseUrl})`)
  console.error("This script is intended for local dev databases only.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

type Row = Record<string, unknown>
type Snapshot = Record<string, Row[] | unknown>

const INSERT_ORDER = [
  "tenants",
  "hackathons",
  "teams",
  "hackathon_participants",
  "challenges",
  "hackathon_sponsors",
  "judging_rounds",
  "prizes",
  "judging_criteria",
  "submissions",
  "hackathon_judges_display",
  "hackathon_schedule_items",
  "hackathon_transitions",
  "judge_pending_notifications",
  "scheduled_reminders",
] as const

async function importTable(name: string, rows: Row[]) {
  if (rows.length === 0) {
    console.log(`  ${name}: skipped (no rows)`)
    return
  }
  const { error } = await supabase.from(name).upsert(rows, { onConflict: "id" })
  if (error) {
    console.error(`  ${name}: FAILED — ${error.message}`)
    if (error.details) console.error(`    details: ${error.details}`)
    return
  }
  console.log(`  ${name}: ${rows.length} row${rows.length === 1 ? "" : "s"}`)
}

async function run() {
  const path = resolve(file)
  const raw = readFileSync(path, "utf8")
  const snapshot = JSON.parse(raw) as Snapshot

  const meta = snapshot._meta as { hackathon_id?: string; source?: string } | undefined
  console.log(`Importing snapshot: ${path}`)
  console.log(`  hackathon_id: ${meta?.hackathon_id ?? "(unknown)"}`)
  console.log(`  source: ${meta?.source ?? "(unknown)"}`)
  console.log(`  target: ${supabaseUrl}`)
  console.log("")

  for (const table of INSERT_ORDER) {
    const rows = snapshot[table]
    if (!Array.isArray(rows)) continue
    await importTable(table, rows as Row[])
  }

  for (const key of Object.keys(snapshot)) {
    if (key === "_meta") continue
    if ((INSERT_ORDER as readonly string[]).includes(key)) continue
    const rows = snapshot[key]
    if (!Array.isArray(rows) || rows.length === 0) continue
    console.warn(`  ${key}: ${rows.length} row(s) not in INSERT_ORDER — skipped`)
  }

  console.log("\nDone.")
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
