import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

mock.module("@/components/ui/tabs-url-sync", () => ({
  TabsUrlSync: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
mock.module("@/components/ui/tabs", () => ({
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
mock.module("@/app/(public)/e/[slug]/manage/_rooms-tab", () => ({
  RoomsTab: () => null,
}))
mock.module("@/app/(public)/e/[slug]/manage/_activity-tab", () => ({
  ActivityTab: () => null,
}))
mock.module("@/app/(public)/e/[slug]/manage/_terms-tab", () => ({
  TermsTab: () => null,
}))

const { MiscsTabContent } = await import(
  "@/app/(public)/e/[slug]/manage/_miscs-tab"
)
const { PostEventSubTabs } = await import(
  "@/app/(public)/e/[slug]/manage/_post-event-sub-tabs"
)

afterEach(cleanup)

describe("mobile nested tabs", () => {
  it("names every miscellaneous tab", () => {
    render(
      <MiscsTabContent
        hackathonId="event-1"
        activeMtab="rooms"
        requireTermsAcceptance={false}
        termsContent={null}
      />,
    )

    expect(screen.getByRole("button", { name: "Rooms" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Activity" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Terms and conditions" })).toBeDefined()
  })

  it("names every post-event tab", () => {
    render(
      <PostEventSubTabs activePtab="fulfillment" showExports>
        <span>Prizes content</span>
        <span>Feedback content</span>
        <span>Exports content</span>
      </PostEventSubTabs>,
    )

    expect(screen.getByRole("button", { name: "Prizes" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Feedback" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Exports" })).toBeDefined()
  })
})
