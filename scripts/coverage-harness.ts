import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

export type FileCoverage = {
  source: string
  lines: Map<number, number>
  lineChecksums: Map<number, string>
  functionDefinitions: Set<string>
  functionHits: Map<string, number>
  functionsFound: number
  functionsHit: number
  branches: Map<string, { line: number; block: string; branch: string; taken: number | null }>
  branchesFound: number
  branchesHit: number
}

export type CoverageDocument = Map<string, FileCoverage>

export type ChangedCoverageResult = {
  covered: number
  total: number
  percentage: number
  passed: boolean
  missingFiles: string[]
  uncoveredLines: Map<string, number[]>
}

const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/
const DECLARATION_FILE_PATTERN = /\.d\.(?:[cm]?[jt]s)$/

function toRepoPath(source: string, cwd: string): string {
  let resolvedSource = source
  if (resolvedSource.startsWith("file://")) {
    resolvedSource = fileURLToPath(resolvedSource)
  }

  const absoluteSource = isAbsolute(resolvedSource)
    ? resolvedSource
    : resolve(cwd, resolvedSource)
  const repoRelative = relative(cwd, absoluteSource).replaceAll("\\", "/")
  return repoRelative.startsWith("../") ? absoluteSource.replaceAll("\\", "/") : repoRelative
}

function emptyFileCoverage(source: string): FileCoverage {
  return {
    source,
    lines: new Map(),
    lineChecksums: new Map(),
    functionDefinitions: new Set(),
    functionHits: new Map(),
    functionsFound: 0,
    functionsHit: 0,
    branches: new Map(),
    branchesFound: 0,
    branchesHit: 0,
  }
}

function addHits(target: Map<number, number>, key: number, hits: number): void {
  target.set(key, (target.get(key) ?? 0) + hits)
}

function addNamedHits(target: Map<string, number>, key: string, hits: number): void {
  target.set(key, (target.get(key) ?? 0) + hits)
}

function mergeFileCoverage(target: FileCoverage, source: FileCoverage): void {
  for (const [line, hits] of source.lines) addHits(target.lines, line, hits)
  for (const [line, checksum] of source.lineChecksums) {
    if (!target.lineChecksums.has(line)) target.lineChecksums.set(line, checksum)
  }
  for (const definition of source.functionDefinitions) target.functionDefinitions.add(definition)
  for (const [name, hits] of source.functionHits) addNamedHits(target.functionHits, name, hits)
  target.functionsFound = Math.max(target.functionsFound, source.functionsFound)
  target.functionsHit = Math.max(target.functionsHit, source.functionsHit)
  for (const [key, branch] of source.branches) {
    const current = target.branches.get(key)
    if (!current) {
      target.branches.set(key, { ...branch })
      continue
    }
    if (branch.taken !== null) current.taken = (current.taken ?? 0) + branch.taken
  }
  target.branchesFound = Math.max(target.branchesFound, source.branchesFound)
  target.branchesHit = Math.max(target.branchesHit, source.branchesHit)
}

export function parseLcov(input: string, cwd = process.cwd()): CoverageDocument {
  const document: CoverageDocument = new Map()
  let current: FileCoverage | undefined

  for (const rawLine of input.split(/\r?\n/)) {
    if (rawLine.startsWith("SF:")) {
      const source = toRepoPath(rawLine.slice(3), cwd)
      current = emptyFileCoverage(source)
      continue
    }
    if (!current) continue

    if (rawLine.startsWith("DA:")) {
      const [lineValue, hitsValue, checksum] = rawLine.slice(3).split(",")
      const line = Number(lineValue)
      const hits = Number(hitsValue)
      if (Number.isInteger(line) && line > 0 && Number.isFinite(hits) && hits >= 0) {
        addHits(current.lines, line, hits)
        if (checksum) current.lineChecksums.set(line, checksum)
      }
      continue
    }

    if (rawLine.startsWith("FN:")) {
      current.functionDefinitions.add(rawLine.slice(3))
      continue
    }

    if (rawLine.startsWith("FNDA:")) {
      const value = rawLine.slice(5)
      const separator = value.indexOf(",")
      if (separator > 0) {
        const hits = Number(value.slice(0, separator))
        const name = value.slice(separator + 1)
        if (Number.isFinite(hits) && hits >= 0) addNamedHits(current.functionHits, name, hits)
      }
      continue
    }

    if (rawLine.startsWith("FNF:")) {
      const total = Number(rawLine.slice(4))
      if (Number.isInteger(total) && total >= 0) current.functionsFound = total
      continue
    }

    if (rawLine.startsWith("FNH:")) {
      const hit = Number(rawLine.slice(4))
      if (Number.isInteger(hit) && hit >= 0) current.functionsHit = hit
      continue
    }

    if (rawLine.startsWith("BRDA:")) {
      const [lineValue, block, branch, takenValue] = rawLine.slice(5).split(",")
      const line = Number(lineValue)
      if (Number.isInteger(line) && line > 0 && block !== undefined && branch !== undefined) {
        const taken = takenValue === "-" ? null : Number(takenValue)
        if (taken === null || (Number.isFinite(taken) && taken >= 0)) {
          const key = `${line},${block},${branch}`
          const existing = current.branches.get(key)
          if (!existing) {
            current.branches.set(key, { line, block, branch, taken })
          } else if (taken !== null) {
            existing.taken = (existing.taken ?? 0) + taken
          }
        }
      }
      continue
    }

    if (rawLine.startsWith("BRF:")) {
      const total = Number(rawLine.slice(4))
      if (Number.isInteger(total) && total >= 0) current.branchesFound = total
      continue
    }

    if (rawLine.startsWith("BRH:")) {
      const hit = Number(rawLine.slice(4))
      if (Number.isInteger(hit) && hit >= 0) current.branchesHit = hit
      continue
    }

    if (rawLine === "end_of_record") {
      const existing = document.get(current.source)
      if (existing) mergeFileCoverage(existing, current)
      else document.set(current.source, current)
      current = undefined
    }
  }

  if (current) {
    const existing = document.get(current.source)
    if (existing) mergeFileCoverage(existing, current)
    else document.set(current.source, current)
  }

  return document
}

