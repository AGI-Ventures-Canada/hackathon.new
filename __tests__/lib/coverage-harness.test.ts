import { describe, expect, test } from "bun:test"
import {
  evaluateChangedCoverage,
  hasRuntimeCode,
  isProductionSourcePath,
  mergeLcovDocuments,
  parseChangedLineDiff,
  parseLcov,
  serializeLcov,
} from "@/scripts/coverage-harness"

describe("coverage harness", () => {
  test("merges line, function, and branch hits across isolated runs", () => {
    const first = parseLcov(`
SF:lib/example.ts
FN:2,work
FNDA:0,work
FNF:1
FNH:0
BRDA:3,0,0,-
BRF:1
BRH:0
DA:2,0
DA:3,1,checksum
LF:2
LH:1
end_of_record
`)
    const second = parseLcov(`
SF:lib/example.ts
FN:2,work
FNDA:2,work
BRDA:3,0,0,1
DA:2,2
DA:3,3,checksum
end_of_record
`)

    const merged = mergeLcovDocuments([first, second])
    expect(merged.get("lib/example.ts")?.lines).toEqual(new Map([[2, 2], [3, 4]]))
    expect(merged.get("lib/example.ts")?.functionHits.get("work")).toBe(2)
    expect(merged.get("lib/example.ts")?.branches.get("3,0,0")?.taken).toBe(1)

    const output = serializeLcov(merged)
    expect(output).toContain("FNDA:2,work")
    expect(output).toContain("BRDA:3,0,0,1")
    expect(output).toContain("DA:3,4,checksum")
    expect(output).toContain("LF:2")
    expect(output).toContain("LH:2")
  })

  test("keeps Bun's aggregate function totals when LCOV omits function identities", () => {
    const first = parseLcov("SF:lib/example.ts\nFNF:12\nFNH:4\nDA:1,1\nend_of_record\n")
    const second = parseLcov("SF:lib/example.ts\nFNF:12\nFNH:7\nDA:1,2\nend_of_record\n")
    const output = serializeLcov(mergeLcovDocuments([first, second]))

    expect(output).toContain("FNF:12")
    expect(output).toContain("FNH:7")
  })

  test("collects every added line from zero-context diff hunks", () => {
    const changed = parseChangedLineDiff(`
diff --git a/lib/one.ts b/lib/one.ts
--- a/lib/one.ts
+++ b/lib/one.ts
@@ -2,0 +3,2 @@
+one
+two
@@ -8 +10 @@
-old
+new
diff --git a/lib/deleted.ts b/lib/deleted.ts
--- a/lib/deleted.ts
+++ /dev/null
@@ -1 +0,0 @@
-gone
`)

    expect(changed.get("lib/one.ts")).toEqual(new Set([3, 4, 10]))
    expect(changed.has("lib/deleted.ts")).toBe(false)
  })

  test("fails when a changed runtime file never appears in coverage", () => {
    const coverage = parseLcov(`
SF:lib/covered.ts
DA:1,1
DA:2,0
end_of_record
`)
    const result = evaluateChangedCoverage(
      coverage,
      new Map([
        ["lib/covered.ts", new Set([1, 2])],
        ["lib/missing.ts", new Set([1])],
      ]),
      new Set(["lib/covered.ts", "lib/missing.ts"]),
    )

    expect(result).toMatchObject({
      covered: 1,
      total: 2,
      percentage: 50,
      passed: false,
      missingFiles: ["lib/missing.ts"],
    })
    expect(result.uncoveredLines.get("lib/covered.ts")).toEqual([2])
  })

  test("accepts exactly ninety percent of changed executable lines", () => {
    const coverage = parseLcov(`
SF:components/covered.tsx
${Array.from({ length: 10 }, (_, index) => `DA:${index + 1},${index === 9 ? 0 : 1}`).join("\n")}
end_of_record
`)
    const result = evaluateChangedCoverage(
      coverage,
      new Map([["components/covered.tsx", new Set(Array.from({ length: 10 }, (_, index) => index + 1))]]),
      new Set(["components/covered.tsx"]),
    )

    expect(result.percentage).toBe(90)
    expect(result.passed).toBe(true)
  })

  test("distinguishes production runtime modules from type-only and test tooling", () => {
    expect(isProductionSourcePath("app/page.tsx")).toBe(true)
    expect(isProductionSourcePath("packages/cli/src/cli.ts")).toBe(true)
    expect(isProductionSourcePath("__tests__/lib/example.test.ts")).toBe(false)
    expect(isProductionSourcePath("scripts/test-scenarios/example.ts")).toBe(false)
    expect(isProductionSourcePath("types/webmcp.d.ts")).toBe(false)

    expect(hasRuntimeCode("export type Example = string\nexport interface Shape { value: string }"))
      .toBe(false)
    expect(hasRuntimeCode("import type { Shape } from './shape'\nexport type { Shape }"))
      .toBe(false)
    expect(hasRuntimeCode("export const value = 1")).toBe(true)
    expect(hasRuntimeCode("import './setup'")).toBe(true)
  })
})
