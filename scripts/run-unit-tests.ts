import { Glob } from "bun"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  collectChangedCoverageInput,
  evaluateChangedCoverage,
  mergeLcovDocuments,
  parseLcov,
  serializeLcov,
  type CoverageDocument,
} from "./coverage-harness"

const ENCRYPTION_MOCK_TESTS = [
  "__tests__/services/sponsor-fulfillments.test.ts",
]
const encryptionMockSet = new Set(ENCRYPTION_MOCK_TESTS)

const SERVICE_MOCK_PROCESS_ISOLATED_TESTS = [
  "__tests__/services/attendee-lifecycle-notifications.test.ts",
  "__tests__/services/challenges.test.ts",
  "__tests__/services/event-mutation-lease.test.ts",
  "__tests__/services/judge-invitations.test.ts",
  "__tests__/services/organization-members.test.ts",
  "__tests__/services/smart-reminders.test.ts",
  "__tests__/services/team-management.test.ts",
  "__tests__/services/test-event-sandbox.test.ts",
]

const SERVICE_MOCK_ISOLATED_TESTS = [
  "__tests__/services/notification-dispatcher.test.ts",
  "__tests__/services/lifecycle.test.ts",
  "__tests__/services/cli-auth.test.ts",
  "__tests__/services/team-invitations.test.ts",
  "__tests__/services/team-create.test.ts",
  "__tests__/services/team-invitations-organizer.test.ts",
  "__tests__/services/public-hackathons.test.ts",
  "__tests__/services/post-event-reminders.test.ts",
  "__tests__/services/smart-reminders-delivery.test.ts",
  "__tests__/services/results.test.ts",
  ...SERVICE_MOCK_PROCESS_ISOLATED_TESTS,
]
const serviceMockSet = new Set(SERVICE_MOCK_ISOLATED_TESTS)

const SERVICE_MOCK_PUBLIC_HACKATHONS_TESTS = [
  "__tests__/services/public-hackathons.test.ts",
]

// lifecycle.test.ts mocks @/lib/services/notification-dispatcher, which
// pollutes the actual dispatcher module when run in the same process as
// notification-dispatcher.test.ts. Run them in separate Bun invocations.
const SERVICE_MOCK_DISPATCHER_TESTS = [
  "__tests__/services/notification-dispatcher.test.ts",
]
const SERVICE_MOCK_OTHER_TESTS = [
  "__tests__/services/lifecycle.test.ts",
  "__tests__/services/cli-auth.test.ts",
  "__tests__/services/team-invitations.test.ts",
]

const SERVICE_MOCK_TEAM_CREATE_TESTS = [
  "__tests__/services/team-create.test.ts",
]

const SERVICE_MOCK_TEAM_INVITATIONS_ORGANIZER_TESTS = [
  "__tests__/services/team-invitations-organizer.test.ts",
]

const SERVICE_MOCK_POST_EVENT_REMINDERS_TESTS = [
  "__tests__/services/post-event-reminders.test.ts",
]

const SERVICE_MOCK_SMART_REMINDERS_DELIVERY_TESTS = [
  "__tests__/services/smart-reminders-delivery.test.ts",
]

const SERVICE_MOCK_RESULTS_TESTS = [
  "__tests__/services/results.test.ts",
]

const CRON_REMINDERS_ISOLATED_TESTS = [
  "__tests__/api/cron-reminders-delivery.test.ts",
]
const cronRemindersSet = new Set(CRON_REMINDERS_ISOLATED_TESTS)

const STORAGE_MOCK_ISOLATED_TESTS = [
  "__tests__/services/storage.test.ts",
  "__tests__/services/luma-import-create.test.ts",
]
const storageMockSet = new Set(STORAGE_MOCK_ISOLATED_TESTS)

const EXPORT_SUBMISSIONS_ISOLATED_TESTS = [
  "__tests__/workflows/export-submissions-steps.test.ts",
  "__tests__/workflows/export-submissions-download-image.test.ts",
]
const exportSubmissionsSet = new Set(EXPORT_SUBMISSIONS_ISOLATED_TESTS)

const WORKFLOW_DELIVERY_ISOLATED_TESTS = [
  "__tests__/workflows/creation-finalization-start.test.ts",
  "__tests__/workflows/transition-delivery-steps.test.ts",
]
const workflowDeliverySet = new Set(WORKFLOW_DELIVERY_ISOLATED_TESTS)

