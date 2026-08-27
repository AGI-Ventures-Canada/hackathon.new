import { source } from "@/lib/docs-source"
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page"
import { notFound } from "next/navigation"
import defaultMdxComponents from "fumadocs-ui/mdx"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import { LLMCopyButton, ViewOptions } from "@/components/page-actions"

interface PageProps {
  params: Promise<{ slug?: string[] }>
}

export default async function Page(props: PageProps) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  const { body: MDX, toc } = await page.data.load()

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pt-2 pb-6">
        <LLMCopyButton markdownUrl={`${page.url}.mdx`} />
        <ViewOptions
          markdownUrl={`${page.url}.mdx`}
          githubUrl={`https://github.com/AGI-Ventures-Canada/hackathon.new/blob/staging/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={{
            ...defaultMdxComponents,
            Tab,
            Tabs,
          }}
        />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: PageProps) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  return {
    title: page.data.title,
    description: page.data.description,
  }
}
