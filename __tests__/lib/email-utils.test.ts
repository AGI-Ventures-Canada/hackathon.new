import { describe, it, expect, afterEach } from "bun:test"
import {
  extractEmailAddress,
  formatFromAddress,
  formatTimeLeft,
  shortHackathonName,
  buildMailtoUnsubscribeHeaders,
} from "@/lib/email/utils"

describe("formatTimeLeft", () => {
  it("returns days for time more than 24 hours away", () => {
    const threedays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const result = formatTimeLeft(threedays)
    expect(result).toMatch(/^\d+ days?$/)
  })

  it("returns hours for time less than 24 hours away", () => {
    const twelveHours = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    const result = formatTimeLeft(twelveHours)
    expect(result).toMatch(/^\d+ hours?$/)
  })

  it("returns 1 hour for singular", () => {
    const oneHour = new Date(Date.now() + 90 * 60 * 1000).toISOString()
    const result = formatTimeLeft(oneHour)
    expect(result).toBe("1 hour")
  })

  it("returns 'less than an hour' for sub-hour future dates", () => {
    const thirtyMin = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const result = formatTimeLeft(thirtyMin)
    expect(result).toBe("less than an hour")
  })

  it("returns 'less than an hour' for expired dates", () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const result = formatTimeLeft(past)
    expect(result).toBe("less than an hour")
  })

  it("returns 1 day for exactly 24 hours", () => {
    const oneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const result = formatTimeLeft(oneDay)
    expect(result).toBe("1 day")
  })
})

describe("extractEmailAddress", () => {
  it("returns a bare address unchanged", () => {
    expect(extractEmailAddress("hello@example.com")).toBe("hello@example.com")
  })

  it("extracts the address from a Name <email> form", () => {
    expect(extractEmailAddress("Oatmeal <hello@example.com>")).toBe("hello@example.com")
  })

  it("trims whitespace around the address", () => {
    expect(extractEmailAddress("  hello@example.com  ")).toBe("hello@example.com")
    expect(extractEmailAddress("Name < hello@example.com >")).toBe("hello@example.com")
  })
})

describe("formatFromAddress", () => {
  it("formats a simple display name as Name <email>", () => {
    expect(formatFromAddress("Sarah Chen", "hello@example.com")).toBe(
      "Sarah Chen <hello@example.com>"
    )
  })

  it("falls back to the bare email when display name is empty", () => {
    expect(formatFromAddress("", "hello@example.com")).toBe("hello@example.com")
    expect(formatFromAddress("   ", "hello@example.com")).toBe("hello@example.com")
  })

  it("quotes display names containing RFC 5322 specials", () => {
    expect(formatFromAddress("Doe, Jane", "hello@example.com")).toBe(
      '"Doe, Jane" <hello@example.com>'
    )
    expect(formatFromAddress("Sarah (admin)", "hello@example.com")).toBe(
      '"Sarah (admin)" <hello@example.com>'
    )
  })

  it("escapes embedded quotes and backslashes inside the quoted name", () => {
    expect(formatFromAddress('She said "hi"', "hello@example.com")).toBe(
      '"She said \\"hi\\"" <hello@example.com>'
    )
    expect(formatFromAddress("path\\name, foo", "hello@example.com")).toBe(
      '"path\\\\name, foo" <hello@example.com>'
    )
  })

  it("strips CR/LF to prevent header injection", () => {
    expect(
      formatFromAddress(
        "Sarah\r\nBcc: attacker@example.com",
        "hello@example.com"
      )
    ).toBe('"Sarah Bcc: attacker@example.com" <hello@example.com>')
  })

  it("uses the inner address when given a Name <email> base", () => {
    expect(formatFromAddress("Sarah", "Oatmeal <hello@example.com>")).toBe(
      "Sarah <hello@example.com>"
    )
  })

  it("quotes display names with non-ASCII characters", () => {
    expect(formatFromAddress("Renée", "hello@example.com")).toBe(
      '"Renée" <hello@example.com>'
    )
  })
})

describe("shortHackathonName", () => {
  it("returns a short name unchanged", () => {
    expect(shortHackathonName("AI Hackathon")).toBe("AI Hackathon")
  })

  it("drops everything after the first pipe", () => {
    expect(
      shortHackathonName("Hackers & Healers | AI in Healthcare Co-Design Hackathon")
    ).toBe("Hackers & Healers")
  })

  it("collapses internal whitespace", () => {
    expect(shortHackathonName("Big   Build   Weekend")).toBe("Big Build Weekend")
  })

  it("truncates a long name on a word boundary with an ellipsis", () => {
    const result = shortHackathonName(
      "The Worldwide Collegiate Artificial Intelligence Builders Championship"
    )
    expect(result.length).toBeLessThanOrEqual(46)
    expect(result.endsWith("…")).toBe(true)
    expect(result).not.toContain("  ")
  })

  it("falls back to the trimmed full name when the part before the pipe is empty", () => {
    expect(shortHackathonName("| Edge Case")).toBe("Edge Case")
  })
})

describe("buildMailtoUnsubscribeHeaders", () => {
  const originalReplyTo = process.env.RESEND_REPLY_TO_EMAIL
  const originalFrom = process.env.RESEND_FROM_EMAIL

  afterEach(() => {
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO_EMAIL
    else process.env.RESEND_REPLY_TO_EMAIL = originalReplyTo
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL
    else process.env.RESEND_FROM_EMAIL = originalFrom
  })

  it("prefers the reply-to address", () => {
    process.env.RESEND_REPLY_TO_EMAIL = "support@getoatmeal.com"
    process.env.RESEND_FROM_EMAIL = "noreply@getoatmeal.com"
    expect(buildMailtoUnsubscribeHeaders()).toEqual({
      "List-Unsubscribe": "<mailto:support@getoatmeal.com?subject=unsubscribe>",
    })
  })

  it("falls back to the from address", () => {
    delete process.env.RESEND_REPLY_TO_EMAIL
    process.env.RESEND_FROM_EMAIL = "noreply@getoatmeal.com"
    expect(buildMailtoUnsubscribeHeaders()).toEqual({
      "List-Unsubscribe": "<mailto:noreply@getoatmeal.com?subject=unsubscribe>",
    })
  })

  it("omits the one-click POST header (mailto-only is not RFC 8058 one-click)", () => {
    process.env.RESEND_REPLY_TO_EMAIL = "support@getoatmeal.com"
    expect(buildMailtoUnsubscribeHeaders()).not.toHaveProperty("List-Unsubscribe-Post")
  })

  it("returns undefined when no sender address is configured", () => {
    delete process.env.RESEND_REPLY_TO_EMAIL
    delete process.env.RESEND_FROM_EMAIL
    expect(buildMailtoUnsubscribeHeaders()).toBeUndefined()
  })
})
