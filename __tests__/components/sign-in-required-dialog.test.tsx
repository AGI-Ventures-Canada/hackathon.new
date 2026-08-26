import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import {
  resetComponentMocks,
  setPathname,
  setRouter,
  setSearchParams,
} from "../lib/component-mocks"
import { takeAuthResumeTarget } from "@/lib/auth/create-resume"

const mockPush = mock((_destination: string) => {})
const { SignInRequiredDialog } = await import(
  "@/components/sign-in-required-dialog"
)

const sourcePrefix = "https://events.example.com/"
const maximumCjkSourceUrl = `${sourcePrefix}${"界".repeat(
  2_048 - sourcePrefix.length,
)}`

beforeEach(() => {
  resetComponentMocks()
  mockPush.mockClear()
  setPathname("/import")
  setSearchParams(new URLSearchParams({ url: maximumCjkSourceUrl }))
  setRouter({ push: mockPush })
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

describe("SignInRequiredDialog", () => {
  for (const buttonName of ["Sign In", "Sign Up"] as const) {
    it(`keeps a maximum-length import and review step through ${buttonName.toLowerCase()}`, () => {
      render(
        <SignInRequiredDialog
          open
          onOpenChange={() => {}}
          redirectQuery="review=true"
          resumeImport={{
            sourceUrl: maximumCjkSourceUrl,
            storageKey: "oatmeal:external-import:safe-reference",
          }}
        />,
      )

      const importRedirect = `/import?${new URLSearchParams({
        url: maximumCjkSourceUrl,
        review: "true",
      })}`
      fireEvent.click(screen.getByRole("button", { name: buttonName }))

      expect(maximumCjkSourceUrl).toHaveLength(2_048)
      expect(importRedirect).toContain("%E7%95%8C")
      expect(mockPush).toHaveBeenCalledTimes(1)
      const destination = mockPush.mock.calls[0][0]
      expect(destination.length).toBeLessThan(200)
      const received = new URL(destination, "https://app.example")
        .searchParams.get("redirect_url")
      expect(received).toMatch(/^\/resume-create\?token=/)
      const token = new URL(received!, "https://app.example").searchParams.get("token")!
      expect(takeAuthResumeTarget(token)).toEqual({
        kind: "import",
        sourceUrl: maximumCjkSourceUrl,
        storageKey: "oatmeal:external-import:safe-reference",
      })
    })
  }

  it("ignores repeated auth clicks while navigation is starting", () => {
    render(
      <SignInRequiredDialog
        open
        onOpenChange={() => {}}
        redirectQuery="review=true"
        resumeImport={{
          sourceUrl: maximumCjkSourceUrl,
          storageKey: "oatmeal:external-import:safe-reference",
        }}
      />,
    )

    const button = screen.getByRole("button", { name: "Sign In" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it("rechecks draft durability immediately before leaving for auth", () => {
    const beforeNavigate = mock(() =>
      "We couldn't save your draft. Keep this page open.",
    )
    render(
      <SignInRequiredDialog
        open
        onOpenChange={() => {}}
        beforeNavigate={beforeNavigate}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))

    expect(beforeNavigate).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/keep this page open/i)).toBeDefined()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("keeps the dialog open when browser storage cannot save the handoff", () => {
    const localDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    )
    const sessionDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "sessionStorage",
    )
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked")
      },
    })
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked")
      },
    })
    try {
      render(
        <SignInRequiredDialog
          open
          onOpenChange={() => {}}
          resumeImport={{
            sourceUrl: maximumCjkSourceUrl,
            storageKey: "oatmeal:external-import:safe-reference",
          }}
        />,
      )

      fireEvent.click(screen.getByRole("button", { name: "Sign In" }))
      expect(
        screen.getByText(/couldn't save the return path/i),
      ).toBeDefined()
      expect(mockPush).not.toHaveBeenCalled()
    } finally {
      if (localDescriptor) {
        Object.defineProperty(globalThis, "localStorage", localDescriptor)
      }
      if (sessionDescriptor) {
        Object.defineProperty(globalThis, "sessionStorage", sessionDescriptor)
      }
    }
  })

  it("allows another try after synchronous navigation fails", () => {
    const failingPush = mock((_destination: string) => {
      throw new Error("navigation failed")
    })
    setRouter({ push: failingPush })
    render(
      <SignInRequiredDialog
        open
        onOpenChange={() => {}}
        resumeImport={{
          sourceUrl: maximumCjkSourceUrl,
          storageKey: "oatmeal:external-import:safe-reference",
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))
    expect(screen.getByText(/couldn't open sign in/i)).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))
    expect(failingPush).toHaveBeenCalledTimes(2)
  })

  it("clears transient navigation state when canceled", () => {
    const onOpenChange = mock((_open: boolean) => {})
    render(
      <SignInRequiredDialog
        open
        onOpenChange={onOpenChange}
        title="Keep your draft"
        description="Sign in when you're ready."
      />,
    )

    expect(screen.getByText("Keep your draft")).toBeDefined()
    expect(screen.getByText("Sign in when you're ready.")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
