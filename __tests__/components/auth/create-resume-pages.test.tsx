import { beforeEach, describe, expect, it, mock } from "bun:test"
import { render, screen } from "@testing-library/react"
import { mockAuth } from "../../lib/supabase-mock"
import type { EventPageData } from "@/lib/services/event-page-import"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

const mockExtractEvent = mock<(
  url: string,
) => Promise<EventPageData | null>>((_url: string) =>
  Promise.resolve({
    name: "Imported event",
    description: "A useful event",
    startsAt: "2026-09-01T13:00:00.000Z",
    endsAt: "2026-09-01T21:00:00.000Z",
    locationType: "virtual" as const,
    locationName: null,
    locationUrl: "https://meet.example.com/event",
    imageUrl: null,
    language: "en",
    translationLinks: [],
  }),
)
const mockExtractRich = mock((_url: string) =>
  Promise.resolve({
    sponsors: [],
    rules: null,
    prizes: [],
    challenges: [],
    translationLinks: [],
    agendaItems: [],
    cleanedDescription: null,
  }),
)
const mockConsumeRateLimit = mock((_headers: Headers) =>
  Promise.resolve({ allowed: true }),
)

mock.module("@/app/(auth)/sign-in/[[...sign-in]]/custom-sign-in", () => ({
  CustomSignIn: (props: Record<string, unknown>) => (
    <div data-testid="custom-sign-in" data-props={JSON.stringify(props)} />
  ),
}))

mock.module("@/app/(auth)/sign-up/[[...sign-up]]/custom-sign-up", () => ({
  CustomSignUp: (props: Record<string, unknown>) => (
    <div data-testid="custom-sign-up" data-props={JSON.stringify(props)} />
  ),
}))

mock.module("@/components/auth/create-org-form", () => ({
  CreateOrgForm: (props: Record<string, unknown>) => (
    <div data-testid="create-org-form" data-props={JSON.stringify(props)} />
  ),
}))

mock.module("@/components/hackathon/event-import-editor", () => ({
  EventImportEditor: (props: Record<string, unknown>) => (
    <div data-testid="event-import-editor" data-props={JSON.stringify(props)} />
  ),
  EventImportRecovery: (props: Record<string, unknown>) => (
    <div data-testid="event-import-recovery" data-props={JSON.stringify(props)} />
  ),
}))

mock.module("@/lib/services/external-import", () => ({
  extractExternalEventData: (...args: [string]) => mockExtractEvent(...args),
  extractExternalRichContent: (...args: [string]) => mockExtractRich(...args),
}))

mock.module("@/lib/services/public-import-rate-limit", () => ({
  consumePublicImportRateLimit: (...args: [Headers]) =>
    mockConsumeRateLimit(...args),
}))

mock.module("@/lib/utils/ttl-cache", () => ({
  ttlCache: (_key: string, load: () => Promise<unknown>) => load(),
}))

mock.module("@/lib/utils/hash", () => ({
  sha256Fingerprint: () => Promise.resolve("safe-fingerprint"),
}))

mock.module("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ "x-forwarded-for": "192.0.2.1" })),
}))

const { default: SignInPage } = await import(
  "@/app/(auth)/sign-in/[[...sign-in]]/page"
)
const { default: SignUpPage } = await import(
  "@/app/(auth)/sign-up/[[...sign-up]]/page"
)
const { default: OnboardingPage } = await import("@/app/onboarding/page")
const { default: ResumeCreatePage } = await import(
  "@/app/(public)/resume-create/page"
)
const {
  default: EventImportPage,
  generateMetadata,
} = await import("@/app/(public)/import/page")

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockImplementation(() =>
    Promise.resolve({ userId: null, orgId: null, orgRole: null }),
  )
  g.__nextNavRedirect.mockClear()
  mockExtractEvent.mockClear()
  mockExtractRich.mockClear()
  mockConsumeRateLimit.mockReset()
  mockConsumeRateLimit.mockImplementation(() =>
    Promise.resolve({ allowed: true }),
  )
})

function propsFrom(testId: string) {
  return JSON.parse(screen.getByTestId(testId).getAttribute("data-props")!)
}

