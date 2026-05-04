import type { WhoAmIResponse } from "./types.js"

export function formatWorkspace(whoami: WhoAmIResponse): string {
  const name = whoami.tenantName?.trim() || whoami.tenantId

  if (whoami.tenantType === "organization") {
    return `${name} (organization)`
  }

  if (whoami.tenantType === "personal") {
    return `${name} (personal)`
  }

  return name
}
