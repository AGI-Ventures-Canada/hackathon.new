import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

let signUpCreateImpl: (...args: unknown[]) => Promise<unknown> = () => Promise.resolve({})
let signUpPrepareVerificationImpl: (...args: unknown[]) => Promise<unknown> = () =>
  Promise.resolve({})
let signUpAttemptVerificationImpl: (...args: unknown[]) => Promise<unknown> = () =>
  Promise.resolve({ status: "complete", createdSessionId: "session_123" })

const signUpCreate = mock((...args: unknown[]) => signUpCreateImpl(...args))
const signUpPrepareVerification = mock((...args: unknown[]) =>
  signUpPrepareVerificationImpl(...args),
)
const signUpAttemptVerification = mock((...args: unknown[]) =>
  signUpAttemptVerificationImpl(...args),
)
const signUpAuthenticateWithRedirect = mock(() => Promise.resolve())

const mockSetActive = g.__clerkState.signUpSetActive
const mockReplace = g.__nextNavState.router.replace
const mockCreateOrganization = mock(() => Promise.resolve({ id: "org_new" }))
const mockSetOrgActive = mock(() => Promise.resolve())

global.fetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ available: true }),
  } as Response),
)

const { SignUpForm } = await import("@/components/auth/sign-up-form")

beforeEach(() => {
  g.__clerkState.signUpLoaded = true
  g.__clerkState.signUp = {
    create: signUpCreate,
    prepareVerification: signUpPrepareVerification,
    attemptVerification: signUpAttemptVerification,
    authenticateWithRedirect: signUpAuthenticateWithRedirect,
  }
  g.__clerkState.createOrganization = mockCreateOrganization
  g.__clerkState.setOrgActive = mockSetOrgActive

  signUpCreateImpl = () => Promise.resolve({})
  signUpPrepareVerificationImpl = () => Promise.resolve({})
  signUpAttemptVerificationImpl = () =>
    Promise.resolve({ status: "complete", createdSessionId: "session_123" })
  signUpCreate.mockClear()
  signUpPrepareVerification.mockClear()
  signUpAttemptVerification.mockClear()
  signUpAuthenticateWithRedirect.mockClear()
  mockReplace.mockClear()
  mockSetActive.mockClear()
  mockSetOrgActive.mockClear()
  mockCreateOrganization.mockClear()
})

afterEach(() => {
  g.__clerkState.signUpLoaded = false
  g.__clerkState.signUp = null
  g.__clerkState.createOrganization = undefined
  g.__clerkState.setOrgActive = undefined
  cleanup()
})

