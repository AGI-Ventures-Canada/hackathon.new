"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { FileText, PartyPopper, Loader2, Key } from "lucide-react"
import type { OrgIntegration, IntegrationProvider, OrgApiCredential, ApiCredentialProvider } from "@/lib/db/hackathon-types"
import { IntegrationCard } from "@/components/dashboard/integration-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface IntegrationListProps {
  connectedOAuthProviders: Map<string, OrgIntegration>
  connectedApiKeyProviders: Map<string, OrgApiCredential>
}

type OAuthIntegration = {
  type: "oauth"
  provider: IntegrationProvider
  name: string
  description: string
  icon: typeof FileText
}

type ApiKeyIntegration = {
  type: "api_key"
  provider: ApiCredentialProvider
  name: string
  description: string
  icon: typeof FileText
  helpUrl?: string
}

const oauthIntegrations: OAuthIntegration[] = [
  {
    type: "oauth",
    provider: "notion",
    name: "Notion",
    description: "Access and modify your Notion workspace",
    icon: FileText,
  },
]

const apiKeyIntegrations: ApiKeyIntegration[] = [
  {
    type: "api_key",
    provider: "luma",
    name: "Luma",
    description: "Manage Luma calendar events and guests",
    icon: PartyPopper,
    helpUrl: "https://docs.lu.ma/reference/getting-started-with-your-api",
  },
]

export function IntegrationList({
  connectedOAuthProviders,
  connectedApiKeyProviders,
}: IntegrationListProps) {
  const router = useRouter()
  const [optimisticDisconnected, setOptimisticDisconnected] = useState<Set<string>>(new Set())
  const [confirmDisconnect, setConfirmDisconnect] = useState<{
    provider: string
    type: "oauth" | "api_key"
  } | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [apiKeyDialog, setApiKeyDialog] = useState<ApiKeyIntegration | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [saving, setSaving] = useState(false)

  const handleOAuthConnect = async (provider: IntegrationProvider) => {
    setConnecting(provider)
    try {
      const response = await fetch(`/api/dashboard/integrations/${provider}/auth-url`)
      if (response.ok) {
        const data = await response.json()
        window.location.href = data.authUrl
      }
    } finally {
      setConnecting(null)
    }
  }

  const handleApiKeyConnect = (integration: ApiKeyIntegration) => {
    setApiKeyInput("")
    setApiKeyDialog(integration)
  }

  const handleApiKeySave = async () => {
    if (!apiKeyDialog || !apiKeyInput.trim()) return

    setSaving(true)
    try {
      const response = await fetch("/api/dashboard/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: apiKeyDialog.provider,
          apiKey: apiKeyInput.trim(),
        }),
      })

      if (response.ok) {
        setApiKeyDialog(null)
        setApiKeyInput("")
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirmDisconnect) return

    const provider = confirmDisconnect.provider
    const type = confirmDisconnect.type
    setConfirmDisconnect(null)
    setOptimisticDisconnected((prev) => new Set(prev).add(provider))

    try {
      const url =
        type === "oauth"
          ? `/api/dashboard/integrations/${provider}`
          : `/api/dashboard/credentials/${provider}`

      const response = await fetch(url, { method: "DELETE" })
      if (response.ok) {
        router.refresh()
      }
    } catch {
      setOptimisticDisconnected((prev) => {
        const next = new Set(prev)
        next.delete(provider)
        return next
      })
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {oauthIntegrations.map((integration) => {
          const connected = optimisticDisconnected.has(integration.provider)
            ? undefined
            : connectedOAuthProviders.get(integration.provider)
          return (
            <IntegrationCard
              key={integration.provider}
              provider={integration.provider}
              name={integration.name}
              description={integration.description}
              icon={integration.icon}
              connected={!!connected}
              accountEmail={connected?.account_email ?? undefined}
              onConnect={() => handleOAuthConnect(integration.provider)}
              onDisconnect={() =>
                setConfirmDisconnect({ provider: integration.provider, type: "oauth" })
              }
              loading={connecting === integration.provider}
            />
          )
        })}

        {apiKeyIntegrations.map((integration) => {
          const connected = optimisticDisconnected.has(integration.provider)
            ? undefined
            : connectedApiKeyProviders.get(integration.provider)
          return (
            <IntegrationCard
              key={integration.provider}
              provider={integration.provider}
              name={integration.name}
              description={integration.description}
              icon={integration.icon}
              connected={!!connected}
              accountEmail={connected?.account_identifier ?? undefined}
              connectLabel="Add API Key"
              onConnect={() => handleApiKeyConnect(integration)}
              onDisconnect={() =>
                setConfirmDisconnect({ provider: integration.provider, type: "api_key" })
              }
              badge={<Key className="size-3" />}
            />
          )
        })}
      </div>

      <AlertDialog
        open={!!confirmDisconnect}
        onOpenChange={() => setConfirmDisconnect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Integration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect this integration? You will
              no longer be able to use this service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!apiKeyDialog} onOpenChange={() => setApiKeyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {apiKeyDialog?.name}</DialogTitle>
            <DialogDescription>
              Enter your {apiKeyDialog?.name} API key to enable this integration.
              {apiKeyDialog?.helpUrl && (
                <>
                  {" "}
                  <a
                    href={apiKeyDialog.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Get your API key
                  </a>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your API key..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApiKeyDialog(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApiKeySave}
              disabled={saving || !apiKeyInput.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save API Key"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
