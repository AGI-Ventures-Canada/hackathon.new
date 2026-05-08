"use client"

import { useState, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { MarkdownEditor } from "@/components/ui/markdown-editor"

interface SettingsTabProps {
  hackathonId: string
  initialRequireTermsAcceptance: boolean
  initialTermsContent: string | null
}

export function SettingsTab({
  hackathonId,
  initialRequireTermsAcceptance,
  initialTermsContent,
}: SettingsTabProps) {
  const router = useRouter()
  const [requireTerms, setRequireTerms] = useState(initialRequireTermsAcceptance)
  const [termsContent, setTermsContent] = useState(initialTermsContent ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const isDirty =
    requireTerms !== initialRequireTermsAcceptance ||
    (termsContent ?? "") !== (initialTermsContent ?? "")

  async function save(nextRequireTerms: boolean, nextContent: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireTermsAcceptance: nextRequireTerms,
          termsContent: nextContent.trim() ? nextContent : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save")
      }
      setSavedAt(Date.now())
      router.refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
      return false
    } finally {
      setSaving(false)
    }
  }

  const hasContent = Boolean(termsContent.trim())

  function handleToggle(next: boolean) {
    setRequireTerms(next)
    setError(null)
    void save(next, termsContent)
  }

  async function handleSaveContent() {
    if (!isDirty) return
    if (requireTerms && !hasContent) {
      setError("Add your terms before turning this on.")
      return
    }
    await save(requireTerms, termsContent)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void handleSaveContent()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terms and conditions</CardTitle>
        <CardDescription>
          Make every attendee and judge agree to your terms before they finish signing up
          or accepting an invite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6" onKeyDown={handleKeyDown}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-terms">Require attendees and judges to agree to your terms</Label>
            <p className="text-xs text-muted-foreground">
              When on, people see your terms and have to check &quot;I agree&quot; before they can
              join.
            </p>
          </div>
          <Switch
            id="require-terms"
            checked={requireTerms}
            onCheckedChange={handleToggle}
            disabled={saving || !hasContent}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="terms-content">Your terms</Label>
          <MarkdownEditor
            id="terms-content"
            value={termsContent}
            onChange={setTermsContent}
            placeholder={
              "Code of conduct, IP and ownership, photo and video release, anything else they need to know..."
            }
            rows={14}
          />
          <p className="text-xs text-muted-foreground">
            If you change your terms after people have agreed, they&apos;ll be asked to agree
            to the new version next time they visit.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          {savedAt && !isDirty && !error && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
          <Button
            type="button"
            onClick={handleSaveContent}
            disabled={!isDirty || saving}
          >
            {saving && <Loader2 className="animate-spin" />}
            Save terms
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
