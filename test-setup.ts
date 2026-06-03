import { mock } from "bun:test"
import { createElement } from "react"
import { Window } from "happy-dom"
import "./__tests__/lib/supabase-mock"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = "0".repeat(64)
}

g.__nextNavState = {
  pathname: "/test",
  searchParams: new URLSearchParams(),
  router: {
    push: mock(() => {}),
    refresh: mock(() => {}),
    replace: mock(() => {}),
    prefetch: mock(() => {}),
    back: mock(() => {}),
    forward: mock(() => {}),
  },
}

mock.module("next/navigation", () => ({
  usePathname: () => g.__nextNavState.pathname,
  useSearchParams: () => g.__nextNavState.searchParams,
  useRouter: () => g.__nextNavState.router,
  redirect: mock(() => {}),
  notFound: mock(() => {}),
}))

g.__clerkState = {
  isSignedIn: true,
  userId: "user_123",
  orgId: null as string | null,
  user: { id: "user_123", fullName: "Test User", firstName: "Test", imageUrl: null },
  isLoaded: true,
  sessionLoaded: true,
  session: { id: "sess_123" } as { id: string } | null,
  organization: null as { id: string; name: string } | null,
  memberships: [] as Array<{ organization: { id: string; name: string; imageUrl: string | null } }>,
  setActive: mock(() => Promise.resolve()),
  openUserProfile: mock(() => {}),
  openOrganizationProfile: mock(() => {}),
  signOut: mock(() => Promise.resolve()),
  client: null as unknown,
  signInLoaded: false,
  signIn: null as unknown,
  signInSetActive: mock(() => Promise.resolve()),
  signUpLoaded: false,
  signUp: null as unknown,
  signUpSetActive: mock(() => Promise.resolve()),
  createOrganization: undefined as (() => Promise<unknown>) | undefined,
  setOrgActive: undefined as (() => Promise<void>) | undefined,
}

mock.module("@clerk/nextjs", () => ({
  OrganizationList: (props: Record<string, unknown>) =>
    createElement("div", { "data-testid": "organization-list", ...props }),
  useAuth: () => ({ isSignedIn: g.__clerkState.isSignedIn, isLoaded: g.__clerkState.isLoaded, userId: g.__clerkState.userId, orgId: g.__clerkState.orgId, getToken: () => Promise.resolve(null) }),
  AuthenticateWithRedirectCallback: (props: Record<string, unknown>) =>
    createElement("div", { "data-testid": "authenticate-with-redirect-callback", ...props }),
  useUser: () => ({ isLoaded: g.__clerkState.isLoaded, isSignedIn: g.__clerkState.isSignedIn, user: g.__clerkState.isSignedIn ? g.__clerkState.user : null }),
  useClerk: () => ({ openUserProfile: g.__clerkState.openUserProfile, openOrganizationProfile: g.__clerkState.openOrganizationProfile, signOut: g.__clerkState.signOut, client: g.__clerkState.client, setActive: g.__clerkState.setActive }),
  useSession: () => ({ isLoaded: g.__clerkState.sessionLoaded, session: g.__clerkState.session }),
  useOrganization: () => ({ organization: g.__clerkState.organization, isLoaded: g.__clerkState.isLoaded }),
  useOrganizationList: () => ({
    userMemberships: { data: g.__clerkState.memberships },
    setActive: g.__clerkState.setOrgActive ?? g.__clerkState.setActive,
    createOrganization: g.__clerkState.createOrganization,
    isLoaded: g.__clerkState.isLoaded,
  }),
  useSignIn: () => ({
    isLoaded: g.__clerkState.signInLoaded,
    signIn: g.__clerkState.signIn,
    setActive: g.__clerkState.signInSetActive,
  }),
  useSignUp: () => ({
    isLoaded: g.__clerkState.signUpLoaded,
    signUp: g.__clerkState.signUp,
    setActive: g.__clerkState.signUpSetActive,
  }),
  auth: mock(() => Promise.resolve({ userId: g.__clerkState.userId ?? "user_test", orgId: null })),
}))

mock.module("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (err: unknown) =>
    err !== null &&
    typeof err === "object" &&
    "errors" in (err as object) &&
    Array.isArray((err as { errors: unknown }).errors),
}))

mock.module("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
    return createElement("a", { href, ...props }, children)
  },
}))

const window = new Window()
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  NodeFilter: window.NodeFilter,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Text: window.Text,
  DocumentFragment: window.DocumentFragment,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  ResizeObserver: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})
