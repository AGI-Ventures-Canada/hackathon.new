import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const mockFetch = mock(() => Promise.reject(new Error("Network error")))
globalThis.fetch = mockFetch as unknown as typeof fetch

const {
  listSocialSubmissions,
  reviewSocialSubmission,
  fetchOgMetadata,
  submitSocialUrl,
} = await import("@/lib/services/social-submissions")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const SUB_ID = "22222222-2222-2222-2222-222222222222"
const PARTICIPANT_ID = "33333333-3333-3333-3333-333333333333"

describe("social-submissions service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockFetch.mockReset()
    mockFetch.mockRejectedValue(new Error("Network error"))
  })

  describe("listSocialSubmissions", () => {
    it("returns submissions", async () => {
      const subs = [
        { id: SUB_ID, hackathon_id: HACKATHON_ID, team_id: null, participant_id: "p1", url: "https://twitter.com/post", platform: "twitter", og_title: "My Post", og_description: null, og_image_url: null, status: "pending", reviewed_at: null, created_at: "2026-04-01" },
      ]
      setMockFromImplementation(() => createChainableMock(mockSuccess(subs)))
      const result = await listSocialSubmissions(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].platform).toBe("twitter")
    })

    it("filters by status", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess([])))
      const result = await listSocialSubmissions(HACKATHON_ID, "approved")
      expect(result).toEqual([])
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await listSocialSubmissions(HACKATHON_ID)
      expect(result).toEqual([])
    })
  })

  describe("reviewSocialSubmission", () => {
    it("approves a submission", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess({ id: SUB_ID })))
      expect(await reviewSocialSubmission(SUB_ID, HACKATHON_ID, "approved")).toBe(true)
    })

    it("rejects a submission", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess({ id: SUB_ID })))
      expect(await reviewSocialSubmission(SUB_ID, HACKATHON_ID, "rejected")).toBe(true)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      expect(await reviewSocialSubmission(SUB_ID, HACKATHON_ID, "approved")).toBe(false)
    })

    it("returns false when the submission belongs to another hackathon", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      expect(await reviewSocialSubmission(SUB_ID, HACKATHON_ID, "approved")).toBe(false)
    })
  })

  describe("fetchOgMetadata", () => {
    it("returns null values on fetch failure", async () => {
      const result = await fetchOgMetadata("https://invalid.example.com/404")
      expect(result.title).toBeNull()
      expect(result.description).toBeNull()
      expect(result.imageUrl).toBeNull()
    })

    it("blocks redirects to private services", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }))

      const result = await fetchOgMetadata("https://example.com/post")

      expect(result).toEqual({ title: null, description: null, imageUrl: null })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("ignores HTML responses larger than one megabyte", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", {
        status: 200,
        headers: { "content-length": String(1024 * 1024 + 1) },
      }))

      expect(await fetchOgMetadata("https://example.com/post")).toEqual({
        title: null,
        description: null,
        imageUrl: null,
      })
    })
  })

  describe("submitSocialUrl", () => {
    it("rejects unsafe URL schemes before writing", async () => {
      const chain = createChainableMock(mockSuccess({ id: SUB_ID }))
      setMockFromImplementation(() => chain)

      expect(await submitSocialUrl(HACKATHON_ID, PARTICIPANT_ID, null, "javascript:alert(1)")).toBeNull()
      expect(chain.insert).not.toHaveBeenCalled()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("rejects insecure social URLs", async () => {
      const chain = createChainableMock(mockSuccess({ id: SUB_ID }))
      setMockFromImplementation(() => chain)

      expect(await submitSocialUrl(
        HACKATHON_ID,
        PARTICIPANT_ID,
        null,
        "http://x.com/example/status/123"
      )).toBeNull()
      expect(chain.insert).not.toHaveBeenCalled()
    })

    it("rejects URLs that only mention a social domain outside the hostname", async () => {
      const chain = createChainableMock(mockSuccess({ id: SUB_ID }))
      setMockFromImplementation(() => chain)

      expect(await submitSocialUrl(
        HACKATHON_ID,
        PARTICIPANT_ID,
        null,
        "https://example.com/?next=https://x.com/post"
      )).toBeNull()
      expect(chain.insert).not.toHaveBeenCalled()
    })

    it("accepts supported social domains", async () => {
      mockFetch.mockResolvedValueOnce(new Response("<html></html>", { status: 200 }))
      const submission = { id: SUB_ID, platform: "twitter" }
      const chain = createChainableMock(mockSuccess(submission))
      setMockFromImplementation(() => chain)

      expect(await submitSocialUrl(
        HACKATHON_ID,
        PARTICIPANT_ID,
        null,
        "https://mobile.x.com/example/status/123"
      )).toEqual(submission)
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ platform: "twitter" }))
    })
  })
})
