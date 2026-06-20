import { describe, it, expect } from "bun:test"
import { htmlToPlainText } from "@/lib/services/participant-emails"

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
