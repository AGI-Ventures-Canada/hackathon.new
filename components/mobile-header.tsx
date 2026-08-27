"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import {
  useUser,
  useClerk,
  useOrganization,
  useOrganizationList,
} from "@clerk/nextjs"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  Plus,
  Check,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"
import { CreateHackathonMenu } from "@/components/hackathon/create-hackathon-menu"
import { InstallSkillButton } from "@/components/install-skill-button"
import { CreateOrganizationDialog } from "@/components/create-organization-dialog"

type NavSection = {
  id: string
  title: string
  href?: string
  children?: { title: string; href: string }[]
}

const ORG_SWITCHER_ID = "org-switcher"
const HACKATHONS_ID = "hackathons"
const MANAGE_ID = "manage"

const navSections: NavSection[] = [
  { id: "dashboard", title: "Dashboard", href: "/home" },
  { id: "browse", title: "Browse", href: "/browse" },
  {
    id: HACKATHONS_ID,
    title: "Hackathons",
    children: [
      { title: "Participating", href: "/home/participating" },
      { title: "Judging", href: "/home/judging" },
      { title: "Organizing", href: "/home/organizing" },
      { title: "Sponsoring", href: "/home/sponsoring" },
    ],
  },
  {
    id: MANAGE_ID,
    title: "Manage",
    children: [
      { title: "Settings", href: "/settings" },
      { title: "API Docs", href: "/docs" },
    ],
  },
]

function ActiveOrganizationChoice({ onOpen }: { onOpen: () => void }) {
  const { user } = useUser()
  const { organization } = useOrganization()

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center justify-between py-5 px-3 -mx-3 rounded-lg text-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
    >
      <span className="flex items-center gap-3">
        {organization?.imageUrl ? (
          <Image
            src={organization.imageUrl}
            alt={organization.name || "Organization"}
            width={28}
            height={28}
            className="size-7 rounded object-cover"
          />
        ) : (
          <div className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-semibold">
            {organization?.name?.charAt(0).toUpperCase() || user?.firstName?.charAt(0)?.toUpperCase() || "P"}
          </div>
        )}
        <span className="truncate">{organization?.name || "Personal Workspace"}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" />
    </button>
  )
}

