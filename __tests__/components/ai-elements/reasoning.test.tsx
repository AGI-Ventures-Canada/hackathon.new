import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

let streamdownProps: Record<string, unknown> = {}

mock.module("streamdown", () => ({
  Streamdown: (props: { children?: ReactNode }) => {
    streamdownProps = props
    return <div data-testid="streamdown">{props.children}</div>
  },
}))

mock.module("@/components/ui/collapsible", () => ({
  Collapsible: ({ children, ...props }: { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CollapsibleContent: ({ children, ...props }: { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CollapsibleTrigger: ({ children, ...props }: { children?: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

const { ReasoningContent } = await import("@/components/ai-elements/reasoning")

afterEach(() => {
  cleanup()
  streamdownProps = {}
})

describe("ReasoningContent", () => {
  it("keeps collapsible behavior props on the wrapper instead of leaking them to markdown", () => {
    const onClick = mock(() => {})

    render(
      <ReasoningContent
        aria-label="Reasoning details"
        data-purpose="reasoning-panel"
        onClick={onClick}
      >
        ## Checked the event
      </ReasoningContent>,
    )

    const content = screen.getByLabelText("Reasoning details")
    expect(content.getAttribute("data-purpose")).toBe("reasoning-panel")
    fireEvent.click(content)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("streamdown").textContent).toContain(
      "Checked the event",
    )
    expect(streamdownProps).toEqual({ children: "## Checked the event" })
  })
})
