"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowRight, Database, Globe, Loader2, PenLine } from "lucide-react"
import { normalizeImportUrl } from "@/lib/utils/url"
import {
  TEST_EVENT_STAGE_OPTIONS,
  type TestEventStage,
} from "@/lib/fixtures/test-event"

export type CreateChoiceMode = "choose" | "import" | "test"

interface StepImportProps {
  onSkipToScratch: () => void
  onModeChange?: (mode: CreateChoiceMode) => void
  onCreateTestEvent?: (stage: TestEventStage) => void
  initialMode?: CreateChoiceMode
  initialTestStage?: TestEventStage
  isCreatingTestEvent?: boolean
  testEventError?: string | null
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
  onCreateTestEvent,
  initialMode = "choose",
  initialTestStage = "registration",
  isCreatingTestEvent = false,
  testEventError,
  savedDraftName,
}: StepImportProps) {
  const router = useRouter()
  const [mode, _setMode] = useState<CreateChoiceMode>(initialMode)
  const [testStage, setTestStage] = useState<TestEventStage>(initialTestStage)

  function setMode(m: CreateChoiceMode) {
    _setMode(m)
    onModeChange?.(m)
  }
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleImport() {
    if (loading) return

    const trimmed = url.trim()
    if (!trimmed) return

    if (!looksLikeUrl(trimmed)) {
      setError("That doesn't look like a URL. Paste an event page link.")
      return
    }

    const normalized = normalizeImportUrl(trimmed)
    if (!normalized) {
      setError("Use a public HTTPS link with 2,048 characters or fewer.")
      return
    }

    setLoading(true)
    setError(null)
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
          <div className="space-y-2">
            <Label htmlFor="event-import-url">Event page URL</Label>
            <div className="flex gap-2">
              <Input
                id="event-import-url"
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
                maxLength={2048}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                disabled={loading}
              />
              {url.trim() && (
                <Button
                  type="button"
                  size="lg"
                  onClick={handleImport}
                  disabled={loading}
                  aria-label={loading ? "Importing event" : "Import event"}
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
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    )
  }

  if (mode === "test") {
    const selectedStage = TEST_EVENT_STAGE_OPTIONS.find((option) => option.value === testStage)
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
            Try a full test event
          </h1>
          <p className="text-muted-foreground">
            We&apos;ll add fake people, teams, projects, judges, sponsors, and a schedule.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-event-stage">Which part do you want to see?</Label>
            <Select
              value={testStage}
              onValueChange={(value) => setTestStage(value as TestEventStage)}
              disabled={isCreatingTestEvent}
            >
              <SelectTrigger id="test-event-stage" className="w-full" autoFocus>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEST_EVENT_STAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {selectedStage?.description}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            This stays private. Emails are off until you make it a real event.
          </p>
          {testEventError && (
            <p className="text-sm text-destructive" role="alert">{testEventError}</p>
          )}
          <Button
            type="button"
            size="lg"
            onClick={() => onCreateTestEvent?.(testStage)}
            disabled={isCreatingTestEvent || !onCreateTestEvent}
          >
            {isCreatingTestEvent && <Loader2 className="size-4 animate-spin" />}
            {isCreatingTestEvent ? "Creating test event…" : "Create test event"}
          </Button>
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
            ? "Your saved draft is ready. Keep editing, import, or try test data."
            : "Start fresh, import an event, or try a full test event."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          type="button"
          variant="outline"
          onClick={onSkipToScratch}
          className="h-auto flex-col gap-3 whitespace-normal p-6"
        >
          <PenLine className="size-6 text-muted-foreground" />
          <div>
            <div className="font-medium">
              {savedDraftName ? "Keep editing" : "Create from scratch"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {savedDraftName || "Name it, set dates, and go"}
            </div>
          </div>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => setMode("import")}
          className="h-auto flex-col gap-3 whitespace-normal p-6"
        >
          <Globe className="size-6 text-muted-foreground" />
          <div>
            <div className="font-medium">Import from a URL</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Paste a Luma or event page link
            </div>
          </div>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => setMode("test")}
          className="h-auto flex-col gap-3 whitespace-normal p-6"
        >
          <Database className="size-6 text-muted-foreground" />
          <div>
            <div className="font-medium">Create a test event with test data</div>
            <div className="mt-1 text-sm text-muted-foreground">
              See a full event before you set up yours
            </div>
          </div>
        </Button>
      </div>
    </div>
  )
}
