import { describe, expect, mock, test } from "bun:test"

mock.module("@/lib/docs-source", () => ({ source: {} }))
mock.module("fumadocs-core/source", () => ({
  llms: () => ({
    index: async () => {
      await Promise.resolve()
      return "[Overview](/docs)\n[API](/docs/api): undefined\n[External](https://example.com/docs)"
    },
  }),
}))

const { GET } = await import("@/app/llms.txt/route")

describe("LLMs documentation index", () => {
  test("awaits generation before returning normalized documentation links", async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(
      "[Overview](/docs.mdx)\n[API](/docs/api.mdx)\n[External](https://example.com/docs)",
    )
  })
})
