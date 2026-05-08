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

  it("rejects when hackathon does not require terms", async () => {
    await expect(
      recordTermsAcceptance(
        { id: HACKATHON_ID, require_terms_acceptance: false, terms_content: "x" },
        USER_ID,
        "any"
      )
    ).rejects.toThrow(/does not require/)
  })

  it("rejects when expectedHash does not match current content hash", async () => {
    await expect(
      recordTermsAcceptance(
        { id: HACKATHON_ID, require_terms_acceptance: true, terms_content: "current" },
        USER_ID,
        "stale-hash"
      )
    ).rejects.toThrow(/mismatch/)
  })

  it("upserts when hash matches", async () => {
    const content = "Hello world"
    const hash = await hashTerms(content)
    mockTableQuery("hackathon_terms_acceptances", mockSuccess({ id: "row" }))

    await recordTermsAcceptance(
      { id: HACKATHON_ID, require_terms_acceptance: true, terms_content: content },
      USER_ID,
      hash
    )
  })

  it("propagates errors from supabase", async () => {
    const content = "Hello world"
    const hash = await hashTerms(content)
    mockTableQuery("hackathon_terms_acceptances", mockError("upsert failed"))

    await expect(
      recordTermsAcceptance(
        { id: HACKATHON_ID, require_terms_acceptance: true, terms_content: content },
        USER_ID,
        hash
      )
    ).rejects.toThrow(/upsert failed/)
  })
})
