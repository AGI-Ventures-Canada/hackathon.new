export type CsvColumn<T> = {
  key: keyof T & string
  header: string
}

export type CsvCell = string | number | boolean | null | undefined

function escapeField(value: CsvCell): string {
  if (value === null || value === undefined) return ""
  const str = typeof value === "string" ? value : String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv<T extends Record<string, CsvCell>>(
  rows: T[],
  columns: CsvColumn<T>[]
): string {
  const header = columns.map((c) => escapeField(c.header)).join(",")
  const lines = rows.map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(",")
  )
  return [header, ...lines].join("\r\n") + "\r\n"
}