function OrganizationChoices({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useUser()
  const { organization } = useOrganization()
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  })

  function activateOrganization(organizationId: string | null) {
    setActive?.({ organization: organizationId })
    onClose()
    if (pathname !== "/home") router.push("/home")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => activateOrganization(null)}
        className="flex items-center gap-3 py-5 px-3 -mx-3 rounded-lg text-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
      >
        <div className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-semibold">
          {user?.firstName?.charAt(0)?.toUpperCase() || "P"}
        </div>
        <span className="flex-1 text-left truncate">Personal Workspace</span>
        {!organization && <Check className="size-5 shrink-0" />}
      </button>

      {userMemberships?.data?.map((membership) => (
        <button
          key={membership.organization.id}
          type="button"
          onClick={() => activateOrganization(membership.organization.id)}
          className="flex items-center gap-3 py-5 px-3 -mx-3 rounded-lg text-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
        >
          {membership.organization.imageUrl ? (
            <Image
              src={membership.organization.imageUrl}
              alt={membership.organization.name}
              width={28}
              height={28}
              className="size-7 rounded object-cover"
            />
          ) : (
            <div className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-semibold">
              {membership.organization.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="flex-1 text-left truncate">{membership.organization.name}</span>
          {organization?.id === membership.organization.id && <Check className="size-5 shrink-0" />}
        </button>
      ))}

      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-3 py-5 px-3 -mx-3 rounded-lg text-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
      >
        <div className="flex size-7 items-center justify-center rounded bg-muted text-muted-foreground">
          <Plus className="size-4" />
        </div>
        <span>Create New Organization</span>
      </button>
    </>
  )
}

export function MobileHeader() {
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<NavSection | null>(null)
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isSignedIn, user } = useUser()
  const { openUserProfile, signOut } = useClerk()
  const { theme, setTheme } = useTheme()

  const close = useCallback(() => {
    setOpen(false)
    setActiveSection(null)
  }, [])

  useEffect(() => {
    queueMicrotask(close)
  }, [pathname, searchParams, close])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    const handleResize = () => {
      if (window.innerWidth >= 1024) close()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleResize)
    }
  }, [close, open])

  return (
    <>
      <header className="flex lg:hidden items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon-touch"
          onClick={() => setOpen(true)}
          aria-controls="mobile-navigation-menu"
          aria-expanded={open}
        >
          <Menu className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>
        <Link href={isSignedIn ? "/home" : "/"} className="font-bold text-lg">
          hackathon.new
        </Link>
        {isSignedIn && user && (
          <Button
            variant="ghost"
            size="icon-touch"
            className="ml-auto rounded-full"
            onClick={() => openUserProfile()}
          >
            {user.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={user.fullName || "User"}
                width={28}
                height={28}
                className="size-7 rounded-full"
              />
            ) : (
              <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {user.firstName?.charAt(0) || user.emailAddresses[0]?.emailAddress?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
          </Button>
        )}
      </header>

      {/* Full-screen menu overlay */}
      <div
        id="mobile-navigation-menu"
        className={`fixed inset-0 z-50 flex flex-col bg-background transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        aria-label="Navigation menu"
        inert={open ? undefined : true}
      >
        {/* Menu header */}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-bold text-lg">hackathon.new</span>
          <Button variant="ghost" size="icon-touch" onClick={close}>
            <X className="size-5" />
            <span className="sr-only">Close menu</span>
          </Button>
        </div>

        {/* Navigation panels */}
        <div className="relative flex-1 overflow-hidden">
          {/* Root level */}
          <nav
            className={`absolute inset-0 flex flex-col px-5 pt-4 overflow-y-auto transition-transform duration-250 ease-in-out ${
              activeSection ? "-translate-x-full" : "translate-x-0"
            }`}
            aria-hidden={Boolean(activeSection)}
            inert={activeSection ? true : undefined}
          >
            {isSignedIn && (
              <ActiveOrganizationChoice
                onOpen={() => setActiveSection({
                  id: ORG_SWITCHER_ID,
                  title: "Organization",
                  children: [],
                })}
              />
            )}

            {navSections.map((section) =>
              section.children ? (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section)}
                  className="flex items-center justify-between py-5 px-3 -mx-3 rounded-lg text-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
                >
                  {section.title}
                  <ChevronRight className="size-5" />
                </button>
              ) : (
                <Link
                  key={section.id}
                  href={section.href!}
                  className="py-5 px-3 -mx-3 rounded-lg text-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
                >
                  {section.title}
                </Link>
              )
            )}
          </nav>

          <nav
            className={`absolute inset-0 flex flex-col px-5 overflow-y-auto transition-transform duration-250 ease-in-out ${
              activeSection?.id === ORG_SWITCHER_ID ? "translate-x-0" : "translate-x-full"
            }`}
            aria-hidden={activeSection?.id !== ORG_SWITCHER_ID}
            inert={activeSection?.id === ORG_SWITCHER_ID ? undefined : true}
          >
            <button
              type="button"
              onClick={() => setActiveSection(null)}
              className="flex items-center gap-2 py-4 px-3 -mx-3 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <ChevronLeft className="size-4" />
              Organization
            </button>

            {isSignedIn && (
              <OrganizationChoices
                onClose={close}
                onCreate={() => {
                  close()
                  setCreateOrgOpen(true)
                }}
              />
            )}
          </nav>

          {navSections
            .filter((s) => s.children)
            .map((section) => (
              <nav
                key={section.id}
                className={`absolute inset-0 flex flex-col px-5 overflow-y-auto transition-transform duration-250 ease-in-out ${
                  activeSection?.id === section.id ? "translate-x-0" : "translate-x-full"
                }`}
                aria-hidden={activeSection?.id !== section.id}
                inert={activeSection?.id === section.id ? undefined : true}
              >
                <button
                  type="button"
                  onClick={() => setActiveSection(null)}
                  className="flex items-center gap-2 py-4 px-3 -mx-3 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ChevronLeft className="size-4" />
                  {section.title}
                </button>
                {section.children?.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className="py-5 px-3 -mx-3 rounded-lg text-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
                  >
                    {child.title}
                  </Link>
                ))}
                {section.id === HACKATHONS_ID && (
                  <CreateHackathonMenu
                    trigger={
                      <button
                        type="button"
                        className="flex items-center gap-3 py-5 px-3 -mx-3 rounded-lg text-xl text-primary hover:bg-accent active:text-primary/80 transition-colors"
                      >
                        <Plus className="size-5" />
                        Create Event
                      </button>
                    }
                  />
                )}
                {section.id === MANAGE_ID && (
                  <InstallSkillButton
                    trigger={
                      <button
                        type="button"
                        className="py-5 px-3 -mx-3 rounded-lg text-xl text-left text-muted-foreground hover:bg-accent hover:text-accent-foreground active:text-foreground transition-colors"
                      >
                        Install Skill
                      </button>
                    }
                  />
                )}
              </nav>
            ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-8 pt-4 space-y-4">
          {isSignedIn && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Theme</span>
              <div className="flex items-center gap-1">
                <Button
                  variant={theme === "light" ? "secondary" : "ghost"}
                  size="icon-touch"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="size-4" />
                  <span className="sr-only">Light theme</span>
                </Button>
                <Button
                  variant={theme === "dark" ? "secondary" : "ghost"}
                  size="icon-touch"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="size-4" />
                  <span className="sr-only">Dark theme</span>
                </Button>
                <Button
                  variant={theme === "system" ? "secondary" : "ghost"}
                  size="icon-touch"
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="size-4" />
                  <span className="sr-only">System theme</span>
                </Button>
              </div>
            </div>
          )}
          {isSignedIn ? (
            <Button
              variant="secondary"
              className="w-full h-12 text-base"
              onClick={() => {
                close()
                signOut({ redirectUrl: "/sign-in" })
              }}
            >
              Sign out
            </Button>
          ) : (
            <Button variant="secondary" className="w-full h-12 text-base" asChild>
              <Link href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}>
                Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isSignedIn && (
        <CreateOrganizationDialog
          open={createOrgOpen}
          onOpenChange={setCreateOrgOpen}
        />
      )}
    </>
  )
}