export function mergeLcovDocuments(documents: CoverageDocument[]): CoverageDocument {
  const merged: CoverageDocument = new Map()
  for (const document of documents) {
    for (const [source, coverage] of document) {
      const existing = merged.get(source)
      if (existing) mergeFileCoverage(existing, coverage)
      else {
        const copy = emptyFileCoverage(source)
        mergeFileCoverage(copy, coverage)
        merged.set(source, copy)
      }
    }
  }
  return merged
}

function functionName(definition: string): string {
  const parts = definition.split(",")
  return parts.at(-1) ?? definition
}

export function serializeLcov(document: CoverageDocument): string {
  const output: string[] = ["TN:"]
  const files = [...document.values()].sort((left, right) => left.source.localeCompare(right.source))

  for (const file of files) {
    output.push(`SF:${file.source}`)

    const definitions = [...file.functionDefinitions].sort((left, right) => left.localeCompare(right))
    for (const definition of definitions) output.push(`FN:${definition}`)
    const functionHits = [...file.functionHits].sort(([left], [right]) => left.localeCompare(right))
    for (const [name, hits] of functionHits) output.push(`FNDA:${hits},${name}`)
    const functionsFound = Math.max(file.functionsFound, definitions.length)
    const functionsHit = Math.max(
      file.functionsHit,
      definitions.filter((definition) => (file.functionHits.get(functionName(definition)) ?? 0) > 0).length,
    )
    output.push(`FNF:${functionsFound}`)
    output.push(
      `FNH:${Math.min(functionsFound, functionsHit)}`,
    )

    const branches = [...file.branches.values()].sort(
      (left, right) =>
        left.line - right.line ||
        left.block.localeCompare(right.block) ||
        left.branch.localeCompare(right.branch),
    )
    for (const branch of branches) {
      output.push(
        `BRDA:${branch.line},${branch.block},${branch.branch},${branch.taken === null ? "-" : branch.taken}`,
      )
    }
    const branchesFound = Math.max(file.branchesFound, branches.length)
    const branchesHit = Math.max(
      file.branchesHit,
      branches.filter((branch) => (branch.taken ?? 0) > 0).length,
    )
    if (branchesFound > 0) {
      output.push(`BRF:${branchesFound}`)
      output.push(`BRH:${Math.min(branchesFound, branchesHit)}`)
    }

    const lines = [...file.lines].sort(([left], [right]) => left - right)
    for (const [line, hits] of lines) {
      const checksum = file.lineChecksums.get(line)
      output.push(`DA:${line},${hits}${checksum ? `,${checksum}` : ""}`)
    }
    output.push(`LF:${lines.length}`)
    output.push(`LH:${lines.filter(([, hits]) => hits > 0).length}`)
    output.push("end_of_record")
  }

  return `${output.join("\n")}\n`
}

function stripDiffPrefix(path: string): string | undefined {
  if (path === "/dev/null") return undefined
  const unquoted = path.startsWith('"') && path.endsWith('"')
    ? path.slice(1, -1)
    : path
  return (unquoted.startsWith("b/") ? unquoted.slice(2) : unquoted).replaceAll("\\", "/")
}

export function parseChangedLineDiff(diff: string): Map<string, Set<number>> {
  const changed = new Map<string, Set<number>>()
  let currentPath: string | undefined

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      currentPath = stripDiffPrefix(line.slice(4))
      if (currentPath && !changed.has(currentPath)) changed.set(currentPath, new Set())
      continue
    }
    if (!currentPath || !line.startsWith("@@ ")) continue

    const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!match) continue
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    const lines = changed.get(currentPath) ?? new Set<number>()
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset)
    changed.set(currentPath, lines)
  }

  return changed
}

