import { DocsLayout } from "fumadocs-ui/layouts/docs"
import type { ReactNode } from "react"
import { source } from "@/lib/docs-source"
import { RootProvider } from "fumadocs-ui/provider/next"

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: "hackathon.new API",
        }}
        links={[
          {
            text: "Dashboard",
            url: "/home",
          },
        ]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