const EMAIL_DELIVERY_ISOLATED_TESTS = [
  "__tests__/email/winner-delivery.test.ts",
  "__tests__/email/winner-notifications.test.ts",
  "__tests__/integration/judge-added-email.email.test.ts",
  "__tests__/integration/judge-invitation-reminder-email.email.test.ts",
  "__tests__/integration/submission-confirmation-email.email.test.ts",
  "__tests__/integration/team-denied-email.email.test.ts",
  "__tests__/integration/team-invitation-email.email.test.ts",
  "__tests__/integration/team-invitation-reminder-email.email.test.ts",
]

const TAVILY_MOCK_ISOLATED_TESTS = [
  "__tests__/services/luma-extract.test.ts",
]
const tavilyMockSet = new Set(TAVILY_MOCK_ISOLATED_TESTS)

const RADIX_ISOLATED_TESTS = [
  "__tests__/components/hackathon/prizes-manager.test.tsx",
  "__tests__/components/hackathon/manage/challenge-editor-dialog.test.tsx",
  "__tests__/components/ui/markdown-editor.test.tsx",
  "__tests__/components/ui/tabs-url-sync.test.tsx",
  "__tests__/components/org/org-event-tabs.test.tsx",
  "__tests__/components/dashboard/api-key-create-dialog.test.tsx",
  "__tests__/components/hackathon/judging/judges-section.test.tsx",
  "__tests__/components/hackathon/judging/assignments-section.test.tsx",
]
const radixSet = new Set(RADIX_ISOLATED_TESTS)

const COMPONENT_PROCESS_ISOLATED_TESTS = [
  "__tests__/components/global-webmcp-tools.test.tsx",
  "__tests__/components/hackathon/submission-button.test.tsx",
  "__tests__/components/hackathon/team-invite-dialog.test.tsx",
  "__tests__/components/hackathon/judging/judging-setup-dialog.test.tsx",
  "__tests__/components/hackathon/judging/webmcp-preparation-panels.test.tsx",
  "__tests__/components/hackathon/mentors/mentor-webmcp-workspace.test.tsx",
  "__tests__/components/hackathon/manage/action-items-panel.test.tsx",
  "__tests__/components/hackathon/manage/nested-tabs-accessibility.test.tsx",
  "__tests__/components/org/profile-form.test.tsx",
]
const componentProcessIsolatedSet = new Set(COMPONENT_PROCESS_ISOLATED_TESTS)

const CREATE_ORG_DIALOG_ISOLATED_TESTS = [
  "__tests__/components/org/create-organization-dialog.test.tsx",
]
const createOrgDialogSet = new Set(CREATE_ORG_DIALOG_ISOLATED_TESTS)

const AUTH_CREATE_FLOW_ISOLATED_TESTS = [
  "__tests__/components/auth/create-org-form.test.tsx",
  "__tests__/components/auth/sso-callback.test.tsx",
  "__tests__/components/sign-in-required-dialog.test.tsx",
  "__tests__/components/hackathon/resume-create-client.test.tsx",
  "__tests__/components/auth/create-resume-pages.test.tsx",
  "__tests__/components/auth/root-layout.test.tsx",
  "__tests__/components/hackathon/event-import-editor-ui.test.tsx",
  "__tests__/hooks/use-hackathon-draft.test.tsx",
]
const authCreateFlowSet = new Set(AUTH_CREATE_FLOW_ISOLATED_TESTS)

const MANAGE_WEBMCP_ISOLATED_TESTS = [
  "__tests__/components/hackathon/manage/manage-webmcp-tools.test.tsx",
  "__tests__/components/hackathon/manage/action-items-webmcp-state.test.tsx",
  "__tests__/components/hackathon/preview/preview-webmcp-state.test.tsx",
  "__tests__/components/hackathon/manage/manage-role-tabs.test.tsx",
  "__tests__/components/hackathon/manage/manage-page-boundary.test.tsx",
  "__tests__/components/hackathon/manage/test-event-banner.test.tsx",
  "__tests__/components/ai-elements/reasoning.test.tsx",
]
const manageWebMcpSet = new Set(MANAGE_WEBMCP_ISOLATED_TESTS)

