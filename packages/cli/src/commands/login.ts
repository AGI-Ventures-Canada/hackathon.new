import { randomBytes } from "node:crypto"
import { execSync } from "node:child_process"
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
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL

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
  const authUrl = `${baseUrl}/cli-auth?token=${deviceToken}`

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

function openBrowser(url: string): void {
  const platform = process.platform
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open"
  execSync(`${cmd} "${url}"`, { stdio: "ignore" })
}

async function pollForKey(baseUrl: string, deviceToken: string): Promise<string> {
  const client = new OatmealClient({ baseUrl })
  const start = Date.now()

  while (Date.now() - start < AUTH_TIMEOUT_MS) {
    const result = await client.get<{ status: string; apiKey?: string }>(
      "/api/public/cli-auth/poll",
      { params: { token: deviceToken } }
    )

    if (result.status === "complete" && result.apiKey) {
      return result.apiKey
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