export function isProductionSourcePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/")
  if (!SOURCE_FILE_PATTERN.test(normalized) || DECLARATION_FILE_PATTERN.test(normalized)) return false
  if (/^(?:app|components|emails|hooks|lib)\//.test(normalized)) return true
  if (/^packages\/[^/]+\/src\//.test(normalized)) return true
  if (/^supabase\/functions\//.test(normalized)) return true
  return /^(?:instrumentation|proxy)\.(?:[cm]?[jt]sx?)$/.test(normalized)
}

function hasDeclareModifier(statement: ts.Statement): boolean {
  return Boolean(
    ts.getModifiers(statement as ts.HasModifiers)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword,
    ),
  )
}

function importHasRuntimeCode(statement: ts.ImportDeclaration): boolean {
  if (!statement.importClause) return true
  if (statement.importClause.isTypeOnly) return false
  if (statement.importClause.name) return true
  const bindings = statement.importClause.namedBindings
  if (!bindings || ts.isNamespaceImport(bindings)) return true
  return bindings.elements.some((element) => !element.isTypeOnly)
}

function exportHasRuntimeCode(statement: ts.ExportDeclaration): boolean {
  if (statement.isTypeOnly) return false
  if (!statement.exportClause) return true
  if (ts.isNamespaceExport(statement.exportClause)) return true
  return statement.exportClause.elements.some((element) => !element.isTypeOnly)
}

export function hasRuntimeCode(source: string, path = "source.ts"): boolean {
  const scriptKind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    false,
    scriptKind,
  )

  return sourceFile.statements.some((statement) => {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return false
    if (ts.isImportDeclaration(statement)) return importHasRuntimeCode(statement)
    if (ts.isExportDeclaration(statement)) return exportHasRuntimeCode(statement)
    if (ts.isEmptyStatement(statement)) return false
    if (hasDeclareModifier(statement)) return false
    return true
  })
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const process = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (exitCode !== 0) throw new Error(stderr.trim() || `git ${args.join(" ")} failed`)
  return stdout
}

function linesForNewFile(source: string): Set<number> {
  const lineCount = source.length === 0
    ? 0
    : source.split(/\r?\n/).length - (source.endsWith("\n") ? 1 : 0)
  return new Set(Array.from({ length: lineCount }, (_, index) => index + 1))
}

export async function collectChangedCoverageInput(
  cwd: string,
  base = "origin/staging",
): Promise<{ changedLines: Map<string, Set<number>>; runtimeFiles: Set<string> }> {
  const [diff, trackedNames, untrackedNames] = await Promise.all([
    runGit(cwd, ["-c", "core.quotePath=false", "diff", "--unified=0", "--no-color", "--diff-filter=ACMR", base, "--"]),
    runGit(cwd, ["diff", "--name-only", "-z", "--diff-filter=ACMR", base, "--"]),
    runGit(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ])

  const changedLines = parseChangedLineDiff(diff)
  const tracked = trackedNames.split("\0").filter(Boolean)
  const untracked = untrackedNames.split("\0").filter(Boolean)
  const changedFiles = new Set([...tracked, ...untracked])

  for (const path of changedFiles) {
    if (!changedLines.has(path)) changedLines.set(path, new Set())
  }

  for (const path of untracked) {
    const source = await readFile(resolve(cwd, path), "utf8")
    changedLines.set(path, linesForNewFile(source))
  }

  const runtimeFiles = new Set<string>()
  for (const path of changedFiles) {
    if (!isProductionSourcePath(path)) continue
    const source = await readFile(resolve(cwd, path), "utf8")
    if (hasRuntimeCode(source, path)) runtimeFiles.add(path)
  }

  return { changedLines, runtimeFiles }
}

export function evaluateChangedCoverage(
  coverage: CoverageDocument,
  changedLines: Map<string, Set<number>>,
  runtimeFiles: Set<string>,
  threshold = 90,
): ChangedCoverageResult {
  const missingFiles = [...runtimeFiles].filter((path) => !coverage.has(path)).sort()
  const uncoveredLines = new Map<string, number[]>()
  let covered = 0
  let total = 0

  for (const path of [...runtimeFiles].sort()) {
    const file = coverage.get(path)
    if (!file) continue
    const changed = changedLines.get(path) ?? new Set<number>()
    const uncovered: number[] = []

    for (const [line, hits] of file.lines) {
      if (!changed.has(line)) continue
      total += 1
      if (hits > 0) covered += 1
      else uncovered.push(line)
    }

    if (uncovered.length > 0) uncoveredLines.set(path, uncovered.sort((left, right) => left - right))
  }

  const percentage = total === 0 ? 100 : (covered / total) * 100
  return {
    covered,
    total,
    percentage,
    passed: missingFiles.length === 0 && percentage >= threshold,
    missingFiles,
    uncoveredLines,
  }
}