const PUBLIC_ROLE_PAGE_ISOLATED_TESTS = [
  "__tests__/components/hackathon/public-role-page-boundaries.test.tsx",
  "__tests__/components/hackathon/judging/judge-page-boundary.test.tsx",
]
const publicRolePageSet = new Set(PUBLIC_ROLE_PAGE_ISOLATED_TESTS)

const REGISTRATION_BUTTON_ISOLATED_TESTS = [
  "__tests__/components/hackathon/registration-button.test.tsx",
]
const registrationButtonSet = new Set(REGISTRATION_BUTTON_ISOLATED_TESTS)
const SAFE_FETCH_DISPATCHER_ISOLATED_TESTS = [
  "__tests__/lib/safe-fetch-dispatcher.test.ts",
]
const safeFetchDispatcherSet = new Set(SAFE_FETCH_DISPATCHER_ISOLATED_TESTS)
const EVENT_WEBMCP_ISOLATED_TESTS = [
  "__tests__/components/hackathon/event-webmcp-tools.test.tsx",
]
const eventWebMcpSet = new Set(EVENT_WEBMCP_ISOLATED_TESTS)
const coverageEnabled = process.argv.includes("--coverage")
const repositoryRoot = join(import.meta.dir, "..")
const coverageRoot = join(repositoryRoot, "coverage")
const coverageGroupsRoot = join(coverageRoot, "unit-groups")
const coverageDocuments: CoverageDocument[] = []

async function resolveArgs(patterns: string[], exclude?: Set<string>): Promise<string[]> {
  const files: string[] = []
  for (const pattern of patterns) {
    if (pattern.includes("*") || (!pattern.endsWith(".tsx") && !pattern.endsWith(".ts"))) {
      const glob = new Glob(pattern.endsWith(".tsx") || pattern.endsWith(".ts") ? pattern : `${pattern}/**/*.test.{ts,tsx}`)
      for await (const file of glob.scan({ cwd: import.meta.dir + "/.." })) {
        if (!exclude || !exclude.has(file)) files.push(file)
      }
    } else {
      if (!exclude || !exclude.has(pattern)) files.push(pattern)
    }
  }
  return files
}

type Group = {
  name: string
  args: string[]
  exclude?: Set<string>
  preload?: string
}

