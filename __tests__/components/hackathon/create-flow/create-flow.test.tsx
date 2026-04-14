import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { resetComponentMocks, setRouter, setClerkIsSignedIn, setClerkOrganization } from "../../../lib/component-mocks"

mock.module("@/components/sign-in-required-dialog", () => ({
  SignInRequiredDialog: ({ open, description }: { open: boolean; description: string }) =>
    open ? <div data-testid="sign-in-dialog">{description}</div> : null,
}))

mock.module("@/components/org-gate-dialog", () => ({
  OrgGateDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="org-gate-dialog">Organization Required</div> : null,
}))

mock.module("@/components/ui/address-autocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, placeholder, id }: {
    value: string
    onChange: (val: string) => void
    placeholder?: string
    id?: string
  }) => (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

mock.module("@/components/ui/markdown-editor", () => ({
  MarkdownEditor: ({ value, onChange, placeholder }: {
    value: string
    onChange: (val: string) => void
    placeholder?: string
  }) => (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

mock.module("@/components/ui/date-time-range-picker", () => ({
  DateTimeRangePicker: () => <div data-testid="date-range-picker" />,
}))

const storageMap = new Map<string, string>()
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => storageMap.set(key, value),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
      get length() { return storageMap.size },
      key: (index: number) => [...storageMap.keys()][index] ?? null,
    },
    writable: true,
  })
}

const { CreateFlow } = await import("@/components/hackathon/create-flow/create-flow")

const mockPush = mock(() => {})
const mockOnSubmit = mock(() => Promise.resolve({ id: "h_1", slug: "test-hackathon" }))
const mockOnPatchSettings = mock(() => Promise.resolve())

beforeEach(() => {
  resetComponentMocks()
  mockPush.mockClear()
  mockOnSubmit.mockClear()
  mockOnPatchSettings.mockClear()
  setRouter({ push: mockPush })
  setClerkIsSignedIn(true)
  setClerkOrganization({ id: "org_1", name: "Test Org" })
  storageMap.clear()
  localStorage.removeItem("oatmeal:create-from-scratch")
})

afterEach(() => {
  cleanup()
  storageMap.clear()
  localStorage.removeItem("oatmeal:create-from-scratch")
})

function renderFlow() {
  return render(
    <CreateFlow onSubmit={mockOnSubmit} onPatchSettings={mockOnPatchSettings} />
  )
}

async function goToNameStep() {
  fireEvent.click(screen.getByText("Start from scratch"))
  await waitFor(() => {
    expect(screen.getByPlaceholderText("My Awesome Hackathon")).toBeDefined()
  })
}

describe("CreateFlow", () => {
  describe("import step", () => {
    it("renders import chooser initially", () => {
      renderFlow()
      expect(screen.getByText("Create a hackathon")).toBeDefined()
      expect(screen.getByText("Start from scratch")).toBeDefined()
      expect(screen.getByText("Import from URL")).toBeDefined()
    })

    it("does not show progress bar or action bar on step 0", () => {
      renderFlow()
      expect(screen.queryByRole("progressbar")).toBeNull()
      expect(screen.queryByText("Continue")).toBeNull()
    })

    it("advances to name step when Start from scratch is clicked", async () => {
      renderFlow()
      await goToNameStep()
      expect(screen.getByText("What's your hackathon called?")).toBeDefined()
    })

    it("shows URL input when Import from URL is clicked", async () => {
      renderFlow()
      fireEvent.click(screen.getByText("Import from URL"))
      await waitFor(() => {
        expect(screen.getByText("Paste the event URL")).toBeDefined()
      })
    })
  })

  describe("step navigation", () => {
    it("shows 1 / 4 step counter on name step", async () => {
      renderFlow()
      await goToNameStep()
      expect(screen.getByText("1 / 4")).toBeDefined()
    })

    it("advances to step 2 when Continue is clicked with a name", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Continue"))

      await waitFor(() => {
        expect(screen.getByText("When does it happen?")).toBeDefined()
        expect(screen.getByText("2 / 4")).toBeDefined()
      })
    })

    it("shows error when trying to advance without a name", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.click(screen.getByText("Continue"))
      expect(screen.getByText("Give your hackathon a name first")).toBeDefined()
    })

    it("clears error when typing a name", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.click(screen.getByText("Continue"))
      expect(screen.getByText("Give your hackathon a name first")).toBeDefined()

      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "X" },
      })
      expect(screen.queryByText("Give your hackathon a name first")).toBeNull()
    })

    it("navigates back with the Back button", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Continue"))

      await waitFor(() => screen.getByText("2 / 4"))

      fireEvent.click(screen.getByText("Back"))

      await waitFor(() => {
        expect(screen.getByText("1 / 4")).toBeDefined()
      })
    })

    it("shows Create Event button on last step", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })

      fireEvent.click(screen.getByText("Continue"))
      await waitFor(() => screen.getByText("2 / 4"))
      fireEvent.click(screen.getByText("Continue"))
      await waitFor(() => screen.getByText("3 / 4"))
      fireEvent.click(screen.getByText("Continue"))
      await waitFor(() => screen.getByText("4 / 4"))

      expect(screen.getByText("Create Event")).toBeDefined()
    })
  })

  describe("skip functionality", () => {
    it("hides Skip when name is empty", async () => {
      renderFlow()
      await goToNameStep()
      expect(screen.queryByText("Skip to event page")).toBeNull()
    })

    it("shows Skip when name is non-empty", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      expect(screen.getByText("Skip to event page")).toBeDefined()
    })
  })

  describe("submission", () => {
    it("calls onSubmit with state when submitting", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to event page"))

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
        const arg = mockOnSubmit.mock.calls[0][0]
        expect(arg.name).toBe("My Hackathon")
      })
    })

    it("shows sign-in dialog when not signed in", async () => {
      setClerkIsSignedIn(false)
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to event page"))

      await waitFor(() => {
        expect(screen.getByTestId("sign-in-dialog")).toBeDefined()
      })
    })

    it("shows org gate dialog when signed in but no org", async () => {
      setClerkOrganization(null)
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "My Hackathon" },
      })
      fireEvent.click(screen.getByText("Skip to event page"))

      await waitFor(() => {
        expect(screen.getByTestId("org-gate-dialog")).toBeDefined()
      })
    })
  })

  describe("localStorage", () => {
    it("saves state to localStorage on change", async () => {
      renderFlow()
      await goToNameStep()
      fireEvent.change(screen.getByPlaceholderText("My Awesome Hackathon"), {
        target: { value: "Saved Hackathon" },
      })

      const stored = localStorage.getItem("oatmeal:create-from-scratch")
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.state.name).toBe("Saved Hackathon")
    })

    it("restores state from localStorage on mount", async () => {
      localStorage.setItem(
        "oatmeal:create-from-scratch",
        JSON.stringify({
          state: {
            name: "Restored Hackathon",
            description: null,
            startsAt: null,
            endsAt: null,
            locationType: null,
            locationName: null,
            locationUrl: null,
            imageUrl: null,
            sponsors: [],
            rules: null,
            prizes: [],
          },
          savedAt: Date.now(),
        })
      )

      renderFlow()
      await goToNameStep()
      const input = screen.getByPlaceholderText("My Awesome Hackathon") as HTMLInputElement
      expect(input.value).toBe("Restored Hackathon")
    })
  })
})
