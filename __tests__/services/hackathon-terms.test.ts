import { describe, it, expect, beforeEach } from "bun:test"
import {
  resetSupabaseMocks,
  mockTableQuery,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"
import { hashTerms } from "@/lib/utils/terms-hash"

const {
  currentTermsHash,
  recordTermsAcceptance,
} = await import("@/lib/services/hackathon-terms")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const USER_ID = "user_abc"

describe("currentTermsHash", () => {
  it("returns null when require_terms_acceptance is false", async () => {
    expect(
      await currentTermsHash({ require_terms_acceptance: false, terms_content: "anything" })
    ).toBeNull()
  })

  it("returns null when terms_content is empty", async () => {
    expect(
      await currentTermsHash({ require_terms_acceptance: true, terms_content: "" })
    ).toBeNull()
    expect(
      await currentTermsHash({ require_terms_acceptance: true, terms_content: "   " })
    ).toBeNull()
    expect(
      await currentTermsHash({ require_terms_acceptance: true, terms_content: null })
    ).toBeNull()
  })

  it("returns sha256 hash of trimmed content when enabled", async () => {
    const content = "## My Terms\n\nBe nice."
    expect(
      await currentTermsHash({ require_terms_acceptance: true, terms_content: content })
    ).toBe(await hashTerms(content))
  })

  it("differs when content changes", async () => {
    const a = await currentTermsHash({ require_terms_acceptance: true, terms_content: "v1" })
    const b = await currentTermsHash({ require_terms_acceptance: true, terms_content: "v2" })
    expect(a).not.toBe(b)
  })
})

describe("recordTermsAcceptance", () => {
  beforeEach(() => resetSupabaseMocks())

  it("upserts the provided hash", async () => {
    const hash = await hashTerms("Hello world")
    mockTableQuery("hackathon_terms_acceptances", mockSuccess({ id: "row" }))

    await recordTermsAcceptance(HACKATHON_ID, USER_ID, hash)
  })

  it("propagates errors from supabase", async () => {
    const hash = await hashTerms("Hello world")
    mockTableQuery("hackathon_terms_acceptances", mockError("upsert failed"))

    await expect(
      recordTermsAcceptance(HACKATHON_ID, USER_ID, hash)
    ).rejects.toThrow(/upsert failed/)
  })
})
