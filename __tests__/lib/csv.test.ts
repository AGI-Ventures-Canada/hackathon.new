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

  it("neutralizes formula-injection attempts by prefixing risky cells with a tab", () => {
    const csv = toCsv(
      [
        { value: "=SUM(A1:A10)" },
        { value: "+1234" },
        { value: "-bad" },
        { value: "@evil" },
        { value: "Normal" },
      ],
      [{ key: "value", header: "Value" }]
    )
    expect(csv).toBe("Value\r\n\t=SUM(A1:A10)\r\n\t+1234\r\n\t-bad\r\n\t@evil\r\nNormal\r\n")
  })

  it("quotes a formula cell that also contains a comma", () => {
    const csv = toCsv(
      [{ value: '=HYPERLINK("https://evil.com","click")' }],
      [{ key: "value", header: "Value" }]
    )
    expect(csv).toBe('Value\r\n"\t=HYPERLINK(""https://evil.com"",""click"")"\r\n')
  })
})
