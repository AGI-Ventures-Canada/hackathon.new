import { describe, it, expect } from "bun:test"
import {
  isSafeExternalUrl,
  isHttpsUrlWithoutCredentials,
  normalizeOptionalUrl,
  normalizeImportUrl,
  normalizeUrl,
  normalizeUrlFieldValue,
  redactImportSourceUrl,
  safeRedirectUrl,
  urlInputProps,
} from "@/lib/utils/url"

describe("isHttpsUrlWithoutCredentials", () => {
  it("accepts HTTPS URLs without user info", () => {
    expect(isHttpsUrlWithoutCredentials("https://example.com/path")).toBe(true)
  })

  it("rejects credentials and non-HTTPS URLs", () => {
    expect(isHttpsUrlWithoutCredentials("https://user:secret@example.com/path")).toBe(false)
    expect(isHttpsUrlWithoutCredentials("http://example.com/path")).toBe(false)
  })
})

describe("normalizeUrl", () => {
  it("prepends https:// when no protocol is present", () => {
    expect(normalizeUrl("github.com/user/repo")).toBe("https://github.com/user/repo")
  })

  it("preserves existing https://", () => {
    expect(normalizeUrl("https://github.com/user/repo")).toBe("https://github.com/user/repo")
  })

  it("preserves existing http://", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com")
  })

  it("handles case-insensitive protocol check", () => {
    expect(normalizeUrl("HTTPS://Example.com")).toBe("HTTPS://Example.com")
    expect(normalizeUrl("Http://Example.com")).toBe("Http://Example.com")
  })

  it("trims whitespace", () => {
    expect(normalizeUrl("  github.com/repo  ")).toBe("https://github.com/repo")
  })

  it("returns empty string for empty input", () => {
    expect(normalizeUrl("")).toBe("")
    expect(normalizeUrl("   ")).toBe("")
  })

  it("handles www. prefix without protocol", () => {
    expect(normalizeUrl("www.example.com")).toBe("https://www.example.com")
  })

  it("handles URLs with paths and query strings", () => {
    expect(normalizeUrl("example.com/path?q=1")).toBe("https://example.com/path?q=1")
  })
})

describe("normalizeUrlFieldValue", () => {
  it("returns a normalized URL for populated fields", () => {
    expect(normalizeUrlFieldValue("vercel.app/my-app")).toBe("https://vercel.app/my-app")
  })

  it("returns an empty string for blank fields", () => {
    expect(normalizeUrlFieldValue("   ")).toBe("")
  })
})

describe("normalizeOptionalUrl", () => {
  it("normalizes populated optional URLs", () => {
    expect(normalizeOptionalUrl("example.com")).toBe("https://example.com")
  })

  it("returns null for blank optional URL strings", () => {
    expect(normalizeOptionalUrl("   ")).toBeNull()
  })

  it("preserves null and undefined", () => {
    expect(normalizeOptionalUrl(null)).toBeNull()
    expect(normalizeOptionalUrl(undefined)).toBeUndefined()
  })
})

