import { describe, it, expect, beforeEach, mock } from "bun:test"
import { mockFrom, mockRpc } from "../lib/supabase-mock"

const mockFetch = mock(() => Promise.resolve(new Response("")))
globalThis.fetch = mockFetch as unknown as typeof fetch

const mockUpload = mock(() => Promise.resolve({ error: null }))
const mockRemove = mock(() => Promise.resolve({ error: null }))
const mockGetPublicUrl = mock(() => ({ data: { publicUrl: "https://storage.test/file.webp" } }))
const mockStorageFrom = mock(() => ({
  upload: mockUpload,
  remove: mockRemove,
  getPublicUrl: mockGetPublicUrl,
}))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
    storage: {
      from: mockStorageFrom,
    },
  }),
}))

const mockSharpInstance = {
  metadata: mock(() => Promise.resolve({ width: 800, height: 600 })),
  resize: mock(() => mockSharpInstance),
  webp: mock(() => mockSharpInstance),
  clone: mock(() => mockSharpInstance),
  toBuffer: mock(() => Promise.resolve(Buffer.alloc(100 * 1024))),
}
const mockSharp = mock(() => mockSharpInstance)
let sharpModuleLoadCount = 0

mock.module("sharp", () => {
  sharpModuleLoadCount += 1
  return { default: mockSharp }
})

const {
  ImageTooLargeError,
  optimizeImage,
  optimizeBanner,
  optimizeScreenshot,
  uploadLogo,
  deleteLogo,
  uploadBanner,
  deleteBanner,
  uploadScreenshot,
  uploadScreenshotVersion,
  deleteScreenshotVersion,
  deleteScreenshot,
  uploadSponsorLogo,
  deleteSponsorLogo,
  downloadAndUploadBanner,
  optimizeHeadshot,
  uploadJudgeHeadshot,
  deleteJudgeHeadshot,
} = await import("@/lib/services/storage")
const sharpModuleLoadsAtStorageImport = sharpModuleLoadCount

