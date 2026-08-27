import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock(() => {}) }),
}))
mock.module("@clerk/nextjs", () => ({
  useClerk: () => ({ openOrganizationProfile: mock(() => {}) }),
}))
mock.module("@/components/org/logo-upload-modal", () => ({
  LogoUploadModal: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
}))

const { ProfileForm } = await import(
  "@/app/(dashboard)/settings/profile/profile-form"
)

const initialData = {
  name: "Test Org",
  slug: null,
  logoUrl: null,
  logoUrlDark: null,
  description: null,
  websiteUrl: null,
}

afterEach(cleanup)

describe("ProfileForm", () => {
  it("waits until an empty slug is touched before showing an error", () => {
    render(<ProfileForm initialData={initialData} />)

    expect(screen.queryByText("Slug is required")).toBeNull()
    const input = screen.getByRole("textbox", { name: "URL Slug" })
    expect(input.getAttribute("aria-invalid")).toBe("false")

    fireEvent.blur(input)
    expect(screen.getByText("Slug is required")).toBeDefined()
    expect(input.getAttribute("aria-invalid")).toBe("true")
  })

  it("shows one clear error when an existing slug is removed", () => {
    render(<ProfileForm initialData={{ ...initialData, slug: "test-org" }} />)

    fireEvent.change(screen.getByRole("textbox", { name: "URL Slug" }), {
      target: { value: "" },
    })
    expect(screen.getByText("Slug is required")).toBeDefined()
    expect(screen.queryByText(/Must be at least/)).toBeNull()
  })
})
