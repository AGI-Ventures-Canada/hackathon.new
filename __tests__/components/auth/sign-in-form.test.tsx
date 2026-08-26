import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

let signInCreateImpl: (...args: unknown[]) => Promise<unknown> = () =>
  Promise.resolve({ status: "complete", createdSessionId: "session_123" })
let signInAttemptSecondFactorImpl: (
  ...args: unknown[]
) => Promise<unknown> = () =>
  Promise.resolve({ status: "complete", createdSessionId: "session_123" })
let signInAttemptFirstFactorImpl: (
  ...args: unknown[]
) => Promise<unknown> = () => Promise.resolve({ status: "needs_new_password" })
let signInResetPasswordImpl: (...args: unknown[]) => Promise<unknown> = () =>
  Promise.resolve({ status: "complete", createdSessionId: "session_123" })
let signInAuthenticateWithRedirectImpl: (
  ...args: unknown[]
) => Promise<unknown> = () => Promise.resolve()

const signInCreate = mock((...args: unknown[]) => signInCreateImpl(...args))
const signInAttemptSecondFactor = mock((...args: unknown[]) =>
  signInAttemptSecondFactorImpl(...args),
)
const signInAttemptFirstFactor = mock((...args: unknown[]) =>
  signInAttemptFirstFactorImpl(...args),
)
const signInResetPassword = mock((...args: unknown[]) =>
  signInResetPasswordImpl(...args),
)
const signInAuthenticateWithRedirect = mock((...args: unknown[]) =>
  signInAuthenticateWithRedirectImpl(...args),
)
const signInPrepareSecondFactor = mock(() => Promise.resolve({}))

const mockSetActive = g.__clerkState.signInSetActive
const mockReplace = g.__nextNavState.router.replace

const { SignInForm } = await import("@/components/auth/sign-in-form")

beforeEach(() => {
  g.__clerkState.signInLoaded = true
  g.__clerkState.signIn = {
    create: signInCreate,
    attemptSecondFactor: signInAttemptSecondFactor,
    prepareSecondFactor: signInPrepareSecondFactor,
    attemptFirstFactor: signInAttemptFirstFactor,
    resetPassword: signInResetPassword,
    authenticateWithRedirect: signInAuthenticateWithRedirect,
  }

  signInCreateImpl = () =>
    Promise.resolve({ status: "complete", createdSessionId: "session_123" })
  signInAttemptSecondFactorImpl = () =>
    Promise.resolve({ status: "complete", createdSessionId: "session_123" })
  signInAttemptFirstFactorImpl = () =>
    Promise.resolve({ status: "needs_new_password" })
  signInResetPasswordImpl = () =>
    Promise.resolve({ status: "complete", createdSessionId: "session_123" })
  signInAuthenticateWithRedirectImpl = () => Promise.resolve()
  signInCreate.mockClear()
  signInAttemptSecondFactor.mockClear()
  signInAttemptFirstFactor.mockClear()
  signInResetPassword.mockClear()
  signInAuthenticateWithRedirect.mockClear()
  signInPrepareSecondFactor.mockClear()
  mockReplace.mockClear()
  mockSetActive.mockClear()
})

afterEach(() => {
  g.__clerkState.signInLoaded = false
  g.__clerkState.signIn = null
  cleanup()
})

