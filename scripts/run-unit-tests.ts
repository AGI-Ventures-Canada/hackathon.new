import { Glob } from "bun"

const ENCRYPTION_MOCK_TESTS = [
  "__tests__/services/sponsor-fulfillments.test.ts",
]
const encryptionMockSet = new Set(ENCRYPTION_MOCK_TESTS)

const SERVICE_MOCK_ISOLATED_TESTS = [
  "__tests__/services/notification-dispatcher.test.ts",
  "__tests__/services/lifecycle.test.ts",
  "__tests__/services/cli-auth.test.ts",
]
const serviceMockSet = new Set(SERVICE_MOCK_ISOLATED_TESTS)

const STORAGE_MOCK_ISOLATED_TESTS = [
  "__tests__/services/storage.test.ts",
  "__tests__/services/luma-import-create.test.ts",
]
const storageMockSet = new Set(STORAGE_MOCK_ISOLATED_TESTS)

const RADIX_ISOLATED_TESTS = [
  "__tests__/components/hackathon/submission-button.test.tsx",
  "__tests__/components/hackathon/prizes-manager.test.tsx",
  "__tests__/components/ui/markdown-editor.test.tsx",
  "__tests__/components/org/org-event-tabs.test.tsx",
  "__tests__/components/dashboard/api-key-create-dialog.test.tsx",
]
const radixSet = new Set(RADIX_ISOLATED_TESTS)

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
  {
    name: "api + lib + services",
    args: ["__tests__/api", "__tests__/lib/*.test.ts", "__tests__/services"],
    exclude: new Set([...encryptionMockSet, ...serviceMockSet, ...storageMockSet]),
  },
  {
    name: "services (encryption-mock isolated)",
    args: ENCRYPTION_MOCK_TESTS,
  },
  {
    name: "services (service-mock isolated)",
    args: SERVICE_MOCK_ISOLATED_TESTS,
  },
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
      "__tests__/components/install-skill-button.test.tsx",
      "__tests__/components/homepage-hero.test.tsx",
    ],
    exclude: radixSet,
  },
  {
    name: "components (radix-isolated)",
    args: RADIX_ISOLATED_TESTS,
    preload: "./__tests__/lib/radix-mocks.ts",
  },
  {
    name: "mobile-header (isolated)",
    args: ["__tests__/components/mobile-header.test.tsx"],
  },
  {
    name: "workflows",
    args: ["__tests__/workflows"],
  },
  {
    name: "email (resolve-emails)",
    args: ["__tests__/email/resolve-emails.test.ts"],
  },
  {
    name: "email (sponsor-notifications)",
    args: ["__tests__/email/sponsor-notifications.test.ts"],
  },
]

for (const group of groups) {
  const files = group.exclude ? await resolveArgs(group.args, group.exclude) : group.args
  if (files.length === 0) continue

  const cmd = ["bun", "test"]
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
}