const groups: Group[] = [
  ...AUTH_CREATE_FLOW_ISOLATED_TESTS.map((testPath, index) => ({
    name: `components (auth-create-flow isolated ${index + 1})`,
    args: [testPath],
    preload: "./__tests__/lib/radix-mocks.ts",
  })),
  ...MANAGE_WEBMCP_ISOLATED_TESTS.map((testPath, index) => ({
    name: `components (manage-webmcp isolated ${index + 1})`,
    args: [testPath],
    preload: "./__tests__/lib/radix-mocks.ts",
  })),
  ...PUBLIC_ROLE_PAGE_ISOLATED_TESTS.map((testPath, index) => ({
    name: `components (public-role-page isolated ${index + 1})`,
    args: [testPath],
  })),
  {
    name: "api + lib + services",
    args: ["__tests__/api", "__tests__/lib/*.test.ts", "__tests__/services"],
    exclude: new Set([
      ...encryptionMockSet,
      ...serviceMockSet,
      ...storageMockSet,
      ...tavilyMockSet,
      ...safeFetchDispatcherSet,
      ...cronRemindersSet,
    ]),
  },
  {
    name: "api (cron-reminders isolated)",
    args: CRON_REMINDERS_ISOLATED_TESTS,
  },
  {
    name: "lib (safe-fetch dispatcher isolated)",
    args: SAFE_FETCH_DISPATCHER_ISOLATED_TESTS,
  },
  {
    name: "services (tavily-mock isolated: luma-extract)",
    args: TAVILY_MOCK_ISOLATED_TESTS,
  },
  {
    name: "services (encryption-mock isolated)",
    args: ENCRYPTION_MOCK_TESTS,
  },
  {
    name: "services (service-mock isolated: dispatcher)",
    args: SERVICE_MOCK_DISPATCHER_TESTS,
  },
  {
    name: "services (service-mock isolated: other)",
    args: SERVICE_MOCK_OTHER_TESTS,
  },
  {
    name: "services (service-mock isolated: team-create)",
    args: SERVICE_MOCK_TEAM_CREATE_TESTS,
  },
  {
    name: "services (service-mock isolated: team-invitations-organizer)",
    args: SERVICE_MOCK_TEAM_INVITATIONS_ORGANIZER_TESTS,
  },
  {
    name: "services (service-mock isolated: public-hackathons)",
    args: SERVICE_MOCK_PUBLIC_HACKATHONS_TESTS,
  },
  {
    name: "services (service-mock isolated: post-event-reminders)",
    args: SERVICE_MOCK_POST_EVENT_REMINDERS_TESTS,
  },
  {
    name: "services (service-mock isolated: smart-reminders delivery)",
    args: SERVICE_MOCK_SMART_REMINDERS_DELIVERY_TESTS,
  },
  {
    name: "services (service-mock isolated: results)",
    args: SERVICE_MOCK_RESULTS_TESTS,
  },
  ...SERVICE_MOCK_PROCESS_ISOLATED_TESTS.map((testPath, index) => ({
    name: `services (service-mock process-isolated ${index + 1})`,
    args: [testPath],
  })),
  {
    name: "services (storage-mock isolated: storage)",
    args: ["__tests__/services/storage.test.ts"],
  },
  {
    name: "services (storage-mock isolated: luma-import-create)",
    args: ["__tests__/services/luma-import-create.test.ts"],
  },
  {
    name: "components",
    args: [
      "__tests__/components/hackathon",
      "__tests__/components/dashboard",
      "__tests__/components/ui",
      "__tests__/components/org",
      "__tests__/components/dev-tool",
      "__tests__/components/auth/dev-switch-client.test.tsx",
      "__tests__/components/auth/sign-in-form.test.tsx",
      "__tests__/components/auth/sign-up-form.test.tsx",
      "__tests__/components/cli-auth-org-gate.test.tsx",
      "__tests__/components/install-skill-button.test.tsx",
    ],
    exclude: new Set([
      ...radixSet,
      ...componentProcessIsolatedSet,
      ...createOrgDialogSet,
      ...authCreateFlowSet,
      ...registrationButtonSet,
      ...manageWebMcpSet,
      ...publicRolePageSet,
      ...eventWebMcpSet,
    ]),
  },
  {
    name: "components (event-webmcp isolated)",
    args: EVENT_WEBMCP_ISOLATED_TESTS,
    preload: "./__tests__/lib/radix-mocks.ts",
  },
  {
    name: "components (radix-isolated)",
    args: RADIX_ISOLATED_TESTS,
    preload: "./__tests__/lib/radix-mocks.ts",
  },
  ...COMPONENT_PROCESS_ISOLATED_TESTS.map((testPath, index) => ({
    name: `components (process-isolated ${index + 1})`,
    args: [testPath],
    preload: "./__tests__/lib/radix-mocks.ts",
  })),
  {
    name: "components (create-org-dialog isolated)",
    args: CREATE_ORG_DIALOG_ISOLATED_TESTS,
    preload: "./__tests__/lib/radix-mocks.ts",
  },
  {
    name: "components (registration-button-isolated)",
    args: REGISTRATION_BUTTON_ISOLATED_TESTS,
  },
  {
    name: "mobile-header (isolated)",
    args: ["__tests__/components/mobile-header.test.tsx"],
  },
  {
    name: "workflows (export-submissions isolated)",
    args: EXPORT_SUBMISSIONS_ISOLATED_TESTS,
  },
  {
    name: "workflows",
    args: ["__tests__/workflows"],
    exclude: new Set([...exportSubmissionsSet, ...workflowDeliverySet]),
  },
  ...WORKFLOW_DELIVERY_ISOLATED_TESTS.map((testPath, index) => ({
    name: `workflows (delivery isolated ${index + 1})`,
    args: [testPath],
  })),
  {
    name: "email (lifecycle-delivery)",
    args: ["__tests__/email/lifecycle-delivery.test.ts"],
  },
  {
    name: "email (organizer-notifications)",
    args: ["__tests__/email/organizer-notifications.test.ts"],
  },
  {
    name: "email (post-event-reminder-content)",
    args: ["__tests__/email/post-event-reminders-content.test.ts"],
  },
  {
    name: "email (prize-shipped)",
    args: ["__tests__/email/prize-shipped.test.ts"],
  },
  {
    name: "email (submission-exports)",
    args: ["__tests__/email/submission-exports.test.ts"],
  },
  {
    name: "email (resolve-emails)",
    args: ["__tests__/email/resolve-emails.test.ts"],
  },
  {
    name: "email (sponsor-notifications)",
    args: ["__tests__/email/sponsor-notifications.test.ts"],
  },
  {
    name: "email (results-announcement)",
    args: ["__tests__/email/results-announcement.test.ts"],
  },
  {
    name: "email (participant-emails-bulk)",
    args: ["__tests__/email/participant-emails-bulk.test.ts"],
  },
  {
    name: "email (Clerk forwarding)",
    args: ["__tests__/email/clerk-emails.test.ts"],
  },
  {
    name: "email (Resend wrapper)",
    args: ["__tests__/email/resend-wrapper.test.ts"],
  },
  ...EMAIL_DELIVERY_ISOLATED_TESTS.map((testPath, index) => ({
    name: `email (delivery isolated ${index + 1})`,
    args: [testPath],
  })),
]