describe("creation and auth page boundaries", () => {
  it("keeps a safe creation target and bounded email on sign in", async () => {
    const element = await SignInPage({
      searchParams: Promise.resolve({
        redirect_url: "/resume-create?token=abc",
        email: [`${"a".repeat(300)}@example.com`],
      }),
    })
    render(element)

    expect(propsFrom("custom-sign-in")).toEqual({
      redirectUrl: "/resume-create?token=abc",
      initialEmail: `${"a".repeat(300)}@example.com`.slice(0, 254),
    })
  })

  it("redirects an already signed-in user only to a safe target", async () => {
    mockAuth.mockImplementation(() =>
      Promise.resolve({ userId: "user_1", orgId: "org_1", orgRole: null }),
    )

    await SignInPage({
      searchParams: Promise.resolve({ redirect_url: "https://evil.example" }),
    })

    expect(g.__nextNavRedirect).toHaveBeenCalledWith("/home")
  })

  it("uses onboarding defaults on sign up without leaking an unused email", async () => {
    const element = await SignUpPage({
      searchParams: Promise.resolve({ email: "private@example.com" }),
    })
    render(element)

    expect(propsFrom("custom-sign-up")).toEqual({})
  })

  it("resumes a signed-in sign-up at the requested page", async () => {
    mockAuth.mockImplementation(() =>
      Promise.resolve({ userId: "user_1", orgId: null, orgRole: null }),
    )

    await SignUpPage({
      searchParams: Promise.resolve({ redirect_url: "/create?review=true" }),
    })

    expect(g.__nextNavRedirect).toHaveBeenCalledWith("/create?review=true")
  })

  it("routes signed-out onboarding through sign in with its safe target", async () => {
    await OnboardingPage({
      searchParams: Promise.resolve({ redirect_url: "/create?review=true" }),
    })

    expect(g.__nextNavRedirect).toHaveBeenCalledWith(
      "/sign-in?redirect_url=%2Fonboarding%3Fredirect_url%3D%252Fcreate%253Freview%253Dtrue",
    )
  })

  it("renders organization setup for a signed-in user without an org", async () => {
    mockAuth.mockImplementation(() =>
      Promise.resolve({ userId: "user_1", orgId: null, orgRole: null }),
    )
    const element = await OnboardingPage({
      searchParams: Promise.resolve({ redirect_url: "/create?review=true" }),
    })
    render(element)

    expect(propsFrom("create-org-form")).toEqual({
      redirectUrl: "/create?review=true",
      skipUrl: "/create?review=true",
    })
  })

  it("redirects an onboarded user to the safe destination", async () => {
    mockAuth.mockImplementation(() =>
      Promise.resolve({ userId: "user_1", orgId: "org_1", orgRole: null }),
    )

    await OnboardingPage({
      searchParams: Promise.resolve({
        redirect_url: ["https://evil.example/steal", "/ignored"],
      }),
    })

    expect(g.__nextNavRedirect).toHaveBeenCalledWith("/home")
  })

  it("keeps the default onboarding route across sign in", async () => {
    await OnboardingPage({ searchParams: Promise.resolve({}) })

    expect(g.__nextNavRedirect).toHaveBeenCalledWith(
      "/sign-in?redirect_url=%2Fonboarding",
    )
  })

  it("renders the resume client inside a suspense boundary", () => {
    const element = ResumeCreatePage()
    expect(element.props.fallback).toBeDefined()
    expect(element.props.children).toBeDefined()
  })

  it("rejects an unsafe import URL without requesting it", async () => {
    const element = await EventImportPage({
      searchParams: Promise.resolve({ url: "http://127.0.0.1/private" }),
    })
    render(element)

    expect(screen.getByText("That event link won't work")).toBeDefined()
    expect(mockExtractEvent).not.toHaveBeenCalled()
  })

  it("builds metadata and an editor from one normalized public URL", async () => {
    const searchParams = Promise.resolve({
      url: "https://events.example.com/hackathon?invite=secret",
    })
    const metadata = await generateMetadata({ searchParams })
    expect(metadata.title).toBe('Import "Imported event" | hackathon.new')

    const element = await EventImportPage({ searchParams })
    render(element)
    const props = propsFrom("event-import-editor")
    expect(props.sourceUrl).toBe("https://events.example.com/hackathon")
    expect(props.storageKey).toBe(
      "oatmeal:external-import:safe-fingerprint",
    )
    expect(props.submitPath).toBe("/api/dashboard/import/event")
  })

  it("falls back to a saved import draft when public reads are rate limited", async () => {
    mockConsumeRateLimit.mockImplementationOnce(() =>
      Promise.resolve({ allowed: false }),
    )
    const element = await EventImportPage({
      searchParams: Promise.resolve({
        url: "https://events.example.com/rate-limited",
      }),
    })
    render(element)

    expect(screen.getByTestId("event-import-recovery")).toBeDefined()
    expect(mockExtractEvent).not.toHaveBeenCalled()
  })

  it("keeps a saved import recovery path when the public page cannot be read", async () => {
    mockExtractEvent.mockImplementation(() => Promise.resolve(null))
    const searchParams = Promise.resolve({
      url: "https://events.example.com/unreadable?invite=secret",
    })

    expect(await generateMetadata({ searchParams })).toEqual({
      title: "Import from Event Page | hackathon.new",
    })
    const element = await EventImportPage({ searchParams })
    render(element)

    expect(propsFrom("event-import-recovery")).toEqual(expect.objectContaining({
      sourceUrl: "https://events.example.com/unreadable",
      storageKey: "oatmeal:external-import:safe-fingerprint",
      submitPath: "/api/dashboard/import/event",
    }))
    expect(mockExtractRich).not.toHaveBeenCalled()
  })
})
