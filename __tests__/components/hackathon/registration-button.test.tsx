import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { resetComponentMocks, setClerkAuth, setPathname } from "../../lib/component-mocks"
import { clerkState } from "../../lib/clerk-mock"
import { RegistrationButton } from "@/components/hackathon/registration-button"

const PAST_DATE = "2026-01-01T00:00:00Z"
const FUTURE_DATE = "2099-01-01T00:00:00Z"

function renderButton(props: Partial<React.ComponentProps<typeof RegistrationButton>> = {}) {
  return render(
    <RegistrationButton
      hackathonSlug="example"
      status="active"
      endsAt={FUTURE_DATE}
      registrationOpensAt={null}
      registrationClosesAt={PAST_DATE}
      maxParticipants={null}
      participantCount={0}
      isRegistered={false}
      {...props}
    />
  )
}

beforeEach(() => {
  resetComponentMocks()
  clerkState.isLoaded = true
  setPathname("/e/example")
})

afterEach(() => {
  cleanup()
})

describe("RegistrationButton", () => {
  it("uses a stable loading fallback in server markup", () => {
    setClerkAuth({ isSignedIn: false })
    const html = renderToString(
      <RegistrationButton
        hackathonSlug="example"
        status="registration_open"
        startsAt={null}
        endsAt={FUTURE_DATE}
        registrationOpensAt={null}
        registrationClosesAt={FUTURE_DATE}
        maxParticipants={null}
        participantCount={0}
        isRegistered={false}
      />
    )

    expect(html).toContain("Loading...")
    expect(html).not.toContain("Register to Attend")
  })

  describe("when registration has closed and user is signed out", () => {
    beforeEach(() => {
      setClerkAuth({ isSignedIn: false })
    })

    it("shows the registration closed message", () => {
      renderButton()
      expect(screen.getByText(/Registration closed/)).toBeDefined()
    })

    it("offers a sign-in link so registered participants can log back in", () => {
      renderButton()
      const link = screen.getByRole("link", { name: /Already signed up\? Sign in/ })
      expect(link.getAttribute("href")).toBe(
        `/sign-in?redirect_url=${encodeURIComponent("/e/example")}`
      )
    })
  })

  describe("when registration has closed and user is signed in", () => {
    beforeEach(() => {
      setClerkAuth({ isSignedIn: true })
    })

    it("does not render the sign-in link", () => {
      renderButton()
      expect(screen.getByText(/Registration closed/)).toBeDefined()
      expect(screen.queryByRole("link", { name: /Already signed up/ })).toBeNull()
    })
  })

  describe("when registration is open and user is signed out", () => {
    beforeEach(() => {
      setClerkAuth({ isSignedIn: false })
    })

    it("renders the Register to Attend link to the sign-in page", () => {
      render(
        <RegistrationButton
          hackathonSlug="example"
          status="registration_open"
          endsAt={FUTURE_DATE}
          registrationOpensAt={null}
          registrationClosesAt={FUTURE_DATE}
          maxParticipants={null}
          participantCount={0}
          isRegistered={false}
        />
      )
      const link = screen.getByRole("link", { name: "Register to Attend" })
      expect(link.getAttribute("href")).toBe(
        `/sign-in?redirect_url=${encodeURIComponent("/e/example")}`
      )
    })
  })
})
