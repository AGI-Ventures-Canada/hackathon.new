import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required")
  }
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
  }
  return Buffer.from(key, "hex")
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")

  const authTag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`
}

export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey()
  const parts = ciphertext.split(":")

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format")
  }

  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted token format")
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

export function encryptJson(data: Record<string, unknown>): string {
  return encryptToken(JSON.stringify(data))
}

export function decryptJson<T = Record<string, unknown>>(ciphertext: string): T {
  const decrypted = decryptToken(ciphertext)
  return JSON.parse(decrypted) as T
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex")
}

export function generateToken(): string {
  return randomBytes(24).toString("hex")
}

export function signWebhookPayload(secret: string, payload: string): string {
  const hmac = createHmac("sha256", secret)
  hmac.update(payload)
  return hmac.digest("hex")
}

export function safeDecrypt(value: string): string | null {
  try {
    return decryptToken(value)
  } catch {
    return null
  }
}

export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string
): boolean {
  const expected = signWebhookPayload(secret, payload)
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
