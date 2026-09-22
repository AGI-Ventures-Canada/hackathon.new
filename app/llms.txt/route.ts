import { source } from "@/lib/docs-source"
import { llms } from "fumadocs-core/source"

export const revalidate = false

export async function GET() {
  let content = await llms(source).index()

  content = content.replace(/\(\/docs(\/[^)]*)?\)/g, "(/docs$1.mdx)")
  content = content.replace(/: undefined/g, "")

  return new Response(content)
}
