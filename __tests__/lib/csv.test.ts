import { describe, it, expect } from "bun:test"
import { toCsv } from "@/lib/utils/csv"

describe("toCsv", () => {
  it("emits header-only output when there are no rows", () => {
    const csv = toCsv([], [
      { key: "name", header: "Name" },
      { key: "email", header: "Email" },
    ])
    expect(csv).toBe("Name,Email\r\n")
  })

  it("writes basic rows with no escaping needed", () => {
    const csv = toCsv(
      [
        { name: "Ada", email: "ada@example.com" },
        { name: "Grace", email: "grace@example.com" },
      ],
      [
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
      ]
    )
    expect(csv).toBe("Name,Email\r\nAda,ada@example.com\r\nGrace,grace@example.com\r\n")
  })

  it("escapes commas, quotes, and newlines", () => {
    const csv = toCsv(
      [
        { value: "hello, world" },
        { value: 'she said "hi"' },
        { value: "line1\nline2" },
        { value: "carriage\rreturn" },
      ],
      [{ key: "value", header: "Value" }]
    )
    expect(csv).toBe(
      'Value\r\n"hello, world"\r\n"she said ""hi"""\r\n"line1\nline2"\r\n"carriage\rreturn"\r\n'
    )
  })

  it("renders null and undefined as empty strings", () => {
    const csv = toCsv(
      [{ a: null, b: undefined }],
      [
        { key: "a", header: "A" },
        { key: "b", header: "B" },
      ]
    )
    expect(csv).toBe("A,B\r\n,\r\n")
  })

  it("renders booleans and numbers as their string form", () => {
    const csv = toCsv(
      [{ flag: true, count: 42 }],
      [
        { key: "flag", header: "Flag" },
        { key: "count", header: "Count" },
      ]
    )
    expect(csv).toBe("Flag,Count\r\ntrue,42\r\n")
  })
})
