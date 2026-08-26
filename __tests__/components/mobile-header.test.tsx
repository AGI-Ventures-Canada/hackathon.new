import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react"
import {
  resetComponentMocks,
  setPathname,
  setRouter,
  setCreateOrganizationDialog,
} from "../lib/component-mocks"
import { clerkState, clerkMock, resetClerkState } from "../lib/clerk-mock"

mock.module("@clerk/nextjs", () => clerkMock)

const mockPush = mock(() => {})
const mockSetTheme = mock(() => {})

let mockTheme = "system"
let mockPathname = "/home"

mock.module("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}))

mock.module("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, ...rest } = props
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src as string}
        alt={alt as string}
        width={width as number}
        height={height as number}
        {...rest}
      />
    )
  },
}))

mock.module("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    className?: string
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))


const { MobileHeader } = await import("@/components/mobile-header")

beforeEach(() => {
  resetComponentMocks()
  resetClerkState()
  clerkState.user = {
    id: "user_123",
    fullName: "Jordan Lee",
    firstName: "Alex",
    imageUrl: null,
  }
  mockTheme = "system"
  mockPathname = "/home"
  mockPush.mockClear()
  mockSetTheme.mockClear()
  setRouter({ push: mockPush })
  setPathname(mockPathname)
  setCreateOrganizationDialog(({ open, onOpenChange }) =>
    open ? (
      <div data-testid="create-org-dialog">
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close Org Dialog
        </button>
      </div>
    ) : null,
  )
})

afterEach(() => {
  cleanup()
  document.body.style.overflow = ""
})

function getHeader() {
  return screen.getByRole("banner")
}

function getOverlay() {
  return screen.getByRole("dialog")
}

function openMenu() {
  render(<MobileHeader />)
  const header = getHeader()
  fireEvent.click(within(header).getByText("Open menu"))
}

