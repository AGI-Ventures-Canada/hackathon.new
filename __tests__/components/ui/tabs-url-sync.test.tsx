import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TabsPendingFallback,
  TabsUrlSync,
  useOptimisticTab,
} from "@/components/ui/tabs-url-sync"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

function DisplayActive() {
  const t = useOptimisticTab()
  return <span data-testid="active-tab">{t ?? "(none)"}</span>
}

function Harness({ value }: { value: string }) {
  return (
    <TabsUrlSync paramKey="tab" value={value}>
      <DisplayActive />
      <TabsPendingFallback serverValue={value}>
        <span>Loading next section</span>
      </TabsPendingFallback>
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
        <TabsTrigger value="three">Three</TabsTrigger>
      </TabsList>
      <TabsContent value="one">Panel one</TabsContent>
      <TabsContent value="two">Panel two</TabsContent>
      <TabsContent value="three">Panel three</TabsContent>
    </TabsUrlSync>
  )
}

describe("TabsUrlSync", () => {
  beforeEach(() => {
    g.__nextNavState.pathname = "/admin/components"
    g.__nextNavState.searchParams = new URLSearchParams()
    g.__nextNavState.router.replace.mockClear()
  })

  afterEach(cleanup)

  it("falls back to the server value when the URL param is missing", () => {
    render(<Harness value="two" />)
    expect(screen.getByTestId("active-tab").textContent).toBe("two")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel two")
  })

  it("uses the URL param when present", () => {
    g.__nextNavState.searchParams = new URLSearchParams("tab=three")
    render(<Harness value="one" />)
    expect(screen.getByTestId("active-tab").textContent).toBe("three")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel three")
  })

  it("updates optimistic state and calls router.replace on tab change", async () => {
    const user = userEvent.setup()
    render(<Harness value="one" />)

    await user.click(screen.getByRole("tab", { name: "Two" }))

    expect(screen.getByTestId("active-tab").textContent).toBe("two")
    expect(g.__nextNavState.router.replace).toHaveBeenCalledTimes(1)

    const [url, opts] = g.__nextNavState.router.replace.mock.calls[0]
    expect(url).toBe("/admin/components?tab=two")
    expect(opts).toEqual({ scroll: false })
    expect(screen.getByText("Loading next section")).toBeTruthy()
  })

  it("preserves unrelated searchParams when switching tabs", async () => {
    g.__nextNavState.searchParams = new URLSearchParams("foo=bar")
    const user = userEvent.setup()
    render(<Harness value="one" />)

    await user.click(screen.getByRole("tab", { name: "Three" }))

    const [url] = g.__nextNavState.router.replace.mock.calls[0]
    const parsed = new URL(`http://x${url}`)
    expect(parsed.searchParams.get("foo")).toBe("bar")
    expect(parsed.searchParams.get("tab")).toBe("three")
  })

  it("uses the provided paramKey", async () => {
    function CustomKey() {
      return (
        <TabsUrlSync paramKey="section" value="a">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b">B</TabsTrigger>
          </TabsList>
        </TabsUrlSync>
      )
    }
    const user = userEvent.setup()
    render(<CustomKey />)

    await user.click(screen.getByRole("tab", { name: "B" }))

    const [url] = g.__nextNavState.router.replace.mock.calls[0]
    expect(url).toContain("section=b")
  })

  it("re-syncs optimistic state when the URL value changes", () => {
    g.__nextNavState.searchParams = new URLSearchParams("tab=one")
    const { rerender } = render(<Harness value="one" />)
    expect(screen.getByTestId("active-tab").textContent).toBe("one")

    act(() => {
      g.__nextNavState.searchParams = new URLSearchParams("tab=three")
    })
    rerender(<Harness value="one" />)

    expect(screen.getByTestId("active-tab").textContent).toBe("three")
  })

  it("useOptimisticTab returns null when used outside TabsUrlSync", () => {
    render(<DisplayActive />)
    expect(screen.getByTestId("active-tab").textContent).toBe("(none)")
  })
})
