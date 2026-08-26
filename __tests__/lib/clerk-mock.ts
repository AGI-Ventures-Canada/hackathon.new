// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

if (!g.__clerkState) {
  throw new Error("test-setup.ts must be loaded before clerk-mock.ts — ensure it is listed in the bun preload config")
}

export const clerkState = g.__clerkState

export function resetClerkState() {
  clerkState.isSignedIn = true
  clerkState.userId = "user_123"
  clerkState.orgId = null
  clerkState.user = {
    id: "user_123",
    fullName: "Test User",
    firstName: "Test",
    imageUrl: null,
  }
  clerkState.isLoaded = true
  clerkState.sessionLoaded = true
  clerkState.session = { id: "sess_123" }
  clerkState.organization = null
  clerkState.memberships = []
  clerkState.setActive.mockClear()
  clerkState.has.mockReset()
  clerkState.has.mockImplementation(() => true)
  clerkState.getToken.mockReset()
  clerkState.getToken.mockImplementation(() => Promise.resolve("test-token"))
  clerkState.openUserProfile.mockClear()
  clerkState.openOrganizationProfile.mockClear()
  clerkState.signOut.mockClear()
  clerkState.client = null
  clerkState.signInLoaded = false
  clerkState.signIn = null
  clerkState.signInSetActive.mockClear()
  clerkState.signUpLoaded = false
  clerkState.signUp = null
  clerkState.signUpSetActive.mockClear()
  clerkState.createOrganization = undefined
  clerkState.setOrgActive = undefined
}

export const clerkMock = {
  useUser: () => ({
    isSignedIn: clerkState.isSignedIn,
    user: clerkState.isSignedIn ? clerkState.user : null,
    isLoaded: clerkState.isLoaded,
  }),
  useAuth: () => ({
    isSignedIn: clerkState.isSignedIn,
    isLoaded: clerkState.isLoaded,
    userId: clerkState.userId,
    getToken: clerkState.getToken,
    has: clerkState.has,
  }),
  useClerk: () => ({
    openUserProfile: clerkState.openUserProfile,
    openOrganizationProfile: clerkState.openOrganizationProfile,
    signOut: clerkState.signOut,
    client: clerkState.client,
    setActive: clerkState.setActive,
  }),
  useSession: () => ({
    session: clerkState.session,
    isLoaded: clerkState.sessionLoaded,
  }),
  useOrganization: () => ({
    organization: clerkState.organization,
    isLoaded: clerkState.isLoaded,
  }),
  useOrganizationList: () => ({
    userMemberships: {
      data: clerkState.memberships,
      isLoading: false,
      isFetching: false,
      hasNextPage: false,
      fetchNext: () => {},
    },
    setActive: clerkState.setOrgActive ?? clerkState.setActive,
    createOrganization: clerkState.createOrganization,
    isLoaded: clerkState.isLoaded,
  }),
  useSignIn: () => ({
    isLoaded: clerkState.signInLoaded,
    signIn: clerkState.signIn,
    setActive: clerkState.signInSetActive,
  }),
  useSignUp: () => ({
    isLoaded: clerkState.signUpLoaded,
    signUp: clerkState.signUp,
    setActive: clerkState.signUpSetActive,
  }),
}
