import { randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import * as p from "@clack/prompts"
import { OatmealClient } from "../client.js"
import { loadConfig, saveConfig } from "../config.js"
import { AUTH_TIMEOUT_MS, DEFAULT_BASE_URL, POLL_INTERVAL_MS } from "../constants.js"
import type { CliConfig, WhoAmIResponse } from "../types.js"
import { formatWorkspace } from "../workspace.js"

interface LoginOptions {
  apiKey?: string
  noBrowser?: boolean
  baseUrl?: string
  yes?: boolean
}

export function parseLoginOptions(args: string[]): LoginOptions {
  const options: LoginOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--api-key":
        options.apiKey = args[++i]
        break
      case "--no-browser":
        options.noBrowser = true
        break
      case "--base-url":
        options.baseUrl = args[++i]
        break
      case "--yes":
      case "-y":
        options.yes = true
        break
    }
  }
  return options
}

export async function runLogin(args: string[]): Promise<void> {
  const options = parseLoginOptions(args)
  const baseUrl = validateBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)

  const existingConfig = loadConfig()
  if (existingConfig && !options.yes && !options.apiKey && !process.env.HACKATHON_API_KEY) {
    const overwrite = await p.confirm({
      message: "You are already logged in. Overwrite existing config?",
    })
    if (p.isCancel(overwrite) || !overwrite) {
      p.log.info("Login cancelled.")
      return
    }
  }

  const key = options.apiKey ?? process.env.HACKATHON_API_KEY
  if (key) {
    await validateAndSaveKey(key, baseUrl)
    return
  }

  if (options.noBrowser || !process.stdout.isTTY) {
    const pastedKey = await p.password({ message: "Paste your API key:" })
    if (p.isCancel(pastedKey)) {
      p.log.info("Login cancelled.")
      return
    }
    await validateAndSaveKey(pastedKey, baseUrl)
    return
  }

  const deviceToken = randomBytes(32).toString("hex")
  const authUrl = `${baseUrl}/cli-auth#token=${deviceToken}`

  const initClient = new OatmealClient({ baseUrl })
  try {
    await initClient.get("/api/public/cli-auth/poll", { params: { token: deviceToken } })
  } catch {
    // Session creation failed — continue anyway, poll loop will retry
  }

  p.log.info(`Opening browser to sign in...`)
  p.log.info(authUrl)

  try {
    openBrowser(authUrl)
  } catch {
    p.log.warn("Could not open browser. Visit the URL above manually.")
  }

  const spinner = p.spinner()
  spinner.start("Waiting for authentication...")

  try {
    const apiKey = await pollForKey(baseUrl, deviceToken)
    spinner.stop("Authenticated!")
    await validateAndSaveKey(apiKey, baseUrl)
  } catch (error) {
    spinner.stop("Authentication failed.")
    throw error
  }
}

export function validateBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("Base URL must be a valid web address")
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("Base URL must use HTTPS. HTTP is allowed only for local development.")
  }
  if (url.username || url.password || url.hash) throw new Error("Base URL cannot include credentials or a fragment")
  return url.toString().replace(/\/$/, "")
}

export function getBrowserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): { executable: string; args: string[] } {
  if (platform === "darwin") return { executable: "open", args: [url] }
  if (platform === "win32") {
    return {
      executable: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    }
  }
  return { executable: "xdg-open", args: [url] }
}

function openBrowser(url: string): void {
  const { executable, args } = getBrowserCommand(url)
  execFileSync(executable, args, { stdio: "ignore" })
}

async function pollForKey(baseUrl: string, deviceToken: string): Promise<string> {
  const client = new OatmealClient({ baseUrl })
  const start = Date.now()
  let shownCode = false

  while (Date.now() - start < AUTH_TIMEOUT_MS) {
    const result = await client.get<{ status: string; apiKey?: string; userCode?: string }>(
      "/api/public/cli-auth/poll",
      { params: { token: deviceToken } }
    )

    if (result.status === "complete" && result.apiKey) {
      return result.apiKey
    }

    if (!shownCode && result.userCode) {
      p.log.info(`Confirmation code: ${result.userCode}`)
      shownCode = true
    }

    if (result.status === "expired") {
      throw new Error("Authentication session expired. Please try again.")
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error("Authentication timed out after 10 minutes. Please try again.")
}

async function validateAndSaveKey(apiKey: string, baseUrl: string): Promise<void> {
  const client = new OatmealClient({ baseUrl, apiKey })

  const spinner = p.spinner()
  spinner.start("Validating API key...")

  try {
    const whoami = await client.get<WhoAmIResponse>("/api/v1/whoami")
    spinner.stop("Key validated!")

    const config: CliConfig = {
      apiKey,
      baseUrl,
      tenantId: whoami.tenantId,
      tenantName: whoami.tenantName ?? null,
      tenantType: whoami.tenantType ?? null,
      keyId: whoami.keyId,
      scopes: whoami.scopes,
    }

    saveConfig(config)

    p.log.success(`Logged in! Key saved to ~/.hackathon/config.json`)
    p.log.info(`Workspace: ${formatWorkspace(whoami)}`)
    p.log.info(`Scopes: ${whoami.scopes.join(", ")}`)
  } catch (error) {
    spinner.stop("Validation failed.")
    throw error
  }
}
