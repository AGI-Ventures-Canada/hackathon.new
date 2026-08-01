import { describe, it, expect, afterEach } from "bun:test"
import {
  extractEmailAddress,
  formatFromAddress,
  formatTimeLeft,
  shortHackathonName,
  buildMailtoUnsubscribeHeaders,
  htmlToPlainText,
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
    expect(extractEmailAddress("Acme <hello@example.com>")).toBe("hello@example.com")
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
    expect(formatFromAddress("Sarah", "Acme <hello@example.com>")).toBe(
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
    expect(result.length).toBeLessThanOrEqual(45)
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
    process.env.RESEND_REPLY_TO_EMAIL = "support@hackathon.new"
    process.env.RESEND_FROM_EMAIL = "noreply@hackathon.new"
    expect(buildMailtoUnsubscribeHeaders()).toEqual({
      "List-Unsubscribe": "<mailto:support@hackathon.new?subject=unsubscribe>",
    })
  })

  it("falls back to the from address", () => {
    delete process.env.RESEND_REPLY_TO_EMAIL
    process.env.RESEND_FROM_EMAIL = "noreply@hackathon.new"
    expect(buildMailtoUnsubscribeHeaders()).toEqual({
      "List-Unsubscribe": "<mailto:noreply@hackathon.new?subject=unsubscribe>",
    })
  })

  it("extracts the bare address from a 'Name <email>' fallback to avoid nested brackets", () => {
    delete process.env.RESEND_REPLY_TO_EMAIL
    process.env.RESEND_FROM_EMAIL = "hackathon.new <noreply@hackathon.new>"
    expect(buildMailtoUnsubscribeHeaders()).toEqual({
      "List-Unsubscribe": "<mailto:noreply@hackathon.new?subject=unsubscribe>",
    })
  })

  it("omits the one-click POST header (mailto-only is not RFC 8058 one-click)", () => {
    process.env.RESEND_REPLY_TO_EMAIL = "support@hackathon.new"
    expect(buildMailtoUnsubscribeHeaders()).not.toHaveProperty("List-Unsubscribe-Post")
  })

  it("returns undefined when no sender address is configured", () => {
    delete process.env.RESEND_REPLY_TO_EMAIL
    delete process.env.RESEND_FROM_EMAIL
    expect(buildMailtoUnsubscribeHeaders()).toBeUndefined()
  })

  it("fails safe (returns undefined) for a malformed or injected address", () => {
    process.env.RESEND_REPLY_TO_EMAIL = "support@hackathon.new\r\nBcc: evil@x.com"
    expect(buildMailtoUnsubscribeHeaders()).toBeUndefined()
    process.env.RESEND_REPLY_TO_EMAIL = "not-an-email"
    expect(buildMailtoUnsubscribeHeaders()).toBeUndefined()
  })
})

describe("htmlToPlainText", () => {
  it("strips tags and keeps the text", () => {
    expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world")
  })

  it("turns block-level closes and <br> into newlines", () => {
    expect(htmlToPlainText("<p>One</p><p>Two</p>")).toBe("One\nTwo")
    expect(htmlToPlainText("Line one<br/>Line two")).toBe("Line one\nLine two")
  })

  it("removes style and script blocks entirely", () => {
    const html = "<style>.x{color:red}</style><p>Keep</p><script>alert(1)</script>"
    expect(htmlToPlainText(html)).toBe("Keep")
  })

  it("strips HTML comments, including conditional comments containing '>'", () => {
    expect(htmlToPlainText("<p>Hi<!-- secret --> there</p>")).toBe("Hi there")
    expect(htmlToPlainText("<!--[if mso]><b>x</b><![endif]--><p>Real</p>")).toBe("Real")
  })

  it("decodes common HTML entities", () => {
    expect(htmlToPlainText("<p>Tom &amp; Jerry &lt;3 &nbsp;you</p>")).toBe("Tom & Jerry <3 you")
  })

  it("decodes quotes, dashes, and apostrophes", () => {
    expect(htmlToPlainText("<p>&quot;Build&quot; &mdash; it&apos;s ready &ndash; go</p>")).toBe(
      '"Build" — it\'s ready – go'
    )
  })

  it("decodes decimal and hex numeric character references", () => {
    expect(htmlToPlainText("<p>caf&#233; &#x2014; rest&#x6f;n</p>")).toBe("café — reston")
  })

  it("leaves unknown and out-of-range references untouched", () => {
    expect(htmlToPlainText("<p>&copy; 2026 &#999999999;</p>")).toBe("&copy; 2026 &#999999999;")
  })

  it("collapses excess blank lines and horizontal whitespace", () => {
    expect(htmlToPlainText("<div>A</div><div></div><div></div><div>B</div>")).toBe("A\n\nB")
    expect(htmlToPlainText("<p>spaced    out    text</p>")).toBe("spaced out text")
  })

  it("returns an empty string for markup with no text", () => {
    expect(htmlToPlainText("<div></div>")).toBe("")
  })
})
