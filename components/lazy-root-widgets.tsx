"use client"

import dynamic from "next/dynamic"

const SearchCommand = dynamic(
  () => import("@/components/search-command").then((m) => m.SearchCommand),
  { ssr: false },
)
const GlobalWebMcpTools = dynamic(
  () => import("@/components/global-webmcp-tools").then((m) => m.GlobalWebMcpTools),
  { ssr: false },
)
const DirectWebMcpTools = dynamic(
  () => import("@/components/direct-webmcp-tools").then((m) => m.DirectWebMcpTools),
  { ssr: false },
)

export function LazyRootWidgets() {
  return (
    <>
      <GlobalWebMcpTools />
      <DirectWebMcpTools />
      <SearchCommand />
    </>
  )
}