describe("SignUpForm", () => {
  describe("registration step", () => {
    it("renders name, email, password fields and OAuth buttons", () => {
      render(<SignUpForm />)
      expect(screen.getByLabelText("First name")).toBeDefined()
      expect(screen.getByLabelText("Last name")).toBeDefined()
      expect(screen.getByLabelText("Email")).toBeDefined()
      expect(screen.getByLabelText("Password")).toBeDefined()
      expect(screen.getByText("Google")).toBeDefined()
      expect(screen.getByText("GitHub")).toBeDefined()
      expect(screen.getByText("LinkedIn")).toBeDefined()
    })

    it("renders sign up button and sign in link", () => {
      render(<SignUpForm />)
      expect(screen.getByRole("button", { name: "Sign up" })).toBeDefined()
      expect(screen.getByText("Sign in")).toBeDefined()
    })

    it("shows loading spinner while Clerk is not loaded", () => {
      g.__clerkState.signUpLoaded = false
      g.__clerkState.signUp = undefined
      render(<SignUpForm />)
      expect(screen.queryByLabelText("Email")).toBeNull()
    })

    it("calls signUp.create with user details on submit", async () => {
      render(<SignUpForm />)
      fireEvent.change(screen.getByLabelText("First name"), {
        target: { value: "Jane" },
      })
      fireEvent.change(screen.getByLabelText("Last name"), {
        target: { value: "Doe" },
      })
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "jane@example.com" },
      })
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "password123" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign up" }))
      await waitFor(() => {
        expect(signUpCreate).toHaveBeenCalledWith({
          firstName: "Jane",
          lastName: "Doe",
          emailAddress: "jane@example.com",
          password: "password123",
        })
      })
    })

    it("calls prepareVerification and transitions to verify step on success", async () => {
      render(<SignUpForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign up" }))
      await waitFor(() => {
        expect(signUpPrepareVerification).toHaveBeenCalledWith({
          strategy: "email_code",
        })
        expect(screen.getByText("Check your email")).toBeDefined()
      })
    })

    it("shows error message on Clerk API error", async () => {
      signUpCreateImpl = () =>
        Promise.reject({ errors: [{ message: "Email already in use" }] })
      render(<SignUpForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign up" }))
      await waitFor(() => {
        expect(
          screen.getByText(
            "We couldn't create the account. Try signing in or use another method.",
          ),
        ).toBeDefined()
      })
    })
  })

  describe("verify step", () => {
    async function goToVerify() {
      render(<SignUpForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign up" }))
      await waitFor(() =>
        expect(screen.getByText("Check your email")).toBeDefined(),
      )
    }

    it("calls attemptVerification with the entered code", async () => {
      await goToVerify()
      fireEvent.change(screen.getByLabelText("Verification code"), {
        target: { value: "654321" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Verify email" }))
      await waitFor(() => {
        expect(signUpAttemptVerification).toHaveBeenCalledWith({
          strategy: "email_code",
          code: "654321",
        })
      })
    })

    it("transitions to create-org step on successful verification when no redirectUrl is set", async () => {
      await goToVerify()
      fireEvent.click(screen.getByRole("button", { name: "Verify email" }))
      await waitFor(() => {
        expect(screen.getByText("Create your organization")).toBeDefined()
      })
    })

    it("redirects to redirectUrl after verification when redirectUrl is set", async () => {
      render(<SignUpForm redirectUrl="/e/my-event" />)
      fireEvent.click(screen.getByRole("button", { name: "Sign up" }))
      await waitFor(() =>
        expect(screen.getByText("Check your email")).toBeDefined(),
      )
      fireEvent.click(screen.getByRole("button", { name: "Verify email" }))
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/e/my-event")
      })
      expect(screen.queryByText("Create your organization")).toBeNull()
    })

    it("shows error on failed verification", async () => {
      signUpAttemptVerificationImpl = () =>
        Promise.reject({ errors: [{ message: "Wrong code" }] })
      await goToVerify()
      fireEvent.click(screen.getByRole("button", { name: "Verify email" }))
      await waitFor(() => {
        expect(screen.getByText("Wrong code")).toBeDefined()
      })
    })
  })

  describe("create-org step", () => {
    async function goToCreateOrg() {
      render(<SignUpForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign up" }))
      await waitFor(() =>
        expect(screen.getByText("Check your email")).toBeDefined(),
      )
      fireEvent.click(screen.getByRole("button", { name: "Verify email" }))
      await waitFor(() =>
        expect(screen.getByText("Create your organization")).toBeDefined(),
      )
    }

    it("renders org name, slug fields and action buttons", async () => {
      await goToCreateOrg()
      expect(screen.getByLabelText("Organization name")).toBeDefined()
      expect(screen.getByLabelText("URL slug")).toBeDefined()
      expect(
        screen.getByRole("button", { name: "Create organization" }),
      ).toBeDefined()
      expect(screen.getByRole("button", { name: "Skip for now" })).toBeDefined()
    })

    it("Skip for now navigates to /onboarding when no redirectUrl is set", async () => {
      await goToCreateOrg()
      fireEvent.click(screen.getByRole("button", { name: "Skip for now" }))
      expect(mockReplace).toHaveBeenCalledWith("/onboarding")
    })

    it("auto-generates slug from org name", async () => {
      await goToCreateOrg()
      fireEvent.change(screen.getByLabelText("Organization name"), {
        target: { value: "Acme Inc" },
      })
      await waitFor(() => {
        const slugInput = screen.getByLabelText("URL slug") as HTMLInputElement
        expect(slugInput.value).toBe("acme-inc")
      })
    })
  })

  describe("OAuth", () => {
    it("calls authenticateWithRedirect for Google", async () => {
      render(<SignUpForm redirectUrl="/dashboard" />)
      fireEvent.click(screen.getByText("Google"))
      await waitFor(() => {
        expect(signUpAuthenticateWithRedirect).toHaveBeenCalledWith({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback?redirect_url=%2Fdashboard",
          redirectUrlComplete: "/dashboard",
        })
      })
    })

    it("calls authenticateWithRedirect for GitHub", async () => {
      render(<SignUpForm />)
      fireEvent.click(screen.getByText("GitHub"))
      await waitFor(() => {
        expect(signUpAuthenticateWithRedirect).toHaveBeenCalledWith({
          strategy: "oauth_github",
          redirectUrl: "/sso-callback?redirect_url=%2Fonboarding",
          redirectUrlComplete: "/onboarding",
        })
      })
    })

    it("calls authenticateWithRedirect for LinkedIn", async () => {
      render(<SignUpForm />)
      fireEvent.click(screen.getByText("LinkedIn"))
      await waitFor(() => {
        expect(signUpAuthenticateWithRedirect).toHaveBeenCalledWith({
          strategy: "oauth_linkedin_oidc",
          redirectUrl: "/sso-callback?redirect_url=%2Fonboarding",
          redirectUrlComplete: "/onboarding",
        })
      })
    })
  })

  describe("sign-in link", () => {
    it("includes redirect_url in sign-in href when redirectUrl is set", () => {
      render(<SignUpForm redirectUrl="/event/abc" />)
      const link = screen.getByText("Sign in").closest("a")!
      expect(link.getAttribute("href")).toContain("redirect_url")
    })

    it("links to /sign-in without redirect_url when none given", () => {
      render(<SignUpForm />)
      const link = screen.getByText("Sign in").closest("a")!
      expect(link.getAttribute("href")).toBe("/sign-in")
    })
  })
})
