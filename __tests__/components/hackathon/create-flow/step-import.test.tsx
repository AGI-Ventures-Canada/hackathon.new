import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../../lib/component-mocks"

const { StepImport } = await import(
  "@/components/hackathon/create-flow/step-import"
)

const mockPush = mock(() => {})

beforeEach(() => {
  resetComponentMocks()
  mockPush.mockClear()
  setRouter({ push: mockPush })
})

afterEach(() => {
  cleanup()
})

describe("StepImport", () => {
  const defaultProps = {
    onSkipToScratch: mock(() => {}),
    onModeChange: mock(() => {}),
  }

  describe("choose mode", () => {
    it("renders all three creation choices with exact labels", () => {
      render(<StepImport {...defaultProps} />)
      expect(screen.getByText("Create from scratch")).toBeDefined()
      expect(screen.getByText("Import from a URL")).toBeDefined()
      expect(screen.getByText("Create a test event with test data")).toBeDefined()
    })

    it("calls onSkipToScratch when Create from scratch is clicked", () => {
      const onSkipToScratch = mock(() => {})
      render(<StepImport {...defaultProps} onSkipToScratch={onSkipToScratch} />)
      fireEvent.click(screen.getByText("Create from scratch"))
      expect(onSkipToScratch).toHaveBeenCalled()
    })

    it("switches to import mode when Import from a URL is clicked", async () => {
      render(<StepImport {...defaultProps} />)
      fireEvent.click(screen.getByText("Import from a URL"))
      await waitFor(() => {
        expect(screen.getByText("Paste the event URL")).toBeDefined()
      })
    })

    it("calls onModeChange when switching to import mode", () => {
      const onModeChange = mock(() => {})
      render(<StepImport {...defaultProps} onModeChange={onModeChange} />)
      fireEvent.click(screen.getByText("Import from a URL"))
      expect(onModeChange).toHaveBeenCalledWith("import")
    })

    it("opens the test event setup and creates the default registration stage", () => {
      const onCreateTestEvent = mock(() => {})
      const onModeChange = mock(() => {})
      render(
        <StepImport
          {...defaultProps}
          onModeChange={onModeChange}
          onCreateTestEvent={onCreateTestEvent}
        />,
      )

      fireEvent.click(screen.getByText("Create a test event with test data"))
      expect(onModeChange).toHaveBeenCalledWith("test")
      expect(screen.getByText("Try a full test event")).toBeDefined()
      expect(screen.getByText("Registration is open")).toBeDefined()
      fireEvent.click(screen.getByRole("button", { name: "Create test event" }))
      expect(onCreateTestEvent).toHaveBeenCalledWith("registration")
    })

    it("uses the requested test stage when opened from a link", () => {
      const onCreateTestEvent = mock(() => {})
      render(
        <StepImport
          {...defaultProps}
          initialMode="test"
          initialTestStage="judging"
          onCreateTestEvent={onCreateTestEvent}
        />,
      )

      expect(screen.getByText("Judging is underway")).toBeDefined()
      fireEvent.click(screen.getByRole("button", { name: "Create test event" }))
      expect(onCreateTestEvent).toHaveBeenCalledWith("judging")
    })
  })

  describe("import mode", () => {
    function goToImportMode() {
      fireEvent.click(screen.getByText("Import from a URL"))
    }

    it("shows URL input with placeholder", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      await waitFor(() => {
        const input = screen.getByLabelText("Event page URL")
        expect(input.getAttribute("maxlength")).toBe("2048")
        expect(input.getAttribute("placeholder")).toBe("luma.com/your-event")
      })
    })

    it("shows error for invalid URL", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      await waitFor(() => screen.getByPlaceholderText("luma.com/your-event"))

      fireEvent.change(screen.getByPlaceholderText("luma.com/your-event"), {
        target: { value: "not a url" },
      })
      fireEvent.keyDown(screen.getByPlaceholderText("luma.com/your-event"), {
        key: "Enter",
      })

      expect(screen.getByText("That doesn't look like a URL. Paste an event page link.")).toBeDefined()
    })

    it("clears error when typing", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      await waitFor(() => screen.getByPlaceholderText("luma.com/your-event"))

      fireEvent.change(screen.getByPlaceholderText("luma.com/your-event"), {
        target: { value: "not a url" },
      })
      fireEvent.keyDown(screen.getByPlaceholderText("luma.com/your-event"), {
        key: "Enter",
      })
      expect(screen.getByText("That doesn't look like a URL. Paste an event page link.")).toBeDefined()

      fireEvent.change(screen.getByPlaceholderText("luma.com/your-event"), {
        target: { value: "luma.com/event" },
      })
      expect(screen.queryByText("That doesn't look like a URL. Paste an event page link.")).toBeNull()
    })

    it("navigates to /import on valid URL submit", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      await waitFor(() => screen.getByPlaceholderText("luma.com/your-event"))

      fireEvent.change(screen.getByPlaceholderText("luma.com/your-event"), {
        target: { value: "luma.com/my-event" },
      })
      fireEvent.keyDown(screen.getByPlaceholderText("luma.com/your-event"), {
        key: "Enter",
      })

      expect(mockPush).toHaveBeenCalled()
      const pushArg = mockPush.mock.calls[0][0] as string
      expect(pushArg).toContain("/import?url=")
    })

    it("freezes the URL and ignores repeated Enter presses while navigating", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      const input = await screen.findByLabelText("Event page URL")

      fireEvent.change(input, { target: { value: "luma.com/my-event" } })
      fireEvent.keyDown(input, { key: "Enter" })

      expect((input as HTMLInputElement).disabled).toBe(true)
      fireEvent.keyDown(input, { key: "Enter" })
      expect(mockPush).toHaveBeenCalledTimes(1)
    })

    it("accepts a URL whose normalized value is exactly 2,048 characters", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      const input = await screen.findByPlaceholderText("luma.com/your-event")
      const prefix = "events.example/"
      const url = `${prefix}${"a".repeat(2_048 - "https://".length - prefix.length)}`

      fireEvent.change(input, { target: { value: url } })
      fireEvent.keyDown(input, { key: "Enter" })

      expect(mockPush).toHaveBeenCalledWith(
        `/import?url=${encodeURIComponent(`https://${url}`)}`,
      )
    })

    it("rejects a URL whose normalized value exceeds 2,048 characters", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      const input = await screen.findByPlaceholderText("luma.com/your-event")
      const prefix = "events.example/"
      const url = `${prefix}${"a".repeat(2_049 - "https://".length - prefix.length)}`

      fireEvent.change(input, { target: { value: url } })
      fireEvent.keyDown(input, { key: "Enter" })

      expect(
        screen.getByText("Use a public HTTPS link with 2,048 characters or fewer."),
      ).toBeDefined()
      expect(mockPush).not.toHaveBeenCalled()
    })

    it("shows submit button when URL has content", async () => {
      render(<StepImport {...defaultProps} />)
      goToImportMode()
      await waitFor(() => screen.getByPlaceholderText("luma.com/your-event"))

      fireEvent.change(screen.getByPlaceholderText("luma.com/your-event"), {
        target: { value: "luma.com/event" },
      })

      expect(screen.getByRole("button", { name: "Import event" })).toBeDefined()
    })
  })
})
