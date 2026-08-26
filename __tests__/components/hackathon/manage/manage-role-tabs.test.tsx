import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

const TestTabsContext = createContext("")

function TestTabsUrlSync({
  children,
  value,
}: {
  children: ReactNode
  value: string
}) {
  return (
    <TestTabsContext.Provider value={value}>
      <div>{children}</div>
    </TestTabsContext.Provider>
  )
}

function TestTabsContent({
  children,
  value,
}: {
  children: ReactNode
  value: string
}) {
  return useContext(TestTabsContext) === value ? <div>{children}</div> : null
}

mock.module("@/components/ui/tabs-url-sync", () => ({
  TabsUrlSync: TestTabsUrlSync,
}))
mock.module("@/components/ui/tabs", () => ({
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  TabsContent: TestTabsContent,
}))

type DialogState = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = createContext<DialogState>({
  open: false,
  setOpen: () => {},
})

function TestDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (next: boolean) => {
    setInternalOpen(next)
    onOpenChange?.(next)
  }
  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

function TestDialogTrigger({ children }: { children: ReactNode }) {
  const { setOpen } = useContext(DialogContext)
  if (!isValidElement(children)) return null
  const child = children as ReactElement<{ onClick?: () => void }>
  return cloneElement(child, {
    onClick: () => {
      child.props.onClick?.()
      setOpen(true)
    },
  })
}

function TestDialogContent({ children }: { children: ReactNode }) {
  const { open } = useContext(DialogContext)
  return open ? <div role="dialog">{children}</div> : null
}

mock.module("@/components/ui/dialog", () => ({
  Dialog: TestDialog,
  DialogTrigger: TestDialogTrigger,
  DialogContent: TestDialogContent,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const registerTabAction = mock(() => {})
const unregisterTabAction = mock(() => {})
const replaceManageAnnouncements = mock(() => {})

const announcement = {
  id: "announcement-agent",
  hackathon_id: "event-1",
  title: "Agent update",
  body: "Review this draft before it goes out.",
  priority: "normal",
  audience: "everyone",
  published_at: null,
  created_at: "2026-08-26T15:00:00.000Z",
  updated_at: "2026-08-26T15:00:00.000Z",
}

let actionContext: Record<string, unknown> | null = null

mock.module("@/components/hackathon/manage/action-items-context", () => ({
  useActionItemsOptional: () => actionContext,
}))
mock.module("@/components/hackathon/manage/team-settings-dialog", () => ({
  TeamSettingsDialog: () => null,
  teamSettingsSummary: () => "Teams of 1 to 5",
}))
mock.module("@/components/hackathon/manage/team-edit-dialog", () => ({
  TeamEditDialog: () => null,
}))
mock.module("@/components/hackathon/submission-media", () => ({
  SubmissionMedia: () => null,
}))
mock.module("@/components/hackathon/submission-links", () => ({
  SubmissionLinks: () => null,
}))

const { EventTabContent } = await import(
  "@/app/(public)/e/[slug]/manage/_event-tab"
)
const { TeamsTab } = await import(
  "@/app/(public)/e/[slug]/manage/_teams-tab"
)

const originalFetch = globalThis.fetch

beforeEach(() => {
  actionContext = {
    manageWebMcpView: { announcements: [announcement] },
    replaceManageAnnouncements,
    registerTabAction,
    unregisterTabAction,
  }
  registerTabAction.mockClear()
  unregisterTabAction.mockClear()
  replaceManageAnnouncements.mockClear()
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe("organizer role tabs", () => {
  it("shows only aggregate mentor counts and never renders request text", async () => {
    const fetchMock = mock(async () =>
      Response.json({ stats: { open: 2, claimed: 1, resolved: 3 } }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(
      <EventTabContent
        hackathonId="event-1"
        activeEtab="mentors"
        hackathonStatus="active"
        hackathonPhase="build"
      />,
    )

    expect(await screen.findByText("Waiting")).toBeDefined()
    expect(screen.getByText("Being helped")).toBeDefined()
    expect(screen.getByText("Finished")).toBeDefined()
    expect(screen.getByText("2")).toBeDefined()
    expect(screen.queryByText(announcement.body)).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/hackathons/event-1/mentor-requests",
    )
  })

  it("rolls back a shared announcement when publishing fails", async () => {
    const fetchMock = mock(async () =>
      new Response(JSON.stringify({ error: "offline" }), { status: 503 }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(
      <EventTabContent
        hackathonId="event-1"
        activeEtab="announcements"
        hackathonStatus="draft"
        hackathonPhase={null}
      />,
    )

    expect(await screen.findByText("Agent update")).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Publish" }))

    expect(await screen.findByText("Failed to update publish status")).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/hackathons/event-1/announcements/announcement-agent/publish",
      { method: "POST" },
    )
    expect(replaceManageAnnouncements).toHaveBeenCalledTimes(2)
    expect(replaceManageAnnouncements.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        id: "announcement-agent",
        published_at: expect.any(String),
      }),
    ])
    expect(replaceManageAnnouncements.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({
        id: "announcement-agent",
        published_at: null,
      }),
    ])
  })

  it("reports an unconfirmed captain invite without claiming it was sent", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/rooms")) return Response.json({ rooms: [] })
      if (url.endsWith("/teams") && init?.method === "POST") {
        return Response.json({ invited: true, delivery: "failed" })
      }
      if (url.endsWith("/teams")) return Response.json({ teams: [] })
      throw new Error(`Unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(
      <TeamsTab
        hackathonId="event-1"
        maxTeamSize={5}
        minTeamSize={1}
        allowSolo
        requireTeamApproval={false}
        hackathonStatus="draft"
      />,
    )

    expect(await screen.findByText("No teams yet")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: /Create Team/ }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Team Name"), {
      target: { value: "Team Maple" },
    })
    fireEvent.change(within(dialog).getByLabelText("Captain Email"), {
      target: { value: "captain@example.com" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Team" }))

    expect(
      await screen.findByText(
        "Team created and invite saved for captain@example.com, but we couldn't confirm the email was sent. Use Send again in the invite list.",
      ),
    ).toBeDefined()
    expect(registerTabAction).toHaveBeenCalledWith(
      "review-team-settings",
      expect.any(Function),
    )
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/teams") && init?.method === "POST",
        ),
      ).toBe(true),
    )
  })
})