describe("SignInForm", () => {
  describe("credentials step", () => {
    it("renders email, password fields and OAuth buttons", () => {
      render(<SignInForm />)
      expect(screen.getByLabelText("Email")).toBeDefined()
      expect(screen.getByLabelText("Password")).toBeDefined()
      expect(screen.getByText("Google")).toBeDefined()
      expect(screen.getByText("GitHub")).toBeDefined()
      expect(screen.getByText("LinkedIn")).toBeDefined()
    })

    it("renders sign in button and sign up link", () => {
      render(<SignInForm />)
      expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined()
      expect(screen.getByText("Sign up")).toBeDefined()
    })

    it("shows loading spinner while Clerk is not loaded", () => {
      g.__clerkState.signInLoaded = false
      g.__clerkState.signIn = undefined
      render(<SignInForm />)
      expect(screen.queryByLabelText("Email")).toBeNull()
    })

    it("calls signIn.create with identifier and password on submit", async () => {
      render(<SignInForm />)
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "user@example.com" },
      })
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "secret" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
      await waitFor(() => {
        expect(signInCreate).toHaveBeenCalledWith({
          identifier: "user@example.com",
          password: "secret",
        })
      })
    })

    it("calls setActive and replaces the auth page on complete", async () => {
      render(<SignInForm redirectUrl="/dashboard" />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledWith({ session: "session_123" })
        expect(mockReplace).toHaveBeenCalledWith("/dashboard")
      })
    })

    it("defaults redirect to /home when no redirectUrl given", async () => {
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/home")
      })
    })

    it("shows error message on Clerk API error", async () => {
      signInCreateImpl = () =>
        Promise.reject({ errors: [{ message: "Invalid credentials" }] })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
      await waitFor(() => {
        expect(screen.getByText("Invalid credentials")).toBeDefined()
      })
    })

    it("transitions to 2FA step when needs_second_factor", async () => {
      signInCreateImpl = () =>
        Promise.resolve({ status: "needs_second_factor" })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
      await waitFor(() => {
        expect(screen.getByText("Two-factor authentication")).toBeDefined()
      })
    })

    it("prepares a phone code when TOTP is not available", async () => {
      signInCreateImpl = () =>
        Promise.resolve({
          status: "needs_second_factor",
          supportedSecondFactors: [
            {
              strategy: "phone_code",
              phoneNumberId: "phone_123",
              safeIdentifier: "+1 *** 1234",
            },
          ],
          prepareSecondFactor: signInPrepareSecondFactor,
        })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => {
        expect(signInPrepareSecondFactor).toHaveBeenCalledWith({
          strategy: "phone_code",
          phoneNumberId: "phone_123",
        })
        expect(screen.getByText(/\+1 \*\*\* 1234/)).toBeDefined()
      })
      fireEvent.click(screen.getByRole("button", { name: "Verify" }))
      await waitFor(() => {
        expect(signInAttemptSecondFactor).toHaveBeenCalledWith({
          strategy: "phone_code",
          code: "",
        })
      })
    })

    it("lets the user switch from TOTP to a backup code", async () => {
      signInCreateImpl = () =>
        Promise.resolve({
          status: "needs_second_factor",
          supportedSecondFactors: [
            { strategy: "totp" },
            { strategy: "backup_code" },
          ],
          prepareSecondFactor: signInPrepareSecondFactor,
        })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      const backupButton = await waitFor(() =>
        screen.getByRole("button", { name: "Backup code" }),
      )
      fireEvent.click(backupButton)
      await screen.findByText("Enter one of your backup codes")
      fireEvent.change(screen.getByLabelText("Verification code"), {
        target: { value: "backup-code" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Verify" }))

      await waitFor(() => {
        expect(signInAttemptSecondFactor).toHaveBeenCalledWith({
          strategy: "backup_code",
          code: "backup-code",
        })
      })
    })

    it("resends the selected phone factor", async () => {
      signInCreateImpl = () =>
        Promise.resolve({
          status: "needs_second_factor",
          supportedSecondFactors: [
            {
              strategy: "phone_code",
              phoneNumberId: "phone_123",
              safeIdentifier: "+1 *** 1234",
            },
          ],
          prepareSecondFactor: signInPrepareSecondFactor,
        })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      const resendButton = await waitFor(() =>
        screen.getByRole("button", { name: "Send a new code" }),
      )
      signInPrepareSecondFactor.mockClear()
      fireEvent.click(resendButton)

      await waitFor(() => {
        expect(signInPrepareSecondFactor).toHaveBeenCalledWith({
          strategy: "phone_code",
          phoneNumberId: "phone_123",
        })
      })
    })

    it("switches between phone destinations and resends to the selected one", async () => {
      signInCreateImpl = () =>
        Promise.resolve({
          status: "needs_second_factor",
          supportedSecondFactors: [
            {
              strategy: "phone_code",
              phoneNumberId: "phone_123",
              safeIdentifier: "+1 *** 1234",
            },
            {
              strategy: "phone_code",
              phoneNumberId: "phone_456",
              safeIdentifier: "+1 *** 5678",
            },
          ],
          prepareSecondFactor: signInPrepareSecondFactor,
        })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      const secondPhone = await waitFor(() =>
        screen.getByRole("button", { name: "Text +1 *** 5678" }),
      )
      fireEvent.click(secondPhone)
      await waitFor(() => {
        expect(secondPhone.getAttribute("aria-pressed")).toBe("true")
        expect(signInPrepareSecondFactor).toHaveBeenLastCalledWith({
          strategy: "phone_code",
          phoneNumberId: "phone_456",
        })
      })

      signInPrepareSecondFactor.mockClear()
      fireEvent.click(screen.getByRole("button", { name: "Send a new code" }))
      await waitFor(() => {
        expect(signInPrepareSecondFactor).toHaveBeenCalledWith({
          strategy: "phone_code",
          phoneNumberId: "phone_456",
        })
      })
    })

    it("switches between email destinations and resends to the selected one", async () => {
      signInCreateImpl = () =>
        Promise.resolve({
          status: "needs_second_factor",
          supportedSecondFactors: [
            {
              strategy: "email_code",
              emailAddressId: "email_123",
              safeIdentifier: "a***@example.com",
            },
            {
              strategy: "email_code",
              emailAddressId: "email_456",
              safeIdentifier: "b***@example.com",
            },
          ],
          prepareSecondFactor: signInPrepareSecondFactor,
        })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      const secondEmail = await waitFor(() =>
        screen.getByRole("button", { name: "Email b***@example.com" }),
      )
      fireEvent.click(secondEmail)
      await waitFor(() => {
        expect(secondEmail.getAttribute("aria-pressed")).toBe("true")
        expect(signInPrepareSecondFactor).toHaveBeenLastCalledWith({
          strategy: "email_code",
          emailAddressId: "email_456",
        })
      })

      signInPrepareSecondFactor.mockClear()
      fireEvent.click(screen.getByRole("button", { name: "Send a new code" }))
      await waitFor(() => {
        expect(signInPrepareSecondFactor).toHaveBeenCalledWith({
          strategy: "email_code",
          emailAddressId: "email_456",
        })
      })
    })

    it("shows a useful error for an unsupported second-factor method", async () => {
      signInCreateImpl = () =>
        Promise.resolve({
          status: "needs_second_factor",
          supportedSecondFactors: [
            {
              strategy: "email_link",
              emailAddressId: "email_123",
              safeIdentifier: "u***@example.com",
            },
          ],
          prepareSecondFactor: signInPrepareSecondFactor,
        })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => {
        expect(
          screen.getByText(/sign-in method we can't open here/),
        ).toBeDefined()
      })
      expect(screen.queryByText("Two-factor authentication")).toBeNull()
    })

    it("shows non-Clerk sign-in failures", async () => {
      signInCreateImpl = () => Promise.reject(new Error("Connection lost"))
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => {
        expect(screen.getByText("Connection lost")).toBeDefined()
      })
    })

    it("transitions to reset-request step when Forgot password is clicked", () => {
      render(<SignInForm />)
      fireEvent.click(screen.getByText("Forgot password?"))
      expect(screen.getByText("Reset password")).toBeDefined()
      expect(
        screen.getByRole("button", { name: "Send reset code" }),
      ).toBeDefined()
    })
  })

  describe("OAuth-only account fallback", () => {
    function failWithStrategyError(factors: { strategy: string }[]) {
      return (...args: unknown[]) => {
        const params = args[0] as { password?: string }
        if (params?.password) {
          ;(
            g.__clerkState.signIn as {
              supportedFirstFactors?: { strategy: string }[]
            }
          ).supportedFirstFactors = factors
          return Promise.reject({
            clerkError: true,
            errors: [
              {
                code: "strategy_for_user_invalid",
                message:
                  "The verification strategy is not valid for this account",
              },
            ],
          })
        }
        return Promise.resolve({
          status: "needs_first_factor",
          supportedFirstFactors: factors,
        })
      }
    }

    it("shows Continue with Google when password fails on OAuth-only account", async () => {
      signInCreateImpl = failWithStrategyError([{ strategy: "oauth_google" }])

      render(<SignInForm />)
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "user@example.com" },
      })
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Continue with Google" }),
        ).toBeDefined()
      })
      expect(screen.getByText(/signs in with Google/)).toBeDefined()
    })

    it("triggers OAuth redirect when Continue with Google is clicked", async () => {
      signInCreateImpl = failWithStrategyError([{ strategy: "oauth_google" }])

      render(<SignInForm redirectUrl="/dashboard" />)
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "user@example.com" },
      })
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      const continueButton = await waitFor(() =>
        screen.getByRole("button", { name: "Continue with Google" }),
      )
      fireEvent.click(continueButton)

      await waitFor(() => {
        expect(signInAuthenticateWithRedirect).toHaveBeenCalledWith({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback?redirect_url=%2Fdashboard",
          redirectUrlComplete: "/dashboard",
        })
      })
    })

    it("shows multiple OAuth providers when account supports several", async () => {
      signInCreateImpl = failWithStrategyError([
        { strategy: "oauth_google" },
        { strategy: "oauth_github" },
      ])

      render(<SignInForm />)
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "user@example.com" },
      })
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Continue with Google" }),
        ).toBeDefined()
        expect(
          screen.getByRole("button", { name: "Continue with GitHub" }),
        ).toBeDefined()
      })
    })

    it("falls back to default error if signIn reports no usable strategies", async () => {
      signInCreateImpl = failWithStrategyError([{ strategy: "email_code" }])

      render(<SignInForm />)
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "user@example.com" },
      })
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => {
        expect(
          screen.getByText(/verification strategy is not valid/),
        ).toBeDefined()
      })
    })

    it("clears OAuth-only fallback when email is edited", async () => {
      signInCreateImpl = failWithStrategyError([{ strategy: "oauth_google" }])

      render(<SignInForm />)
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "user@example.com" },
      })
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "wrong" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Continue with Google" }),
        ).toBeDefined(),
      )

      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "other@example.com" },
      })

      expect(
        screen.queryByRole("button", { name: "Continue with Google" }),
      ).toBeNull()
    })
  })

  describe("second factor step", () => {
    async function goToSecondFactor() {
      signInCreateImpl = () =>
        Promise.resolve({ status: "needs_second_factor" })
      render(<SignInForm />)
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
      await waitFor(() =>
        expect(screen.getByText("Two-factor authentication")).toBeDefined(),
      )
    }

    it("calls attemptSecondFactor with totp code", async () => {
      await goToSecondFactor()
      fireEvent.change(screen.getByLabelText("Verification code"), {
        target: { value: "123456" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Verify" }))
      await waitFor(() => {
        expect(signInAttemptSecondFactor).toHaveBeenCalledWith({
          strategy: "totp",
          code: "123456",
        })
      })
    })

    it("redirects on successful verification", async () => {
      await goToSecondFactor()
      fireEvent.click(screen.getByRole("button", { name: "Verify" }))
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/home")
      })
    })

    it("shows error on failed verification", async () => {
      await goToSecondFactor()
      signInAttemptSecondFactorImpl = () =>
        Promise.reject({ errors: [{ message: "Invalid code" }] })
      fireEvent.click(screen.getByRole("button", { name: "Verify" }))
      await waitFor(() => {
        expect(screen.getByText("Invalid code")).toBeDefined()
      })
    })

    it("navigates back to credentials on Back button", async () => {
      await goToSecondFactor()
      fireEvent.click(screen.getByText("Back to sign in"))
      expect(screen.getByLabelText("Email")).toBeDefined()
    })
  })

  describe("password reset flow", () => {
    function goToResetRequest(redirectUrl?: string) {
      render(<SignInForm redirectUrl={redirectUrl} />)
      fireEvent.click(screen.getByText("Forgot password?"))
    }

    it("sends reset email and transitions to reset-code step", async () => {
      signInCreateImpl = () => Promise.resolve({})
      goToResetRequest()
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "user@example.com" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
      await waitFor(() => {
        expect(screen.getByText("Check your email")).toBeDefined()
      })
    })

    it("shows error if reset request fails", async () => {
      signInCreateImpl = () =>
        Promise.reject({ errors: [{ message: "Email not found" }] })
      goToResetRequest()
      fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
      await waitFor(() => {
        expect(screen.getByText("Email not found")).toBeDefined()
      })
    })

    it("transitions to reset-password step after valid code", async () => {
      signInCreateImpl = () => Promise.resolve({})
      goToResetRequest()
      fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
      await waitFor(() =>
        expect(screen.getByText("Check your email")).toBeDefined(),
      )
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
      await waitFor(() => {
        expect(screen.getByText("Set new password")).toBeDefined()
      })
    })

    it("resets password and redirects on success", async () => {
      signInCreateImpl = () => Promise.resolve({})
      goToResetRequest()
      fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
      await waitFor(() =>
        expect(screen.getByText("Check your email")).toBeDefined(),
      )
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
      await waitFor(() =>
        expect(screen.getByText("Set new password")).toBeDefined(),
      )
      fireEvent.change(screen.getByLabelText("New password"), {
        target: { value: "newpass123" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Reset password" }))
      await waitFor(() => {
        expect(signInResetPassword).toHaveBeenCalledWith({
          password: "newpass123",
        })
        expect(mockReplace).toHaveBeenCalledWith("/home")
      })
    })

    it("resumes the requested page after MFA following a password reset", async () => {
      signInCreateImpl = () => Promise.resolve({})
      signInResetPasswordImpl = () => Promise.resolve({
        status: "needs_second_factor",
        supportedSecondFactors: [{ strategy: "totp" }],
        prepareSecondFactor: signInPrepareSecondFactor,
      })
      goToResetRequest("/create?review=true")
      fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
      await waitFor(() => {
        expect(screen.getByText("Check your email")).toBeDefined()
      })
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
      await waitFor(() => {
        expect(screen.getByText("Set new password")).toBeDefined()
      })
      fireEvent.change(screen.getByLabelText("New password"), {
        target: { value: "newpass123" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Reset password" }))

      await waitFor(() => {
        expect(screen.getByText("Two-factor authentication")).toBeDefined()
      })
      fireEvent.change(screen.getByLabelText("Verification code"), {
        target: { value: "123456" },
      })
      fireEvent.click(screen.getByRole("button", { name: "Verify" }))

      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledWith({ session: "session_123" })
        expect(mockReplace).toHaveBeenCalledWith("/create?review=true")
      })
    })
  })

  describe("OAuth", () => {
    it("calls authenticateWithRedirect for Google", async () => {
      render(<SignInForm redirectUrl="/dashboard" />)
      fireEvent.click(screen.getByText("Google"))
      await waitFor(() => {
        expect(signInAuthenticateWithRedirect).toHaveBeenCalledWith({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback?redirect_url=%2Fdashboard",
          redirectUrlComplete: "/dashboard",
        })
      })
    })

    it("calls authenticateWithRedirect for GitHub", async () => {
      render(<SignInForm />)
      fireEvent.click(screen.getByText("GitHub"))
      await waitFor(() => {
        expect(signInAuthenticateWithRedirect).toHaveBeenCalledWith({
          strategy: "oauth_github",
          redirectUrl: "/sso-callback?redirect_url=%2Fhome",
          redirectUrlComplete: "/home",
        })
      })
    })

    it("calls authenticateWithRedirect for LinkedIn", async () => {
      render(<SignInForm />)
      fireEvent.click(screen.getByText("LinkedIn"))
      await waitFor(() => {
        expect(signInAuthenticateWithRedirect).toHaveBeenCalledWith({
          strategy: "oauth_linkedin_oidc",
          redirectUrl: "/sso-callback?redirect_url=%2Fhome",
          redirectUrlComplete: "/home",
        })
      })
    })
  })

  describe("sign-up link", () => {
    it("includes redirect_url in sign-up href when redirectUrl is set", () => {
      render(<SignInForm redirectUrl="/event/abc" />)
      const link = screen.getByText("Sign up").closest("a")!
      expect(link.getAttribute("href")).toContain("redirect_url")
    })

    it("omits redirect_url in sign-up href when redirectUrl is /home", () => {
      render(<SignInForm redirectUrl="/home" />)
      const link = screen.getByText("Sign up").closest("a")!
      expect(link.getAttribute("href")).toBe("/sign-up")
    })
  })
})
