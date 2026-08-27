import { describe, expect, it } from "bun:test"
import { getVerifiedUserEmails } from "@/lib/auth/verified-emails"

describe("getVerifiedUserEmails", () => {
  it("returns every verified address in normalized form", () => {
    expect(getVerifiedUserEmails({
      emailAddresses: [
        { emailAddress: "Primary@Example.com", verification: { status: "verified" } },
        { emailAddress: "captain@example.com", verification: { status: "verified" } },
        { emailAddress: "pending@example.com", verification: { status: "unverified" } },
        { emailAddress: "CAPTAIN@example.com", verification: { status: "verified" } },
      ],
    })).toEqual(["primary@example.com", "captain@example.com"])
  })
})
