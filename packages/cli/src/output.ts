import pc from "picocolors"

const noColor = !!process.env.NO_COLOR

function color<T extends string>(fn: (s: T) => string, s: T): string {
  return noColor ? s : fn(s)
}

function terminalText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001B[@-_]/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
}

interface Column<T> {
  key: keyof T
  label: string
  width?: number
}

export function formatTable<T extends object>(
  rows: T[],
  columns: Column<T>[]
): string {
  if (rows.length === 0) {
    return ""
  }

  const widths = columns.map((col) => {
    const headerWidth = terminalText(col.label).length
    const maxDataWidth = rows.reduce((max, row) => {
      const val = terminalText(row[col.key])
      return Math.max(max, val.length)
    }, 0)
    return col.width ?? Math.min(Math.max(headerWidth, maxDataWidth), 50)
  })

  const header = columns.map((col, i) => terminalText(col.label).padEnd(widths[i])).join("  ")
  const separator = widths.map((w) => "─".repeat(w)).join("──")

  const dataRows = rows.map((row) =>
    columns
      .map((col, i) => {
        const val = terminalText(row[col.key])
        return val.length > widths[i] ? val.slice(0, widths[i] - 1) + "…" : val.padEnd(widths[i])
      })
      .join("  ")
  )

  return [color(pc.bold, header), separator, ...dataRows].join("\n")
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

export function formatDetail(fields: Array<{ label: string; value: string | undefined }>): string {
  const maxLabel = fields.reduce((max, f) => Math.max(max, terminalText(f.label).length), 0)
  return fields
    .map((f) => `${color(pc.bold, terminalText(f.label).padEnd(maxLabel))}  ${f.value === undefined ? color(pc.dim, "—") : terminalText(f.value)}`)
    .join("\n")
}

export function formatError(error: { message: string; hint?: string }): string {
  const lines = [color(pc.red, `Error: ${terminalText(error.message)}`)]
  if (error.hint) {
    lines.push(color(pc.dim, `Hint: ${terminalText(error.hint)}`))
  }
  return lines.join("\n")
}

export function formatSuccess(message: string): string {
  return color(pc.green, `✓ ${terminalText(message)}`)
}

export function formatWarning(message: string): string {
  return color(pc.yellow, `⚠ ${terminalText(message)}`)
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}
