import { describe, expect, it } from "bun:test"
import {
  CREATE_EVENT_SURFACE_PARITY,
  ORGANIZER_SECTION_CONFIG,
  ORGANIZER_SECTIONS,
} from "@/lib/webmcp/organizer-parity"
import {
  VALID_ETABS,
  VALID_JTABS,
  VALID_MTABS,
  VALID_PTABS,
  VALID_TABS,
} from "@/lib/utils/manage-tabs"

const topLevelSections: Record<(typeof VALID_TABS)[number], string> = {
  "action-items": "action_items",
  overview: "overview",
  challenges: "challenges",
  perks: "perks",
  edit: "event_page",
  teams: "teams",
  people: "people",
  judging: "judging",
  "post-event": "post_event",
  event: "communications",
  miscs: "miscs",
}

const nestedSections = {
  ...Object.fromEntries(VALID_ETABS.map((tab) => [tab, tab])),
  ...Object.fromEntries(VALID_MTABS.map((tab) => [tab, tab])),
  ...Object.fromEntries(VALID_JTABS.map((tab) => [tab, tab === "setup" ? "judging_setup" : tab])),
  ...Object.fromEntries(VALID_PTABS.map((tab) => [tab, tab])),
}

describe("organizer parity registry", () => {
  it("records app, WebMCP, and CLI support for rich test events", () => {
    expect(CREATE_EVENT_SURFACE_PARITY).toEqual({
      ui: "Create a test event with test data",
      webMcpTools: ["open_test_event_creator"],
      cliCommands: ["events create --test-stage"],
    })
  })

  it("covers every organizer tab and nested page", () => {
    expect(Object.keys(topLevelSections).sort()).toEqual([...VALID_TABS].sort())
    for (const section of Object.values(topLevelSections)) {
      expect(ORGANIZER_SECTIONS).toContain(section)
    }
    for (const section of Object.values(nestedSections)) {
      expect(ORGANIZER_SECTIONS).toContain(section)
    }
  })

  it("records useful WebMCP support and explicitly records CLI gaps", () => {
    expect(Object.keys(ORGANIZER_SECTION_CONFIG).sort()).toEqual(
      [...ORGANIZER_SECTIONS].sort(),
    )
    for (const section of ORGANIZER_SECTIONS) {
      const config = ORGANIZER_SECTION_CONFIG[section]
      expect(config.title.length).toBeGreaterThan(0)
      expect(config.summary.length).toBeGreaterThan(0)
      expect(config.params).toContain("tab=")
      expect(config.webMcpTools.length).toBeGreaterThan(0)
      expect(Array.isArray(config.cliCommands)).toBe(true)
    }
  })

  it("keeps every shared organizer task action in WebMCP and the CLI", () => {
    expect(ORGANIZER_SECTION_CONFIG.action_items.webMcpTools).toEqual([
      "list_organizer_tasks",
      "open_organizer_task",
      "add_organizer_task",
      "complete_organizer_task",
      "reopen_organizer_task",
      "dismiss_organizer_task",
      "remove_organizer_task",
    ])
    expect(ORGANIZER_SECTION_CONFIG.action_items.cliCommands).toEqual([
      "events tasks list",
      "events tasks add",
      "events tasks complete",
      "events tasks reopen",
      "events tasks dismiss",
      "events tasks remove",
    ])
  })
})
