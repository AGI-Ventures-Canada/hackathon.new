import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { formatTable, formatJson, formatDetail, formatError, formatSuccess } from "../src/output"

describe("formatTable", () => {
  it("renders headers and aligned columns", () => {
    const rows = [
      { name: "Hack 1", status: "active" },
      { name: "Hack 2", status: "draft" },
    ]
    const result = formatTable(rows, [
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
    ])
    expect(result).toContain("Name")
    expect(result).toContain("Status")
    expect(result).toContain("Hack 1")
    expect(result).toContain("active")
  })

  it("handles empty data array", () => {
    const result = formatTable([], [{ key: "name", label: "Name" }])
    expect(result).toBe("")
  })

  it("truncates long values", () => {
    const rows = [{ name: "A".repeat(100) }]
    const result = formatTable(rows, [
      { key: "name", label: "Name", width: 10 },
    ])
    expect(result).toContain("…")
  })

  it("handles undefined/null values", () => {
    const rows = [{ name: "Test", desc: undefined }]
    const result = formatTable(rows as Array<Record<string, unknown>>, [
      { key: "name", label: "Name" },
      { key: "desc", label: "Description" },
    ])
    expect(result).toContain("Test")
  })

  it("strips terminal controls from remote values", () => {
    const result = formatTable([{ name: "Safe\u001b[2J\rSpoof" }], [
      { key: "name", label: "Name" },
    ])
    expect(result).not.toContain("\u001b")
    expect(result).not.toContain("\r")
    expect(result).toContain("Safe Spoof")
  })
})

describe("formatJson", () => {
  it("outputs valid JSON", () => {
    const data = { id: "123", name: "Test" }
    const result = formatJson(data)
    expect(JSON.parse(result)).toEqual(data)
  })

  it("pretty-prints with 2-space indent", () => {
    const result = formatJson({ a: 1 })
    expect(result).toContain("  ")
    expect(result).toContain("\n")
  })
})

describe("formatDetail", () => {
  it("renders key-value pairs", () => {
    const result = formatDetail([
      { label: "Name", value: "Test" },
      { label: "Status", value: "active" },
    ])
    expect(result).toContain("Name")
    expect(result).toContain("Test")
    expect(result).toContain("Status")
    expect(result).toContain("active")
  })

  it("renders dash for undefined values", () => {
    const result = formatDetail([{ label: "Desc", value: undefined }])
    expect(result).toContain("—")
  })
})

describe("formatError", () => {
  let originalNoColor: string | undefined
  beforeEach(() => {
    originalNoColor = process.env.NO_COLOR
    process.env.NO_COLOR = "1"
  })
  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR
    } else {
      process.env.NO_COLOR = originalNoColor
    }
  })

  it("includes error message", () => {
    const result = formatError({ message: "Something broke" })
    expect(result).toContain("Something broke")
  })

  it("includes hint when available", () => {
    const result = formatError({ message: "Error", hint: "Try again" })
    expect(result).toContain("Try again")
  })

  it("does not let remote text inject terminal commands", () => {
    const result = `${formatError({ message: "Nope\u001b]0;owned\u0007" })}\n${formatSuccess("Done\nFake prompt")}`
    expect(result).not.toContain("\u001b")
    expect(result).not.toContain("\u0007")
    expect(result).toContain("Done Fake prompt")
  })
})
