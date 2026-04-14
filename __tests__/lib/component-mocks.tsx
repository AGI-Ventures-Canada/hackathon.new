import React from "react"
import { mock } from "bun:test"
import { clerkState, resetClerkState } from "./clerk-mock"

// ============================================================================
// Next.js Navigation State (shared via globalThis, registered in test-setup.ts)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

export function setPathname(pathname: string) {
  g.__nextNavState.pathname = pathname
}

export function setSearchParams(params: URLSearchParams) {
  g.__nextNavState.searchParams = params
}

export function setRouter(router: Record<string, unknown>) {
  g.__nextNavState.router = { ...g.__nextNavState.router, ...router }
}

export function getRouter() {
  return g.__nextNavState.router
}

// ============================================================================
// Clerk State (delegates to shared clerkState from clerk-mock)
// ============================================================================

export function setClerkAuth(auth: { isSignedIn?: boolean; userId?: string }) {
  if (auth.isSignedIn !== undefined) clerkState.isSignedIn = auth.isSignedIn
  if (auth.userId !== undefined) clerkState.userId = auth.userId
}

export function setClerkUser(user: Record<string, unknown> | null) {
  clerkState.user = user as typeof clerkState.user
}

export function setClerkIsSignedIn(isSignedIn: boolean) {
  clerkState.isSignedIn = isSignedIn
}

export function setClerkInstance(_clerk: Record<string, unknown>) {
  // No-op: openUserProfile/signOut are on clerkState directly
}

export function setClerkOrganization(org: Record<string, unknown> | null) {
  clerkState.organization = org as typeof clerkState.organization
}

export function setClerkMemberships(memberships: Array<Record<string, unknown>>) {
  clerkState.memberships = memberships as typeof clerkState.memberships
}

export function setClerkSetActive(fn: () => Promise<void>) {
  clerkState.setActive.mockImplementation(fn)
}

export function getSetActive() {
  return clerkState.setActive
}

// ============================================================================
// Configurable Component Mock Implementations
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createHackathonMenuImpl: (props: any) => React.ReactNode =
  ({ trigger }: { trigger: React.ReactNode }) => <div data-testid="create-hackathon-menu">{trigger}</div>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let installSkillButtonImpl: (props: any) => React.ReactNode =
  ({ trigger }: { trigger?: React.ReactNode }) => <div data-testid="install-skill-button">{trigger}</div>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createOrganizationDialogImpl: (props: any) => React.ReactNode =
  ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-org-dialog" /> : null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCreateHackathonMenu(impl: (props: any) => React.ReactNode) {
  createHackathonMenuImpl = impl
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setInstallSkillButton(impl: (props: any) => React.ReactNode) {
  installSkillButtonImpl = impl
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCreateOrganizationDialog(impl: (props: any) => React.ReactNode) {
  createOrganizationDialogImpl = impl
}

// Helpers to switch from stubs to real implementations (call in beforeEach)
export function useRealCreateHackathonMenu() {
  if (realCreateHackathonMenu) createHackathonMenuImpl = realCreateHackathonMenu
}

export function useRealInstallSkillButton() {
  if (realInstallSkillButton) installSkillButtonImpl = realInstallSkillButton
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let realCreateHackathonMenu: ((props: any) => React.ReactNode) | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let realInstallSkillButton: ((props: any) => React.ReactNode) | null = null

// ============================================================================
// Reset
// ============================================================================

export function resetComponentMocks() {
  g.__nextNavState.pathname = "/test"
  g.__nextNavState.searchParams = new URLSearchParams()
  g.__nextNavState.router = {
    push: mock(() => {}),
    refresh: mock(() => {}),
    replace: mock(() => {}),
    prefetch: mock(() => {}),
    back: mock(() => {}),
    forward: mock(() => {}),
  }
  resetClerkState()
  resetDialogMockState()
  createHackathonMenuImpl = ({ trigger }: { trigger: React.ReactNode }) => <div data-testid="create-hackathon-menu">{trigger}</div>
  installSkillButtonImpl = ({ trigger }: { trigger?: React.ReactNode }) => <div data-testid="install-skill-button">{trigger}</div>
  createOrganizationDialogImpl = ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-org-dialog" /> : null
}

// ============================================================================
// Dialog mock state (shared across all component tests)
// ============================================================================

let _dialogOpen = true
let _dialogOnOpenChange: ((v: boolean) => void) | undefined

export function getDialogOpen() { return _dialogOpen }
export function getDialogOnOpenChange() { return _dialogOnOpenChange }

export function resetDialogMockState() {
  _dialogOpen = true
  _dialogOnOpenChange = undefined
}

// ============================================================================
// mock.module registrations
// ============================================================================

// Mock leaf dependencies first

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => {
    if (open !== undefined) _dialogOpen = open
    else _dialogOpen = true
    _dialogOnOpenChange = onOpenChange
    return (
      <div>
        {_dialogOpen && onOpenChange && <button type="button" onClick={() => onOpenChange(false)}>Close Dialog</button>}
        {children}
      </div>
    )
  },
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    _dialogOpen ? <div role="dialog" className={className}>{children}</div> : null
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean; [key: string]: unknown }) => {
    const handleClick = () => _dialogOnOpenChange?.(!_dialogOpen)
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        onClick: handleClick,
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
      })
    }
    return <button type="button" onClick={handleClick} aria-haspopup="dialog" aria-expanded={false}>{children}</button>
  },
  DialogClose: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <button type="button" {...props}>{children}</button>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogOverlay: () => <div />,
  DialogPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Pre-import real component implementations (before mocking them)
// These load using the mocked dependencies above, so hooks/dialog are already shimmed.
const realMenuModule = await import("@/components/hackathon/create-hackathon-menu")
realCreateHackathonMenu = realMenuModule.CreateHackathonMenu as typeof realCreateHackathonMenu

const realSkillModule = await import("@/components/install-skill-button")
realInstallSkillButton = realSkillModule.InstallSkillButton as typeof realInstallSkillButton

// Step 3: Now mock the component modules with configurable closures.
// Default: stubs. Test files can call useReal*() or set*() to switch to real implementations.
mock.module("@/components/hackathon/create-hackathon-menu", () => ({
  CreateHackathonMenu: (props: Record<string, unknown>) => createHackathonMenuImpl(props),
}))

mock.module("@/components/install-skill-button", () => ({
  InstallSkillButton: (props: Record<string, unknown>) => installSkillButtonImpl(props),
}))

mock.module("@/components/create-organization-dialog", () => ({
  CreateOrganizationDialog: (props: Record<string, unknown>) =>
    createOrganizationDialogImpl(props),
}))
