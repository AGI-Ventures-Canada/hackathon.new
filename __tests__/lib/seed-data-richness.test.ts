import { describe, expect, it } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const seedsDirectory = join(root, "supabase", "seeds")
const seedFiles = readdirSync(seedsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort()
const modularSeed = seedFiles
  .map((file) => readFileSync(join(seedsDirectory, file), "utf8"))
  .join("")
const generatedSeed = readFileSync(join(root, "supabase", "seed.sql"), "utf8")
const eventSeed = readFileSync(
  join(seedsDirectory, "20_rich_lifecycle_events.sql"),
  "utf8",
)

const themes = [
  "ai-agents",
  "climate-energy",
  "health-wellness",
  "fintech-commerce",
  "education",
  "accessibility",
  "robotics",
  "space",
  "civic-community",
  "creative-media",
  "food-agriculture",
  "cybersecurity",
  "gaming-xr",
  "open-source",
]

const lifecycleStatuses = [
  "draft",
  "published",
  "registration_open",
  "active",
  "judging",
  "completed",
  "archived",
]

describe("rich lifecycle seed data", () => {
  it("keeps the generated seed in sync with every module", () => {
    expect(generatedSeed).toBe(modularSeed)
  })

  it("keeps active judging projects eligible and finished reviews historical", () => {
    const projectSeed = readFileSync(
      join(seedsDirectory, "24_rich_lifecycle_projects.sql"),
      "utf8",
    )
    const judgingSeed = readFileSync(
      join(seedsDirectory, "26_rich_lifecycle_judging.sql"),
      "utf8",
    )

    expect(projectSeed).toContain("WHEN 'judging' THEN 'submitted'::submission_status")
    expect(judgingSeed).toContain("scoring_scope,")
    expect(judgingSeed).toContain("CASE WHEN lifecycle_index >= 6 THEN 'legacy_unscoped' ELSE 'scoped' END")
  })

  it("covers every theme at every event stage", () => {
    for (const theme of themes) {
      expect(eventSeed).toContain(`'${theme}'`)
    }
    for (const status of lifecycleStatuses) {
      expect(eventSeed).toContain(`'${status}'::hackathon_status`)
    }
    expect(themes.length * lifecycleStatuses.length).toBe(98)
  })

  it("exceeds four times the prior core seed counts", () => {
    const newCounts = {
      events: 128,
      people: 3187,
      teams: 616,
      projects: 668,
      sponsors: 423,
    }
    const priorCounts = {
      events: 30,
      people: 163,
      teams: 42,
      projects: 109,
      sponsors: 31,
    }

    for (const key of Object.keys(newCounts) as Array<keyof typeof newCounts>) {
      expect(newCounts[key]).toBeGreaterThanOrEqual(priorCounts[key] * 4)
    }
  })

  it("uses synthetic identities and covers all image surfaces", () => {
    expect(modularSeed).toContain("seed_user_")
    expect(modularSeed).toContain("banner_url")
    expect(modularSeed).toContain("logo_url")
    expect(modularSeed).toContain("screenshot_url")
    expect(modularSeed).toContain("headshot_url")
    expect(modularSeed).toContain("og_image_url")
    expect(modularSeed).toContain("images.unsplash.com")
  })

  it("keeps the legacy AI art projects on unique solo owners", () => {
    const aiArtProjects = readFileSync(
      join(seedsDirectory, "16_submissions_ai_art.sql"),
      "utf8",
    )
    expect(aiArtProjects).toContain("105d105d-105d-105d-105d-105d105d105d")
    expect(
      aiArtProjects.match(/10351035-1035-1035-1035-103510351035/g),
    ).toHaveLength(1)
  })
})
