import { describe, it, expect } from "bun:test"
import { isValidSlugFormat, generateSlug } from "@/lib/utils/slug"

describe("slug validation regex", () => {
  describe("valid slugs", () => {
    it("accepts a simple lowercase slug", () => {
      expect(isValidSlugFormat("my-org")).toBe(true)
    })

    it("accepts a slug with numbers", () => {
      expect(isValidSlugFormat("team-42")).toBe(true)
    })

    it("accepts a slug that is all lowercase letters", () => {
      expect(isValidSlugFormat("acmecorp")).toBe(true)
    })

    it("accepts a slug that is all digits", () => {
      expect(isValidSlugFormat("123")).toBe(true)
    })

    it("accepts a slug with multiple hyphen-separated segments", () => {
      expect(isValidSlugFormat("my-cool-org")).toBe(true)
    })

    it("accepts a slug with mixed letters and digits in segments", () => {
      expect(isValidSlugFormat("abc123-def456")).toBe(true)
    })

    it("accepts a 3-character slug (minimum length)", () => {
      expect(isValidSlugFormat("abc")).toBe(true)
    })
  })

  describe("invalid slugs — length", () => {
    it("rejects a single character", () => {
      expect(isValidSlugFormat("a")).toBe(false)
    })

    it("rejects a two character slug", () => {
      expect(isValidSlugFormat("ab")).toBe(false)
    })

    it("rejects an empty string", () => {
      expect(isValidSlugFormat("")).toBe(false)
    })
  })

  describe("invalid slugs — hyphens", () => {
    it("rejects consecutive hyphens", () => {
      expect(isValidSlugFormat("my--org")).toBe(false)
    })

    it("rejects a slug starting with a hyphen", () => {
      expect(isValidSlugFormat("-myorg")).toBe(false)
    })

    it("rejects a slug ending with a hyphen", () => {
      expect(isValidSlugFormat("myorg-")).toBe(false)
    })

    it("rejects a slug that is only hyphens", () => {
      expect(isValidSlugFormat("---")).toBe(false)
    })

    it("rejects a slug with a leading and trailing hyphen", () => {
      expect(isValidSlugFormat("-my-org-")).toBe(false)
    })
  })

  describe("invalid slugs — forbidden characters", () => {
    it("rejects uppercase letters", () => {
      expect(isValidSlugFormat("My-Org")).toBe(false)
    })

    it("rejects underscores", () => {
      expect(isValidSlugFormat("my_org")).toBe(false)
    })

    it("rejects spaces", () => {
      expect(isValidSlugFormat("my org")).toBe(false)
    })

    it("rejects special characters", () => {
      expect(isValidSlugFormat("my@org")).toBe(false)
    })

    it("rejects dots", () => {
      expect(isValidSlugFormat("my.org")).toBe(false)
    })
  })

  describe("isValidSlugFormat enforces minimum length", () => {
    it("accepts valid slugs", () => {
      expect(isValidSlugFormat("my-org")).toBe(true)
      expect(isValidSlugFormat("abc")).toBe(true)
    })

    it("rejects slugs shorter than 3 characters", () => {
      expect(isValidSlugFormat("a")).toBe(false)
      expect(isValidSlugFormat("ab")).toBe(false)
    })

    it("rejects empty strings", () => {
      expect(isValidSlugFormat("")).toBe(false)
    })

    it("rejects invalid patterns", () => {
      expect(isValidSlugFormat("my--org")).toBe(false)
    })
  })
})

describe("generateSlug", () => {
  it("converts a name to lowercase kebab-case", () => {
    expect(generateSlug("My Organization")).toBe("my-organization")
  })

  it("strips special characters", () => {
    expect(generateSlug("Acme Corp!")).toBe("acme-corp")
  })

  it("collapses consecutive hyphens", () => {
    expect(generateSlug("my   org")).toBe("my-org")
  })

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("  My Org  ")).toBe("my-org")
  })

  it("produces a valid slug for typical org names", () => {
    const slug = generateSlug("AGI Ventures Canada")
    expect(isValidSlugFormat(slug)).toBe(true)
    expect(slug).toBe("agi-ventures-canada")
  })

  it("handles names with numbers", () => {
    expect(generateSlug("Team 42")).toBe("team-42")
  })

  it("returns empty string for empty input", () => {
    expect(generateSlug("")).toBe("")
  })

  it("handles names with only special characters", () => {
    expect(generateSlug("!!!")).toBe("")
  })
})
