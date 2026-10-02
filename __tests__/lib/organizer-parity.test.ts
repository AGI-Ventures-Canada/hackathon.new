import { DIRECT_ACTION_TOOL_NAMES } from "@/lib/webmcp/direct-action-tools"
import { createJudgingSetupTools } from "@/lib/webmcp/judging-setup-tools"
import { judgingHref } from "@/lib/judging/setup"
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
      webMcpTools: [...DIRECT_ACTION_TOOL_NAMES, "open_test_event_creator"],
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
      ...DIRECT_ACTION_TOOL_NAMES,
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

  it("registers the dedicated judging settings page and its scope and project tools", async () => {
    const config = ORGANIZER_SECTION_CONFIG.judging_settings
    expect(ORGANIZER_SECTIONS).toContain("judging_settings")
    expect(config.cliCommands).toEqual(expect.arrayContaining(["judging setup inspect", "judging setup configure", "judging scorecards list"]))
    let destination = ""
    const tools = createJudgingSetupTools({ hackathonId: "event", slug: "our-event", fetcher: async () => Response.json({}), navigate: (href) => { destination = href }, refresh: () => {} })
    for (const name of ["inspect_judging", "configure_judging", "inspect_judge_scope", "save_judge_scope", "inspect_judge_projects", "assign_judge_project", "remind_judging_panel", "open_judging_settings"]) {
      expect(config.webMcpTools).toContain(name)
      expect(tools.some((tool) => tool.name === name)).toBe(true)
    }
    expect((await tools.find((tool) => tool.name === "open_judging_settings")!.execute({ destination: "settings" })).ok).toBe(true)
    expect(destination).toBe(judgingHref("our-event", "settings"))
    expect(destination).toBe("/e/our-event/manage/judging/settings")
    expect(ORGANIZER_SECTION_CONFIG.judges.webMcpTools).toContain("remind_judging_panel")
    expect(ORGANIZER_SECTION_CONFIG.judges.cliCommands).toContain("judging invitations remind")
    for (const section of ["judging_settings", "judges", "assignments"] as const)
      expect(ORGANIZER_SECTION_CONFIG[section].cliCommands).toContain("judging judges scope")
  })
})
