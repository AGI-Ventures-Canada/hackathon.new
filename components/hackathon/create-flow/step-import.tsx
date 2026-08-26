"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight, Globe, Loader2, PenLine } from "lucide-react"
import { normalizeUrl } from "@/lib/utils/url"

interface StepImportProps {
  onSkipToScratch: () => void
  onModeChange?: (mode: "choose" | "import") => void
  savedDraftName?: string | null
}

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false
  return /^(https?:\/\/)?[\w.-]+\.\w{2,}(\/|$)/i.test(trimmed)
}

export function StepImport({
  onSkipToScratch,
  onModeChange,
  savedDraftName,
}: StepImportProps) {
  const router = useRouter()
  const [mode, _setMode] = useState<"choose" | "import">("choose")

  function setMode(m: "choose" | "import") {
    _setMode(m)
    onModeChange?.(m)
  }
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleImport() {
    const trimmed = url.trim()
    if (!trimmed) return

    if (!looksLikeUrl(trimmed)) {
      setError("That doesn't look like a URL. Paste an event page link.")
      return
    }

    setLoading(true)
    setError(null)
    const normalized = normalizeUrl(trimmed)
    router.push(`/import?url=${encodeURIComponent(normalized)}`)
  }

  if (mode === "import") {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
            Paste the event URL
          </h1>
          <p className="text-muted-foreground">
            We&apos;ll pull in the name, dates, location, and description.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="url"
              placeholder="luma.com/your-event"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim()) {
                  e.preventDefault()
                  e.stopPropagation()
                  handleImport()
                }
              }}
              className="h-14 text-lg"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
            {url.trim() && (
              <Button
                type="button"
                size="lg"
                onClick={handleImport}
                disabled={loading}
                className="h-14 px-4"
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ArrowRight className="size-5" />
                )}
              </Button>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
          Create a hackathon
        </h1>
        <p className="text-muted-foreground">
          {savedDraftName
            ? "Your saved draft is ready. Keep editing or import another event."
            : "Start fresh or import from an existing event page."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onSkipToScratch}
          className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:border-primary hover:bg-muted/50"
        >
          <PenLine className="size-6 text-muted-foreground" />
          <div>
            <div className="font-medium">
              {savedDraftName ? "Keep editing" : "Start from scratch"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {savedDraftName || "Name it, set dates, and go"}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode("import")}
          className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:border-primary hover:bg-muted/50"
        >
          <Globe className="size-6 text-muted-foreground" />
          <div>
            <div className="font-medium">Import from URL</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Paste a Luma or event page link
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
