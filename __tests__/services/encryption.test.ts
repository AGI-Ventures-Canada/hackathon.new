import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import {
  encryptToken,
  decryptToken,
  encryptJson,
  decryptJson,
  generateWebhookSecret,
  generateToken,
  signWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/services/encryption"

describe("Encryption Service", () => {
  const originalEnv = process.env.ENCRYPTION_KEY

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "0".repeat(64)
  })

  afterAll(() => {
    if (originalEnv) {
      process.env.ENCRYPTION_KEY = originalEnv
    } else {
      delete process.env.ENCRYPTION_KEY
    }
  })

  describe("Token Encryption", () => {
    it("encrypts and decrypts a simple string", () => {
      const plaintext = "hello world"
      const encrypted = encryptToken(plaintext)
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it("encrypts and decrypts a long string", () => {
      const plaintext = "a".repeat(10000)
      const encrypted = encryptToken(plaintext)
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it("encrypts and decrypts unicode characters", () => {
      const plaintext = "Hello 世界 🌍 émojis"
      const encrypted = encryptToken(plaintext)
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it("encrypts and decrypts an empty string", () => {
      const plaintext = ""
      const encrypted = encryptToken(plaintext)
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it("produces different ciphertext for same plaintext (due to random IV)", () => {
      const plaintext = "same text"
      const encrypted1 = encryptToken(plaintext)
      const encrypted2 = encryptToken(plaintext)
      expect(encrypted1).not.toBe(encrypted2)
    })

    it("encrypted format contains iv:authTag:ciphertext", () => {
      const encrypted = encryptToken("test")
      const parts = encrypted.split(":")
      expect(parts.length).toBe(3)
      expect(parts[0].length).toBe(32)
      expect(parts[1].length).toBe(32)
      expect(parts[2].length).toBeGreaterThan(0)
    })
  })

  describe("Token Decryption Errors", () => {
    it("throws on invalid format (missing parts)", () => {
      expect(() => decryptToken("invalid")).toThrow("Invalid encrypted token format")
    })

    it("throws on invalid format (too few parts)", () => {
      expect(() => decryptToken("part1:part2")).toThrow("Invalid encrypted token format")
    })

    it("throws on invalid format (too many parts)", () => {
      expect(() => decryptToken("a:b:c:d")).toThrow("Invalid encrypted token format")
    })

    it("throws on invalid IV length", () => {
      expect(() => decryptToken("short:" + "0".repeat(32) + ":data")).toThrow(
        "Invalid encrypted token format"
      )
    })

    it("throws on invalid auth tag length", () => {
      expect(() => decryptToken("0".repeat(32) + ":short:data")).toThrow(
        "Invalid encrypted token format"
      )
    })

    it("throws on tampered ciphertext", () => {
      const encrypted = encryptToken("original")
      const parts = encrypted.split(":")
      parts[2] = "0".repeat(parts[2].length)
      expect(() => decryptToken(parts.join(":"))).toThrow()
    })

    it("throws on tampered auth tag", () => {
      const encrypted = encryptToken("original")
      const parts = encrypted.split(":")
      parts[1] = "f".repeat(32)
      expect(() => decryptToken(parts.join(":"))).toThrow()
    })
  })

  describe("JSON Encryption", () => {
    it("encrypts and decrypts a simple object", () => {
      const data = { key: "value", number: 123 }
      const encrypted = encryptJson(data)
      const decrypted = decryptJson(encrypted)
      expect(decrypted).toEqual(data)
    })

    it("encrypts and decrypts nested objects", () => {
      const data = {
        user: { name: "John", settings: { theme: "dark" } },
        tags: ["a", "b", "c"],
      }
      const encrypted = encryptJson(data)
      const decrypted = decryptJson(encrypted)
      expect(decrypted).toEqual(data)
    })

    it("encrypts and decrypts arrays", () => {
      const data = { items: [1, 2, 3, { nested: true }] }
      const encrypted = encryptJson(data)
      const decrypted = decryptJson(encrypted)
      expect(decrypted).toEqual(data)
    })

    it("encrypts and decrypts with null values", () => {
      const data = { value: null, other: "test" }
      const encrypted = encryptJson(data)
      const decrypted = decryptJson(encrypted)
      expect(decrypted).toEqual(data)
    })

    it("preserves type information with generics", () => {
      interface TestData {
        name: string
        count: number
      }
      const data: TestData = { name: "test", count: 42 }
      const encrypted = encryptJson(data)
      const decrypted = decryptJson<TestData>(encrypted)
      expect(decrypted.name).toBe("test")
      expect(decrypted.count).toBe(42)
    })
  })

  describe("Webhook Secret Generation", () => {
    it("generates a 64-character hex string", () => {
      const secret = generateWebhookSecret()
      expect(secret.length).toBe(64)
      expect(/^[a-f0-9]+$/.test(secret)).toBe(true)
    })

    it("generates unique secrets", () => {
      const secrets = new Set<string>()
      for (let i = 0; i < 100; i++) {
        secrets.add(generateWebhookSecret())
      }
      expect(secrets.size).toBe(100)
    })
  })

  describe("Token Generation", () => {
    it("generates a 48-character hex string", () => {
      const token = generateToken()
      expect(token.length).toBe(48)
      expect(/^[a-f0-9]+$/.test(token)).toBe(true)
    })

    it("generates unique tokens", () => {
      const tokens = new Set<string>()
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken())
      }
      expect(tokens.size).toBe(100)
    })
  })

  describe("Webhook Signing", () => {
    it("signs a payload with HMAC-SHA256", () => {
      const secret = "test-secret"
      const payload = '{"event":"test"}'
      const signature = signWebhookPayload(secret, payload)
      expect(signature.length).toBe(64)
      expect(/^[a-f0-9]+$/.test(signature)).toBe(true)
    })

    it("produces consistent signatures for same input", () => {
      const secret = "test-secret"
      const payload = '{"event":"test"}'
      const sig1 = signWebhookPayload(secret, payload)
      const sig2 = signWebhookPayload(secret, payload)
      expect(sig1).toBe(sig2)
    })

    it("produces different signatures for different payloads", () => {
      const secret = "test-secret"
      const sig1 = signWebhookPayload(secret, '{"event":"a"}')
      const sig2 = signWebhookPayload(secret, '{"event":"b"}')
      expect(sig1).not.toBe(sig2)
    })

    it("produces different signatures for different secrets", () => {
      const payload = '{"event":"test"}'
      const sig1 = signWebhookPayload("secret1", payload)
      const sig2 = signWebhookPayload("secret2", payload)
      expect(sig1).not.toBe(sig2)
    })
  })

  describe("Webhook Verification", () => {
    it("verifies a valid signature", () => {
      const secret = "test-secret"
      const payload = '{"event":"test"}'
      const signature = signWebhookPayload(secret, payload)
      expect(verifyWebhookSignature(secret, payload, signature)).toBe(true)
    })

    it("rejects an invalid signature", () => {
      const secret = "test-secret"
      const payload = '{"event":"test"}'
      const badSignature = "0".repeat(64)
      expect(verifyWebhookSignature(secret, payload, badSignature)).toBe(false)
    })

    it("rejects a tampered payload", () => {
      const secret = "test-secret"
      const originalPayload = '{"event":"test"}'
      const signature = signWebhookPayload(secret, originalPayload)
      const tamperedPayload = '{"event":"hacked"}'
      expect(verifyWebhookSignature(secret, tamperedPayload, signature)).toBe(false)
    })

    it("rejects wrong secret", () => {
      const payload = '{"event":"test"}'
      const signature = signWebhookPayload("correct-secret", payload)
      expect(verifyWebhookSignature("wrong-secret", payload, signature)).toBe(false)
    })

    it("handles signatures of different lengths safely", () => {
      const secret = "test-secret"
      const payload = '{"event":"test"}'
      expect(verifyWebhookSignature(secret, payload, "short")).toBe(false)
      expect(verifyWebhookSignature(secret, payload, "0".repeat(128))).toBe(false)
    })

    it("handles empty signature", () => {
      const secret = "test-secret"
      const payload = '{"event":"test"}'
      expect(verifyWebhookSignature(secret, payload, "")).toBe(false)
    })
  })

  describe("Encryption Key Validation", () => {
    it("requires ENCRYPTION_KEY environment variable", () => {
      const savedKey = process.env.ENCRYPTION_KEY
      delete process.env.ENCRYPTION_KEY

      expect(() => encryptToken("test")).toThrow(
        "ENCRYPTION_KEY environment variable is required"
      )

      process.env.ENCRYPTION_KEY = savedKey
    })

    it("requires 64 hex character key", () => {
      const savedKey = process.env.ENCRYPTION_KEY
      process.env.ENCRYPTION_KEY = "tooshort"

      expect(() => encryptToken("test")).toThrow(
        "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"
      )

      process.env.ENCRYPTION_KEY = savedKey
    })

    it("rejects a 64 character key containing non-hex characters", () => {
      const savedKey = process.env.ENCRYPTION_KEY
      process.env.ENCRYPTION_KEY = "z".repeat(64)

      expect(() => encryptToken("test")).toThrow(
        "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"
      )

      process.env.ENCRYPTION_KEY = savedKey
    })
  })
})
