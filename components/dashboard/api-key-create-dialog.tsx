"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Copy, Check, Search } from "lucide-react"
import type { CreateApiKeyResponse } from "@/lib/types/dashboard"
import { ALL_SCOPES, DEFAULT_API_KEY_SCOPES, type Scope } from "@/lib/auth/types"

const SCOPE_GROUPS = [
  {
    name: "Keys",
    scopes: ["keys:read", "keys:write"] as Scope[],
  },
  {
    name: "Webhooks",
    scopes: ["webhooks:read", "webhooks:write"] as Scope[],
  },
  {
    name: "Hackathons",
    scopes: ["hackathons:read", "hackathons:write"] as Scope[],
  },
  {
    name: "Teams",
    scopes: ["teams:read", "teams:write"] as Scope[],
  },
  {
    name: "Submissions",
    scopes: ["submissions:read", "submissions:write"] as Scope[],
  },
  {
    name: "Analytics",
    scopes: ["analytics:read"] as Scope[],
  },
  {
    name: "Schedules",
    scopes: ["schedules:read", "schedules:write"] as Scope[],
  },
  {
    name: "Organization",
    scopes: ["org:read", "org:write"] as Scope[],
  },
]

export function ApiKeyCreateDialog() {
  const router = useRouter()
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<Scope[]>([...DEFAULT_API_KEY_SCOPES])
  const [scopeSearch, setScopeSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
    null
  )
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && !createdKey) {
      setTimeout(() => nameInputRef.current?.focus(), 0)
    }
  }, [open, createdKey])

  useEffect(() => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey.key).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }, [createdKey])

  function toggleScope(scope: Scope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  function selectAllScopes() {
    setScopes([...ALL_SCOPES])
  }

  function clearAllScopes() {
    setScopes([])
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      })
      if (res.ok) {
        const data = await res.json()
        setCreatedKey(data)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen)
    if (!isOpen) {
      const shouldRefresh = createdKey !== null
      setName("")
      setScopes([...DEFAULT_API_KEY_SCOPES])
      setScopeSearch("")
      setCreatedKey(null)
      setCopied(false)
      if (shouldRefresh) {
        router.refresh()
      }
    }
  }

  const filteredGroups = SCOPE_GROUPS.map((group) => ({
    ...group,
    scopes: group.scopes.filter((scope) =>
      scope.toLowerCase().includes(scopeSearch.toLowerCase())
    ),
  })).filter((group) => group.scopes.length > 0)

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button>
          <Plus className="size-4 mr-2" />
          Create API Key
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {createdKey ? "API Key Created" : "Create API Key"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {createdKey
              ? "Your API key has been copied to clipboard. You won't be able to see it again."
              : "Create a new API key for external integrations."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {createdKey ? (
          <>
            <div className="space-y-4">
              <div className="bg-muted p-4 font-mono text-sm break-all rounded-md">
                {createdKey.key}
              </div>
              <Button onClick={handleCopy} className="w-full">
                {copied ? (
                  <>
                    <Check className="size-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => handleOpenChange(false)}>Done</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name && scopes.length > 0 && !loading) {
                handleCreate()
              }
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                if (name && scopes.length > 0 && !loading) {
                  handleCreate()
                }
              }
            }}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Key Name</Label>
                <Input
                  ref={nameInputRef}
                  id="name"
                  placeholder="e.g., Production Server"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Permissions</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={selectAllScopes}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearAllScopes}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search permissions..."
                    value={scopeSearch}
                    onChange={(e) => setScopeSearch(e.target.value)}
                    className="pl-9"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                  />
                </div>
                <div className="border rounded-md p-3 space-y-3 max-h-48 overflow-y-auto">
                  {filteredGroups.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      No permissions match &ldquo;{scopeSearch}&rdquo;
                    </div>
                  ) : (
                    filteredGroups.map((group) => (
                      <div key={group.name} className="space-y-2">
                        <div className="text-sm font-medium text-muted-foreground">
                          {group.name}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {group.scopes.map((scope) => (
                            <div
                              key={scope}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={scope}
                                checked={scopes.includes(scope)}
                                onCheckedChange={() => toggleScope(scope)}
                              />
                              <label
                                htmlFor={scope}
                                className="text-sm cursor-pointer"
                              >
                                {scope.split(":")[1]}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {scopes.length} of {ALL_SCOPES.length} permissions selected
                </div>
              </div>
            </div>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" disabled={!name || scopes.length === 0 || loading}>
                {loading ? "Creating..." : "Create Key"}
              </Button>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