if (coverageEnabled) {
  const integrationTests = [
    ...new Glob("__tests__/integration/*.integration.test.ts").scanSync({
      cwd: repositoryRoot,
    }),
  ].sort()

  for (const [index, file] of integrationTests.entries()) {
    groups.push({
      name: `integration ${String(index + 1).padStart(2, "0")}`,
      args: [file],
    })
  }

  groups.push(
    {
      name: "email integration",
      args: [
        "__tests__/lib/email-templates.test.ts",
      ],
    },
    {
      name: "cli",
      args: ["packages/cli/__tests__"],
    },
  )
}

if (coverageEnabled) {
  await rm(coverageRoot, { recursive: true, force: true })
  await mkdir(coverageGroupsRoot, { recursive: true })
}

for (const [index, group] of groups.entries()) {
  const files = group.exclude ? await resolveArgs(group.args, group.exclude) : group.args
  if (files.length === 0) continue

  const groupCoverageDirectory = join(
    coverageGroupsRoot,
    `${String(index + 1).padStart(2, "0")}-${group.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  )
  const cmd = coverageEnabled
    ? [
        "bun",
        `--config=${join(import.meta.dir, "bunfig.coverage-child.toml")}`,
        "test",
        "--coverage",
        "--coverage-reporter=lcov",
        `--coverage-dir=${groupCoverageDirectory}`,
      ]
    : ["bun", "test"]
  if (group.preload) cmd.push("--preload", group.preload)
  cmd.push(...files)

  const proc = Bun.spawn(cmd, {
    stdio: ["inherit", "inherit", "inherit"],
    cwd: import.meta.dir + "/..",
  })
  const code = await proc.exited
  if (code !== 0) {
    console.error(`\nFailed: ${group.name}`)
    process.exit(code)
  }

  if (coverageEnabled) {
    const lcovPath = join(groupCoverageDirectory, "lcov.info")
    let lcov: string
    try {
      lcov = await readFile(lcovPath, "utf8")
    } catch {
      console.error(`\nCoverage output missing for: ${group.name}`)
      process.exit(1)
    }
    coverageDocuments.push(parseLcov(lcov, repositoryRoot))
  }
}

if (coverageEnabled) {
  const merged = mergeLcovDocuments(coverageDocuments)
  await writeFile(join(coverageRoot, "lcov.info"), serializeLcov(merged))

  const base = process.env.COVERAGE_BASE_REF || "origin/staging"
  const { changedLines, runtimeFiles } = await collectChangedCoverageInput(repositoryRoot, base)
  const result = evaluateChangedCoverage(merged, changedLines, runtimeFiles, 90)

  console.log(
    `\nChanged executable line coverage (${base}): ${result.covered}/${result.total} (${result.percentage.toFixed(2)}%)`,
  )

  if (result.missingFiles.length > 0) {
    console.error("\nChanged runtime files absent from coverage:")
    for (const path of result.missingFiles) console.error(`  ${path}`)
  }

  if (result.uncoveredLines.size > 0) {
    console.error("\nUncovered changed executable lines:")
    for (const [path, lines] of result.uncoveredLines) {
      console.error(`  ${path}: ${lines.join(", ")}`)
    }
  }

  if (!result.passed) process.exit(1)
}
