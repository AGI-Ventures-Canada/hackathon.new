import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import {
  resetComponentMocks,
  setRouter,
  setPathname,
  setSearchParams,
} from "../../lib/component-mocks"

const storage = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() { return storage.size },
  key: () => null,
} as Storage

import { clerkState, clerkMock } from "../../lib/clerk-mock"

mock.module("@clerk/nextjs", () => clerkMock)

const mockPush = mock(() => {})
const mockClipboardWriteText = mock(() => Promise.resolve())

mock.module("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} width={width as number} height={height as number} {...rest} />
  },
}))

mock.module("@/components/hackathon/preview/hackathon-preview-client", () => ({
  HackathonPreviewClient: (props: { onBannerChange?: (imageUrl: string | null) => void }) => (
    <div data-testid="preview">
      <button type="button" onClick={() => props.onBannerChange?.(null)}>
        Clear Banner
      </button>
    </div>
  ),
}))

mock.module("@/components/sign-in-required-dialog", () => ({
  SignInRequiredDialog: (props: { open: boolean }) =>
    props.open ? <div data-testid="sign-in-dialog">Sign In Required</div> : null,
}))

mock.module("@/components/create-organization-dialog", () => ({
  CreateOrganizationDialog: (props: { open: boolean; onSuccess?: () => void }) => {
    return props.open ? (
      <div data-testid="create-org-dialog">
        <button type="button" data-testid="simulate-org-created" onClick={() => props.onSuccess?.()}>
          Simulate Org Created
        </button>
      </div>
    ) : null
  },
}))

const { HackathonDraftEditor, loadSavedState } = await import(
  "@/components/hackathon/hackathon-draft-editor"
)

const defaultState = {
  name: "Test Hackathon",
  description: null,
  startsAt: null,
  endsAt: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  locationType: null as "in_person" | "virtual" | "hybrid" | null,
  locationName: null,
  locationUrl: null,
  imageUrl: null,
  sponsors: [],
  rules: null,
  prizes: [],
}

beforeEach(() => {
  resetComponentMocks()
  clerkState.isSignedIn = true
  clerkState.organization = { id: "org_1", name: "Test Org" }
  clerkState.memberships = []
  clerkState.setActive.mockClear()
  mockPush.mockClear()
  mockClipboardWriteText.mockClear()
  storage.clear()
  setRouter({ push: mockPush })
  setPathname("/luma.com/test")
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText: mockClipboardWriteText },
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
})

