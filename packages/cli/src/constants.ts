import { homedir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = require("../package.json") as { version: string }

export const VERSION = pkg.version
export const DEFAULT_BASE_URL = "https://hackathon.new"
export const CONFIG_DIR = join(homedir(), ".hackathon")
export const CONFIG_FILE = join(CONFIG_DIR, "config.json")
export const REQUEST_TIMEOUT_MS = 30_000
export const POLL_INTERVAL_MS = 2_000
export const AUTH_TIMEOUT_MS = 600_000