describe("import URL safety", () => {
  it("canonicalizes mixed-case HTTPS URLs", () => {
    expect(normalizeImportUrl("HTTPS://Events.Example/path")).toBe(
      "https://events.example/path"
    )
  })

  it("rejects mixed-case HTTP and private hosts", () => {
    const rejected = [
      "HtTp://events.example/path",
      "HtTp://169.254.169.254/latest/meta-data",
      "HTTPS://127.1/private",
      "HTTPS://LOCALHOST./private",
      "HTTPS://service.internal/private",
      "HTTPS://[::ffff:127.0.0.1]/private",
    ]

    for (const url of rejected) {
      expect(normalizeImportUrl(url)).toBeNull()
      expect(isSafeExternalUrl(url)).toBe(false)
      expect(redactImportSourceUrl(url)).toBeNull()
    }
  })

  it("rejects every reserved IPv4 range and local IPv6 form", () => {
    const rejectedHosts = [
      "0.1.2.3",
      "10.1.2.3",
      "100.64.0.1",
      "100.127.255.255",
      "169.254.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.19.255.255",
      "224.0.0.1",
      "[::]",
      "[::1]",
      "[fc00::1]",
      "[fd00::1]",
      "[fe80::1]",
      "[ff00::1]",
    ]

    for (const host of rejectedHosts) {
      expect(isSafeExternalUrl(`https://${host}/private`)).toBe(false)
    }
    expect(isSafeExternalUrl("https://203.0.113.8/public")).toBe(true)
  })

  it("rejects non-web schemes and ambiguous URL forms", () => {
    const rejected = [
      "ftp://events.example/file",
      "javascript:alert(1)",
      "//events.example/path",
      "https:events.example/path",
      "https://events.example\\@localhost/private",
    ]

    for (const url of rejected) {
      expect(normalizeImportUrl(url)).toBeNull()
      expect(isSafeExternalUrl(url)).toBe(false)
      expect(redactImportSourceUrl(url)).toBeNull()
    }
  })

  it("accepts exactly 2,048 characters and rejects 2,049", () => {
    const prefix = "https://events.example/"
    const exact = `${prefix}${"a".repeat(2_048 - prefix.length)}`

    expect(normalizeImportUrl(exact)).toBe(exact)
    expect(normalizeImportUrl(`${exact}a`)).toBeNull()
  })

  it("removes credentials, query secrets, and fragments from attribution", () => {
    const source = "https://user:password@events.example/path?invite_token=secret#private"

    expect(normalizeImportUrl(source)).toBeNull()
    expect(redactImportSourceUrl(source)).toBe("https://events.example/path")
  })

  it("does not turn an unsafe credentialed source into safe attribution", () => {
    expect(redactImportSourceUrl("https://user:secret@localhost/private")).toBeNull()
    expect(redactImportSourceUrl("http://user:secret@events.example/path")).toBeNull()
    expect(redactImportSourceUrl("https://user:secret@events.example/%0Ainjected")).toBeNull()
  })

  it("keeps a maximum-length Unicode source within the API limit", () => {
    const prefix = "https://events.example.com/"
    const source = `${prefix}${"界".repeat(2_048 - prefix.length)}`
    const redacted = redactImportSourceUrl(source)

    expect(redacted).toBe(source)
    expect(redacted).toHaveLength(2_048)
  })

  it("rejects malformed and oversized attribution after redaction", () => {
    expect(redactImportSourceUrl("https://[invalid/path")).toBeNull()
    expect(redactImportSourceUrl(`https://events.example/${"a".repeat(2_049)}`)).toBeNull()
    expect(isHttpsUrlWithoutCredentials("not a url")).toBe(false)
  })
})

describe("safeRedirectUrl", () => {
  it("returns relative paths as-is", () => {
    expect(safeRedirectUrl("/home")).toBe("/home")
    expect(safeRedirectUrl("/event/abc")).toBe("/event/abc")
    expect(safeRedirectUrl("/hackathons/123?tab=team")).toBe("/hackathons/123?tab=team")
  })

  it("rejects absolute URLs", () => {
    expect(safeRedirectUrl("https://evil.com")).toBe("/home")
    expect(safeRedirectUrl("http://evil.com/steal")).toBe("/home")
  })

  it("rejects protocol-relative URLs", () => {
    expect(safeRedirectUrl("//evil.com")).toBe("/home")
  })

  it("rejects backslash paths that browsers treat as another origin", () => {
    expect(safeRedirectUrl("/\\evil.com/steal")).toBe("/home")
  })

  it("uses only the first value from repeated query parameters", () => {
    expect(safeRedirectUrl(["/event/first", "/event/second"])).toBe("/event/first")
  })

  it("rejects a maximum-length CJK import URL as a direct auth redirect", () => {
    const prefix = "https://events.example.com/"
    const sourceUrl = `${prefix}${"界".repeat(2_048 - prefix.length)}`
    const importRedirect = `/import?${new URLSearchParams({
      url: sourceUrl,
      review: "true",
    })}`
    expect(sourceUrl).toHaveLength(2_048)
    expect(importRedirect).toContain("%E7%95%8C")
    expect(importRedirect.length).toBeGreaterThan(8_192)
    expect(safeRedirectUrl(importRedirect)).toBe("/home")
  })

  it("rejects control characters and oversized redirects", () => {
    expect(safeRedirectUrl("/event\n/next")).toBe("/home")
    expect(safeRedirectUrl(`/${"a".repeat(8_192)}`)).toBe("/home")
    expect(safeRedirectUrl(`//evil.example/${"a".repeat(8_192)}`)).toBe("/home")
  })

  it("returns fallback for undefined or empty", () => {
    expect(safeRedirectUrl(undefined)).toBe("/home")
    expect(safeRedirectUrl("")).toBe("/home")
  })

  it("uses a custom fallback when provided", () => {
    expect(safeRedirectUrl(undefined, "/dashboard")).toBe("/dashboard")
    expect(safeRedirectUrl("https://evil.com", "/dashboard")).toBe("/dashboard")
  })
})

describe("urlInputProps", () => {
  it("uses a tolerant text input with a URL keyboard", () => {
    expect(urlInputProps).toEqual({
      type: "text",
      inputMode: "url",
      autoCapitalize: "none",
      spellCheck: false,
    })
  })
})