describe("HackathonDraftEditor", () => {
  const mockOnSubmit = mock(() => Promise.resolve({ slug: "test-hackathon" }))

  beforeEach(() => {
    mockOnSubmit.mockClear()
  })

  function renderEditor(overrides?: Partial<Parameters<typeof HackathonDraftEditor>[0]>) {
    return render(
      <HackathonDraftEditor
        initialState={defaultState}
        storageKey="test-draft"
        onSubmit={mockOnSubmit}
        {...overrides}
      />
    )
  }

  it("renders the create hackathon button", () => {
    renderEditor()
    expect(screen.getByText("Create Event")).toBeDefined()
  })

  it("submits when org is active", async () => {
    renderEditor()
    fireEvent.click(screen.getByText("Create Event"))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith("/e/test-hackathon/manage")
    })
  })

  describe("org gate", () => {
    beforeEach(() => {
      clerkState.organization = null
      clerkState.memberships = [
        { organization: { id: "org_1", name: "Alpha Org", imageUrl: null } },
        { organization: { id: "org_2", name: "Beta Org", imageUrl: "https://example.com/beta.png" } },
      ]
    })

    it("shows connect organization button when signed in without org", () => {
      renderEditor()
      expect(screen.getByText("Connect Organization")).toBeDefined()
    })

    it("shows org gate dialog when clicking connect organization", async () => {
      renderEditor()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => {
        expect(screen.getByText("Pick an organization")).toBeDefined()
      })
    })

    it("lists existing organizations", async () => {
      renderEditor()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => {
        expect(screen.getByText("Alpha Org")).toBeDefined()
        expect(screen.getByText("Beta Org")).toBeDefined()
      })
    })

    it("auto-submits after selecting an organization", async () => {
      clerkState.setActive.mockImplementation(async () => {
        clerkState.organization = { id: "org_1", name: "Alpha Org" }
      })
      renderEditor()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => screen.getByText("Alpha Org"))
      fireEvent.click(screen.getByText("Alpha Org"))

      await waitFor(() => {
        expect(clerkState.setActive).toHaveBeenCalledWith({ organization: "org_1" })
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it("auto-submits after creating a new organization", async () => {
      renderEditor()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => screen.getByText("Create a new organization"))
      fireEvent.click(screen.getByText("Create a new organization"))

      await waitFor(() => screen.getByTestId("simulate-org-created"))
      clerkState.organization = { id: "org_new", name: "New Org" }
      fireEvent.click(screen.getByTestId("simulate-org-created"))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it("does not submit when org gate is dismissed", async () => {
      renderEditor()
      fireEvent.click(screen.getByText("Connect Organization"))

      await waitFor(() => screen.getByText("Pick an organization"))

      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it("auto-opens org gate when returning from sign-in with edit param", async () => {
      setSearchParams(new URLSearchParams("edit=true"))
      renderEditor()

      await waitFor(() => {
        expect(screen.getByText("Pick an organization")).toBeDefined()
      })
    })
  })

  describe("sign in gate", () => {
    beforeEach(() => {
      clerkState.isSignedIn = false
    })

    it("shows sign in dialog when not signed in", async () => {
      renderEditor()
      fireEvent.click(screen.getByText("Create Event"))

      await waitFor(() => {
        expect(screen.getByTestId("sign-in-dialog")).toBeDefined()
      })
    })
  })

  it("shows error when name is empty", async () => {
    renderEditor({ initialState: { ...defaultState, name: "" } })

    const button = screen.getByText("Create Event")
    expect(button.hasAttribute("disabled")).toBe(true)
  })

  it("submits the cleared banner state after removing an imported image", async () => {
    renderEditor({
      initialState: {
        ...defaultState,
        imageUrl: "https://example.com/banner.png",
      },
    })

    fireEvent.click(screen.getByText("Clear Banner"))
    fireEvent.click(screen.getByText("Create Event"))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: null,
        })
      )
    })
  })

  describe("sourceUrl-based localStorage invalidation", () => {
    const STORAGE_KEY = "test-draft"

    it("discards stale localStorage when sourceUrl changes", () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "Event A" },
          sourceUrl: "https://luma.com/event-a",
          savedAt: Date.now(),
        })
      )

      renderEditor({
        storageKey: STORAGE_KEY,
        sourceUrl: "https://luma.com/event-b",
        initialState: { ...defaultState, name: "Event B" },
      })

      expect(screen.getByText("Create Event")).toBeDefined()
      expect(storage.get(STORAGE_KEY)).toBeDefined()
      const stored = JSON.parse(storage.get(STORAGE_KEY)!)
      expect(stored.state.name).toBe("Event B")
      expect(stored.sourceUrl).toBe("https://luma.com/event-b")
    })

    it("restores localStorage when sourceUrl matches", () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "Event A Edited" },
          sourceUrl: "https://luma.com/event-a",
          savedAt: Date.now(),
        })
      )

      renderEditor({
        storageKey: STORAGE_KEY,
        sourceUrl: "https://luma.com/event-a",
        initialState: { ...defaultState, name: "Event A" },
      })

      const stored = JSON.parse(storage.get(STORAGE_KEY)!)
      expect(stored.state.name).toBe("Event A Edited")
    })

    it("restores localStorage when no sourceUrl is provided (create-from-scratch)", () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "My Draft" },
          savedAt: Date.now(),
        })
      )

      renderEditor({
        storageKey: STORAGE_KEY,
        initialState: { ...defaultState, name: "Default" },
      })

      const stored = JSON.parse(storage.get(STORAGE_KEY)!)
      expect(stored.state.name).toBe("My Draft")
    })
  })

  describe("loadSavedState migration", () => {
    const STORAGE_KEY = "test-migration"

    it("adds challenges: [] to state missing the field", () => {
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "Legacy Event" },
          savedAt: Date.now(),
        })
      )

      const result = loadSavedState(STORAGE_KEY)
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Legacy Event")
      expect(result!.challenges).toEqual([])
    })

    it("preserves existing challenges field", () => {
      const challenges = [{ title: "Build an AI", description: null }]
      storage.set(
        STORAGE_KEY,
        JSON.stringify({
          state: { ...defaultState, name: "New Event", challenges },
          savedAt: Date.now(),
        })
      )

      const result = loadSavedState(STORAGE_KEY)
      expect(result).not.toBeNull()
      expect(result!.challenges).toEqual(challenges)
    })
  })

  it("shows a truncated source URL and copies the full URL", async () => {
    renderEditor({
      sourceUrl: "https://www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158?aff=ebdssbdestsearch",
    })

    expect(
      screen.getByText("www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158?aff=ebdssbdestsearch")
    ).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Copy source URL" }))

    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith(
        "https://www.eventbrite.com/e/devops-for-genai-hackathon-ottawa-2026-tickets-1984872192158?aff=ebdssbdestsearch"
      )
      expect(screen.getByRole("button", { name: "Source URL copied" })).toBeDefined()
    })
  })
})