describe("Storage Service", () => {
  beforeEach(() => {
    mockUpload.mockClear()
    mockRemove.mockClear()
    mockGetPublicUrl.mockClear()
    mockStorageFrom.mockClear()
    mockSharp.mockClear()
    mockSharpInstance.metadata.mockClear()
    mockSharpInstance.resize.mockClear()
    mockSharpInstance.webp.mockClear()
    mockSharpInstance.clone.mockClear()
    mockSharpInstance.toBuffer.mockClear()

    mockUpload.mockImplementation(() => Promise.resolve({ error: null }))
    mockRemove.mockImplementation(() => Promise.resolve({ error: null }))
    mockGetPublicUrl.mockImplementation(() => ({ data: { publicUrl: "https://storage.test/file.webp" } }))
    mockSharpInstance.metadata.mockImplementation(() => Promise.resolve({ width: 800, height: 600 }))
    mockSharpInstance.toBuffer.mockImplementation(() => Promise.resolve(Buffer.alloc(100 * 1024)))
  })

  it("keeps Sharp unloaded for a no-image import", async () => {
    expect(sharpModuleLoadsAtStorageImport).toBe(0)
    expect(await downloadAndUploadBanner("hackathon-123", null)).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(sharpModuleLoadCount).toBe(0)
  })

  describe("ImageTooLargeError", () => {
    it("uses default max size in error message", () => {
      const error = new ImageTooLargeError(300 * 1024)
      expect(error.message).toBe("Optimized image is 300KB, max is 200KB")
      expect(error.name).toBe("ImageTooLargeError")
    })

    it("uses custom max size in error message", () => {
      const error = new ImageTooLargeError(600 * 1024, 500 * 1024)
      expect(error.message).toBe("Optimized image is 600KB, max is 500KB")
    })
  })

  describe("optimizeImage", () => {
    it("passes through SVG unchanged if within size limit", async () => {
      const svgBuffer = Buffer.from("<svg></svg>")
      const result = await optimizeImage(svgBuffer, "image/svg+xml")

      expect(result.buffer).toBe(svgBuffer)
      expect(result.mimeType).toBe("image/svg+xml")
      expect(mockSharp).not.toHaveBeenCalled()
    })

    it("throws error for SVG exceeding size limit", async () => {
      const largeBuffer = Buffer.alloc(250 * 1024)

      await expect(optimizeImage(largeBuffer, "image/svg+xml")).rejects.toThrow(ImageTooLargeError)
    })

    it("resizes large images", async () => {
      mockSharpInstance.metadata.mockImplementation(() => Promise.resolve({ width: 1200, height: 800 }))

      const buffer = Buffer.alloc(1024)
      await optimizeImage(buffer, "image/png")

      expect(mockSharpInstance.resize).toHaveBeenCalled()
    })

    it("converts to webp format", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await optimizeImage(buffer, "image/png")

      expect(result.mimeType).toBe("image/webp")
      expect(mockSharpInstance.webp).toHaveBeenCalled()
    })

    it("throws error when optimized image is still too large", async () => {
      mockSharpInstance.toBuffer.mockImplementation(() => Promise.resolve(Buffer.alloc(250 * 1024)))

      const buffer = Buffer.alloc(1024)
      await expect(optimizeImage(buffer, "image/png")).rejects.toThrow(ImageTooLargeError)
    })
  })

  describe("optimizeScreenshot", () => {
    it("resizes images exceeding max dimensions", async () => {
      mockSharpInstance.metadata.mockImplementation(() => Promise.resolve({ width: 2000, height: 1000 }))

      const buffer = Buffer.alloc(1024)
      await optimizeScreenshot(buffer)

      expect(mockSharpInstance.resize).toHaveBeenCalled()
    })

    it("converts to webp format", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await optimizeScreenshot(buffer)

      expect(result.mimeType).toBe("image/webp")
    })

    it("reduces quality progressively if image is too large", async () => {
      let callCount = 0
      mockSharpInstance.toBuffer.mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          return Promise.resolve(Buffer.alloc(600 * 1024))
        }
        return Promise.resolve(Buffer.alloc(400 * 1024))
      })

      const buffer = Buffer.alloc(1024)
      const result = await optimizeScreenshot(buffer)

      expect(result.buffer.length).toBeLessThanOrEqual(500 * 1024)
    })

    it("throws error with correct max size when optimization fails", async () => {
      mockSharpInstance.toBuffer.mockImplementation(() => Promise.resolve(Buffer.alloc(600 * 1024)))

      const buffer = Buffer.alloc(1024)
      try {
        await optimizeScreenshot(buffer)
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(ImageTooLargeError)
        expect((error as ImageTooLargeError).message).toContain("max is 500KB")
      }
    })
  })

  describe("optimizeBanner", () => {
    it("converts to webp format", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await optimizeBanner(buffer)

      expect(result.mimeType).toBe("image/webp")
    })

    it("throws error for image exceeding banner size limit (500KB)", async () => {
      mockSharpInstance.toBuffer.mockImplementation(() => Promise.resolve(Buffer.alloc(600 * 1024)))

      const buffer = Buffer.alloc(1024)

      try {
        await optimizeBanner(buffer)
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(ImageTooLargeError)
        expect((error as ImageTooLargeError).message).toContain("max is 500KB")
      }
    })
  })

  describe("uploadScreenshot", () => {
    it("uploads screenshot and returns URL", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await uploadScreenshot("sub123", buffer)

      expect(result).not.toBeNull()
      expect(result?.url).toBe("https://storage.test/file.webp")
      expect(result?.path).toBe("sub123/screenshot.webp")
      expect(mockStorageFrom).toHaveBeenCalledWith("screenshots")
    })

    it("uploads with correct content type and options", async () => {
      const buffer = Buffer.alloc(1024)
      await uploadScreenshot("sub123", buffer)

      expect(mockUpload).toHaveBeenCalledWith(
        "sub123/screenshot.webp",
        expect.any(Buffer),
        expect.objectContaining({
          contentType: "image/webp",
          upsert: true,
          cacheControl: "3600",
        })
      )
    })

    it("uploads the second screenshot slot", async () => {
      const buffer = Buffer.alloc(1024)
      await uploadScreenshot("sub123", buffer, 1)

      expect(mockUpload).toHaveBeenCalledWith(
        "sub123/screenshot-2.webp",
        expect.any(Buffer),
        expect.objectContaining({
          contentType: "image/webp",
          upsert: true,
        })
      )
    })

    it("returns null on upload error", async () => {
      mockUpload.mockImplementation(() => Promise.resolve({ error: { message: "Upload failed" } }))

      const buffer = Buffer.alloc(1024)
      const result = await uploadScreenshot("sub123", buffer)

      expect(result).toBeNull()
    })
  })

  describe("deleteScreenshot", () => {
    it("removes screenshot files in all formats from storage", async () => {
      const result = await deleteScreenshot("sub123")

      expect(result).toBe(true)
      expect(mockStorageFrom).toHaveBeenCalledWith("screenshots")
      expect(mockRemove).toHaveBeenCalledWith([
        "sub123/screenshot.webp",
        "sub123/screenshot.png",
        "sub123/screenshot.jpg",
        "sub123/screenshot.svg",
        "sub123/screenshot-2.webp",
        "sub123/screenshot-2.png",
        "sub123/screenshot-2.jpg",
        "sub123/screenshot-2.svg",
      ])
    })

    it("removes a single screenshot slot", async () => {
      const result = await deleteScreenshot("sub123", 1)

      expect(result).toBe(true)
      expect(mockRemove).toHaveBeenCalledWith([
        "sub123/screenshot-2.webp",
        "sub123/screenshot-2.png",
        "sub123/screenshot-2.jpg",
        "sub123/screenshot-2.svg",
      ])
    })

    it("returns false on error", async () => {
      mockRemove.mockImplementation(() => Promise.resolve({ error: { message: "Delete failed" } }))

      const result = await deleteScreenshot("sub123")

      expect(result).toBe(false)
    })
  })

  describe("screenshot versions", () => {
    it("uploads an immutable version and returns its public path", async () => {
      const result = await uploadScreenshotVersion(
        "sub123",
        Buffer.alloc(1024),
        2,
        "version456",
      )

      expect(result).toEqual({
        url: "https://storage.test/file.webp",
        path: "sub123/versions/version456-2.webp",
      })
      expect(mockUpload).toHaveBeenCalledWith(
        "sub123/versions/version456-2.webp",
        expect.any(Buffer),
        {
          contentType: "image/webp",
          upsert: false,
          cacheControl: "3600",
        },
      )
    })

    it("returns null when immutable version storage rejects the upload", async () => {
      mockUpload.mockImplementation(() =>
        Promise.resolve({ error: { message: "write failed" } }),
      )
      const error = mock(() => {})
      const originalError = console.error
      console.error = error
      try {
        await expect(uploadScreenshotVersion(
          "sub123",
          Buffer.alloc(1024),
          0,
          "version456",
        )).resolves.toBeNull()
        expect(error).toHaveBeenCalledTimes(1)
      } finally {
        console.error = originalError
      }
    })

    it("deletes only a scoped WebP version path", async () => {
      await expect(deleteScreenshotVersion(
        "sub123",
        "sub123/versions/version456-2.webp",
      )).resolves.toBe(true)
      expect(mockRemove).toHaveBeenCalledWith([
        "sub123/versions/version456-2.webp",
      ])

      for (const path of [
        "other/versions/version456-2.webp",
        "sub123/versions/../secret.webp",
        "sub123/versions/version456-2.png",
      ]) {
        await expect(deleteScreenshotVersion("sub123", path)).resolves.toBe(false)
      }
      expect(mockRemove).toHaveBeenCalledTimes(1)
    })

    it("reports a version cleanup failure without claiming deletion", async () => {
      mockRemove.mockImplementation(() =>
        Promise.resolve({ error: { message: "delete failed" } }),
      )
      const error = mock(() => {})
      const originalError = console.error
      console.error = error
      try {
        await expect(deleteScreenshotVersion(
          "sub123",
          "sub123/versions/version456-2.webp",
        )).resolves.toBe(false)
        expect(error).toHaveBeenCalledTimes(1)
      } finally {
        console.error = originalError
      }
    })
  })

  describe("uploadLogo", () => {
    it("uploads logo and returns URL", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await uploadLogo("tenant123", buffer, "image/png", "light")

      expect(result).not.toBeNull()
      expect(result?.url).toBe("https://storage.test/file.webp")
      expect(result?.path).toBe("tenant123/logo.webp")
      expect(mockStorageFrom).toHaveBeenCalledWith("logos")
    })

    it("uses correct filename for dark variant", async () => {
      const buffer = Buffer.alloc(1024)
      await uploadLogo("tenant123", buffer, "image/png", "dark")

      expect(mockUpload).toHaveBeenCalledWith(
        "tenant123/logo-dark.webp",
        expect.any(Buffer),
        expect.any(Object)
      )
    })

    it("returns null on upload error", async () => {
      mockUpload.mockImplementation(() => Promise.resolve({ error: { message: "Upload failed" } }))

      const buffer = Buffer.alloc(1024)
      const result = await uploadLogo("tenant123", buffer, "image/png", "light")

      expect(result).toBeNull()
    })
  })

  describe("deleteLogo", () => {
    it("removes logo files in all formats from storage", async () => {
      const result = await deleteLogo("tenant123", "light")

      expect(result).toBe(true)
      expect(mockStorageFrom).toHaveBeenCalledWith("logos")
      expect(mockRemove).toHaveBeenCalledWith([
        "tenant123/logo.webp",
        "tenant123/logo.png",
        "tenant123/logo.svg",
      ])
    })

    it("uses correct filename for dark variant", async () => {
      await deleteLogo("tenant123", "dark")

      expect(mockRemove).toHaveBeenCalledWith([
        "tenant123/logo-dark.webp",
        "tenant123/logo-dark.png",
        "tenant123/logo-dark.svg",
      ])
    })

    it("returns false on error", async () => {
      mockRemove.mockImplementation(() => Promise.resolve({ error: { message: "Delete failed" } }))

      const result = await deleteLogo("tenant123", "light")

      expect(result).toBe(false)
    })
  })

  describe("uploadBanner", () => {
    it("uploads banner and returns URL", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await uploadBanner("hackathon123", buffer)

      expect(result).not.toBeNull()
      expect(result?.url).toMatch(/^https:\/\/storage\.test\/file\.webp(\?v=\d+)?$/)
      expect(result?.path).toBe("hackathon123/banner.webp")
      expect(mockStorageFrom).toHaveBeenCalledWith("banners")
    })

    it("returns null on upload error", async () => {
      mockUpload.mockImplementation(() => Promise.resolve({ error: { message: "Upload failed" } }))

      const buffer = Buffer.alloc(1024)
      const result = await uploadBanner("hackathon123", buffer)

      expect(result).toBeNull()
    })
  })

  describe("deleteBanner", () => {
    it("removes banner files in all formats from storage", async () => {
      const result = await deleteBanner("hackathon123")

      expect(result).toBe(true)
      expect(mockStorageFrom).toHaveBeenCalledWith("banners")
      expect(mockRemove).toHaveBeenCalledWith([
        "hackathon123/banner.webp",
        "hackathon123/banner.png",
        "hackathon123/banner.jpg",
        "hackathon123/banner.svg",
      ])
    })

    it("returns false on error", async () => {
      mockRemove.mockImplementation(() => Promise.resolve({ error: { message: "Delete failed" } }))

      const result = await deleteBanner("hackathon123")

      expect(result).toBe(false)
    })
  })

  describe("uploadSponsorLogo", () => {
    it("uploads sponsor logo and returns URL with cache buster", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await uploadSponsorLogo("hackathon123", "sponsor456", buffer, "image/png")

      expect(result).not.toBeNull()
      expect(result?.url).toMatch(/^https:\/\/storage\.test\/file\.webp\?v=\d+$/)
      expect(result?.path).toBe("sponsors/hackathon123/sponsor456/logo.webp")
      expect(mockStorageFrom).toHaveBeenCalledWith("logos")
    })

    it("uploads with correct content type and options", async () => {
      const buffer = Buffer.alloc(1024)
      await uploadSponsorLogo("hackathon123", "sponsor456", buffer, "image/png")

      expect(mockUpload).toHaveBeenCalledWith(
        "sponsors/hackathon123/sponsor456/logo.webp",
        expect.any(Buffer),
        expect.objectContaining({
          contentType: "image/webp",
          upsert: true,
          cacheControl: "3600",
        })
      )
    })

    it("returns null on upload error", async () => {
      mockUpload.mockImplementation(() => Promise.resolve({ error: { message: "Upload failed" } }))

      const buffer = Buffer.alloc(1024)
      const result = await uploadSponsorLogo("hackathon123", "sponsor456", buffer, "image/png")

      expect(result).toBeNull()
    })
  })

  describe("deleteSponsorLogo", () => {
    it("removes sponsor logo files in all formats from storage", async () => {
      const result = await deleteSponsorLogo("hackathon123", "sponsor456")

      expect(result).toBe(true)
      expect(mockStorageFrom).toHaveBeenCalledWith("logos")
      expect(mockRemove).toHaveBeenCalledWith([
        "sponsors/hackathon123/sponsor456/logo.webp",
        "sponsors/hackathon123/sponsor456/logo.png",
        "sponsors/hackathon123/sponsor456/logo.svg",
      ])
    })

    it("returns false on error", async () => {
      mockRemove.mockImplementation(() => Promise.resolve({ error: { message: "Delete failed" } }))

      const result = await deleteSponsorLogo("hackathon123", "sponsor456")

      expect(result).toBe(false)
    })
  })

  describe("downloadAndUploadBanner", () => {
    beforeEach(() => {
      mockFetch.mockClear()
    })

    it("downloads image and uploads to storage", async () => {
      const imageBuffer = Buffer.alloc(1024)
      mockFetch.mockResolvedValueOnce(
        new Response(imageBuffer, {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      )

      const result = await downloadAndUploadBanner("hackathon-123", "https://images.lumacdn.com/test.png")
      expect(mockFetch).toHaveBeenCalledWith(
        "https://images.lumacdn.com/test.png",
        expect.objectContaining({ redirect: "manual" })
      )
      expect(result).not.toBeNull()
      expect(result?.path).toBe("hackathon-123/banner.webp")
    })

    it("returns null when image download fails (404)", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))

      const result = await downloadAndUploadBanner("hackathon-123", "https://bad-url.com/nope.png")
      expect(result).toBeNull()
    })

    it("returns null when imageUrl is null", async () => {
      const result = await downloadAndUploadBanner("hackathon-123", null)
      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns null when fetch throws a network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await downloadAndUploadBanner("hackathon-123", "https://unreachable.com/img.png")
      expect(result).toBeNull()
    })

    it("redacts banner URL secrets from fetch errors", async () => {
      const url = "https://images.example.com/banner.png?signature=banner-secret#private"
      mockFetch.mockRejectedValueOnce(new Error(`Network error for ${url}`))
      const originalConsoleError = console.error
      const consoleError = mock(() => {})
      console.error = consoleError

      try {
        expect(await downloadAndUploadBanner("hackathon-123", url)).toBeNull()
      } finally {
        console.error = originalConsoleError
      }

      const output = JSON.stringify(consoleError.mock.calls)
      expect(output).toContain("https://images.example.com/[redacted]")
      expect(output).not.toContain("banner.png")
      expect(output).not.toContain("banner-secret")
      expect(output).not.toContain("#private")
    })

    it("redacts credentials in rejected banner URL logs", async () => {
      const originalConsoleWarn = console.warn
      const consoleWarn = mock(() => {})
      console.warn = consoleWarn

      try {
        expect(await downloadAndUploadBanner(
          "hackathon-123",
          "https://alice:password@example.com/banner.png?token=secret#private"
        )).toBeNull()
      } finally {
        console.warn = originalConsoleWarn
      }

      const output = JSON.stringify(consoleWarn.mock.calls)
      expect(output).toContain("https://example.com/[redacted]")
      expect(output).not.toContain("banner.png")
      expect(output).not.toContain("alice")
      expect(output).not.toContain("password")
      expect(output).not.toContain("secret")
      expect(output).not.toContain("#private")
    })

    it("blocks redirects to private addresses", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }))

      const result = await downloadAndUploadBanner("hackathon-123", "https://example.com/banner.png")

      expect(result).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("rejects oversized downloads before processing", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", {
        status: 200,
        headers: { "content-length": String(5 * 1024 * 1024 + 1) },
      }))

      const result = await downloadAndUploadBanner("hackathon-123", "https://example.com/banner.png")

      expect(result).toBeNull()
      expect(mockSharp).not.toHaveBeenCalled()
    })
  })

  describe("optimizeHeadshot", () => {
    it("converts to webp format", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await optimizeHeadshot(buffer)

      expect(result.mimeType).toBe("image/webp")
      expect(mockSharpInstance.webp).toHaveBeenCalled()
    })

    it("resizes images exceeding 400px dimensions", async () => {
      mockSharpInstance.metadata.mockImplementation(() => Promise.resolve({ width: 800, height: 600 }))

      const buffer = Buffer.alloc(1024)
      await optimizeHeadshot(buffer)

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, 400, expect.objectContaining({ fit: "cover" }))
    })

    it("does not resize small images", async () => {
      mockSharpInstance.metadata.mockImplementation(() => Promise.resolve({ width: 200, height: 200 }))

      const buffer = Buffer.alloc(1024)
      await optimizeHeadshot(buffer)

      expect(mockSharpInstance.resize).not.toHaveBeenCalled()
    })

    it("throws error when optimized image is too large", async () => {
      mockSharpInstance.toBuffer.mockImplementation(() => Promise.resolve(Buffer.alloc(250 * 1024)))

      const buffer = Buffer.alloc(1024)
      await expect(optimizeHeadshot(buffer)).rejects.toThrow(ImageTooLargeError)
    })
  })

  describe("uploadJudgeHeadshot", () => {
    it("uploads headshot and returns URL", async () => {
      const buffer = Buffer.alloc(1024)
      const result = await uploadJudgeHeadshot("h1", "j1", buffer)

      expect(result).not.toBeNull()
      expect(result?.url).toContain("https://storage.test/file.webp")
      expect(result?.path).toBe("h1/j1/headshot.webp")
      expect(mockStorageFrom).toHaveBeenCalledWith("headshots")
    })

    it("returns null on upload error", async () => {
      mockUpload.mockImplementation(() => Promise.resolve({ error: { message: "Upload failed" } }))

      const buffer = Buffer.alloc(1024)
      const result = await uploadJudgeHeadshot("h1", "j1", buffer)

      expect(result).toBeNull()
    })
  })

  describe("deleteJudgeHeadshot", () => {
    it("removes headshot files in all formats", async () => {
      const result = await deleteJudgeHeadshot("h1", "j1")

      expect(result).toBe(true)
      expect(mockStorageFrom).toHaveBeenCalledWith("headshots")
      expect(mockRemove).toHaveBeenCalledWith([
        "h1/j1/headshot.webp",
        "h1/j1/headshot.png",
        "h1/j1/headshot.jpg",
      ])
    })

    it("returns false on error", async () => {
      mockRemove.mockImplementation(() => Promise.resolve({ error: { message: "Remove failed" } }))

      const result = await deleteJudgeHeadshot("h1", "j1")

      expect(result).toBe(false)
    })
  })
})