describe("MobileHeader", () => {
  describe("header bar", () => {
    it("renders the menu button and logo", () => {
      render(<MobileHeader />)
      const header = getHeader()
      expect(within(header).getByText("Open menu")).toBeDefined()
      expect(within(header).getByText("hackathon.new")).toBeDefined()
    })

    it("shows user avatar initial when signed in without image", () => {
      render(<MobileHeader />)
      const header = getHeader()
      expect(within(header).getByText("A")).toBeDefined()
    })

    it("shows user image when imageUrl is provided", () => {
      clerkState.user = { ...clerkState.user!, imageUrl: "https://example.com/avatar.png" }
      render(<MobileHeader />)
      const img = screen.getByAltText("Jordan Lee")
      expect(img.getAttribute("src")).toBe("https://example.com/avatar.png")
    })

    it("opens user profile when avatar is clicked", () => {
      render(<MobileHeader />)
      const header = getHeader()
      const avatarButton = within(header).getByText("A").closest("button")!
      fireEvent.click(avatarButton)
      expect(clerkState.openUserProfile).toHaveBeenCalled()
    })

    it("does not show avatar when signed out", () => {
      clerkState.isSignedIn = false
      clerkState.user = null
      render(<MobileHeader />)
      const header = getHeader()
      expect(within(header).queryByRole("button", { name: /user/i })).toBeNull()
    })
  })

  describe("menu overlay", () => {
    it("locks body scroll when opened", () => {
      openMenu()
      expect(document.body.style.overflow).toBe("hidden")
    })

    it("unlocks body scroll when closed", async () => {
      openMenu()
      const overlay = getOverlay()
      fireEvent.click(within(overlay).getByText("Close menu"))
      await waitFor(() => {
        expect(document.body.style.overflow).toBe("")
      })
    })

    it("renders static nav links", () => {
      openMenu()
      const overlay = getOverlay()
      expect(within(overlay).getByText("Dashboard")).toBeDefined()
      expect(within(overlay).getByText("Browse")).toBeDefined()
    })

    it("renders expandable nav sections", () => {
      openMenu()
      const overlay = getOverlay()
      expect(within(overlay).getAllByText("Hackathons").length).toBeGreaterThan(0)
      expect(within(overlay).getAllByText("Manage").length).toBeGreaterThan(0)
    })

    it("shows sign out button when signed in", () => {
      openMenu()
      expect(screen.getByText("Sign out")).toBeDefined()
    })

    it("calls signOut when sign out button is clicked", () => {
      openMenu()
      fireEvent.click(screen.getByText("Sign out"))
      expect(clerkState.signOut).toHaveBeenCalledWith({ redirectUrl: "/sign-in" })
    })

    it("shows sign in link when signed out", () => {
      clerkState.isSignedIn = false
      clerkState.user = null
      openMenu()
      expect(screen.getByText("Sign in")).toBeDefined()
    })
  })

  describe("section navigation (drill-down)", () => {
    it("navigates to Hackathons sub-panel and shows children", () => {
      openMenu()
      const rootNav = getOverlay().querySelector("nav")!
      const hackathonsBtn = within(rootNav).getAllByText("Hackathons")[0]
        .closest("button")!
      fireEvent.click(hackathonsBtn)

      expect(screen.getByText("Participating")).toBeDefined()
      expect(screen.getByText("Judging")).toBeDefined()
      expect(screen.getByText("Organizing")).toBeDefined()
      expect(screen.getByText("Sponsoring")).toBeDefined()
    })

    it("navigates to Manage sub-panel and shows children", () => {
      openMenu()
      const rootNav = getOverlay().querySelector("nav")!
      const manageBtn = within(rootNav).getAllByText("Manage")[0].closest("button")!
      fireEvent.click(manageBtn)

      expect(screen.getByText("Settings")).toBeDefined()
      expect(screen.getByText("API Docs")).toBeDefined()
    })

    it("shows Create Event in Hackathons sub-panel", () => {
      openMenu()
      const rootNav = getOverlay().querySelector("nav")!
      const hackathonsBtn = within(rootNav).getAllByText("Hackathons")[0]
        .closest("button")!
      fireEvent.click(hackathonsBtn)

      expect(screen.getByTestId("create-hackathon-menu")).toBeDefined()
      expect(screen.getByText("Create Event")).toBeDefined()
    })

    it("shows Install Skill in Manage sub-panel", () => {
      openMenu()
      const rootNav = getOverlay().querySelector("nav")!
      const manageBtn = within(rootNav).getAllByText("Manage")[0].closest("button")!
      fireEvent.click(manageBtn)

      expect(screen.getByTestId("install-skill-button")).toBeDefined()
    })
  })

  describe("organization switcher", () => {
    beforeEach(() => {
      clerkState.organization = { id: "org_1", name: "Test Org", imageUrl: null }
      clerkState.memberships = [
        {
          role: "org:admin",
          organization: { id: "org_1", name: "Test Org", imageUrl: null },
        },
        {
          organization: {
            id: "org_2",
            name: "Second Org",
            imageUrl: "https://example.com/org2.png",
          },
        },
      ]
    })

    function openOrgSwitcher() {
      openMenu()
      const rootNav = getOverlay().querySelector("nav")!
      const orgButton = within(rootNav).getByText("Test Org").closest("button")!
      fireEvent.click(orgButton)
    }

    it("shows current org name in root nav", () => {
      openMenu()
      const rootNav = getOverlay().querySelector("nav")!
      expect(within(rootNav).getByText("Test Org")).toBeDefined()
    })

    it("shows Personal Workspace when no org is active", () => {
      clerkState.organization = null
      openMenu()
      expect(
        screen.getAllByText("Personal Workspace").length
      ).toBeGreaterThan(0)
    })

    it("opens org switcher sub-panel when org row is clicked", () => {
      openOrgSwitcher()
      expect(screen.getByText("Create New Organization")).toBeDefined()
    })

    it("lists all memberships in org switcher", () => {
      openOrgSwitcher()
      expect(screen.getByText("Second Org")).toBeDefined()
    })

    it("renders org image when imageUrl is provided", () => {
      openOrgSwitcher()
      const img = screen.getByAltText("Second Org")
      expect(img.getAttribute("src")).toBe("https://example.com/org2.png")
    })

    it("switches to personal workspace when Personal Workspace is clicked", () => {
      mockPathname = "/hackathons/123"
      setPathname(mockPathname)
      openOrgSwitcher()
      const personalButtons = screen.getAllByText("Personal Workspace")
      const personalButton = personalButtons
        .map((el) => el.closest("button"))
        .find((btn) => btn !== null)!
      fireEvent.click(personalButton)

      expect(clerkState.setActive).toHaveBeenCalledWith({ organization: null })
      expect(mockPush).toHaveBeenCalledWith("/home")
    })

    it("switches to a different org when clicked", () => {
      mockPathname = "/hackathons/123"
      setPathname(mockPathname)
      openOrgSwitcher()
      fireEvent.click(screen.getByText("Second Org"))
      expect(clerkState.setActive).toHaveBeenCalledWith({
        organization: "org_2",
      })
      expect(mockPush).toHaveBeenCalledWith("/home")
    })

    it("opens create org dialog when Create New Organization is clicked", () => {
      openOrgSwitcher()
      fireEvent.click(screen.getByText("Create New Organization"))
      expect(screen.getByTestId("create-org-dialog")).toBeDefined()
    })
  })

  describe("org switcher panel uses stable id, not title", () => {
    it("org sub-panel visibility is based on id, not dynamic org name", () => {
      clerkState.organization = {
        id: "org_1",
        name: "Alpha Corp",
        imageUrl: null,
      }
      openMenu()
      const rootNav = getOverlay().querySelector("nav")!
      const orgButton = within(rootNav)
        .getByText("Alpha Corp")
        .closest("button")!
      fireEvent.click(orgButton)

      expect(screen.getByText("Create New Organization")).toBeDefined()
    })
  })

  describe("theme toggle", () => {
    it("renders all three theme buttons", () => {
      openMenu()
      expect(screen.getByText("Light theme")).toBeDefined()
      expect(screen.getByText("Dark theme")).toBeDefined()
      expect(screen.getByText("System theme")).toBeDefined()
    })

    it("calls setTheme('light') when light button is clicked", () => {
      openMenu()
      fireEvent.click(screen.getByText("Light theme").closest("button")!)
      expect(mockSetTheme).toHaveBeenCalledWith("light")
    })

    it("calls setTheme('dark') when dark button is clicked", () => {
      openMenu()
      fireEvent.click(screen.getByText("Dark theme").closest("button")!)
      expect(mockSetTheme).toHaveBeenCalledWith("dark")
    })

    it("calls setTheme('system') when system button is clicked", () => {
      openMenu()
      fireEvent.click(screen.getByText("System theme").closest("button")!)
      expect(mockSetTheme).toHaveBeenCalledWith("system")
    })

    it("does not show theme toggle when signed out", () => {
      clerkState.isSignedIn = false
      clerkState.user = null
      openMenu()
      expect(screen.queryByText("Theme")).toBeNull()
    })
  })
})
