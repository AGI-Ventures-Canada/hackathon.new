"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { normalizeUrl } from "@/lib/utils/url"
import type { Perk, PerkType } from "@/lib/services/perks"

export type SponsorOption = { id: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hackathonId: string
  perk: Perk | null
  sponsors: SponsorOption[]
  onSaved: (perk: Perk) => void
}

const TYPE_LABELS: Record<PerkType, string> = {
  api_key: "API key",
  credit: "Credits",
  coupon: "Coupon",
  other: "Other",
}

export function PerkEditorDialog({ open, onOpenChange, hackathonId, perk, sponsors, onSaved }: Props) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<PerkType>("other")
  const [sponsorId, setSponsorId] = useState<string>("")
  const [code, setCode] = useState("")
  const [redemptionUrl, setRedemptionUrl] = useState("")
  const [instructions, setInstructions] = useState("")
  const [scheduled, setScheduled] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(perk?.name ?? "")
    setDescription(perk?.description ?? "")
    setType(perk?.type ?? "other")
    setSponsorId(perk?.sponsorId ?? "")
    setCode(perk?.code ?? "")
    setRedemptionUrl(perk?.redemptionUrl ?? "")
    setInstructions(perk?.instructions ?? "")
    setScheduled(perk?.scheduledReleaseAt ? new Date(perk.scheduledReleaseAt) : null)
    setError(null)
  }, [open, perk])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        type,
        sponsorId: sponsorId || null,
        code: code.trim() ? code.trim() : null,
        redemptionUrl: redemptionUrl.trim() ? normalizeUrl(redemptionUrl.trim()) : null,
        instructions: instructions.trim() ? instructions.trim() : null,
        scheduledReleaseAt: scheduled ? scheduled.toISOString() : null,
      }

      const url = perk
        ? `/api/dashboard/hackathons/${hackathonId}/perks/${perk.id}`
        : `/api/dashboard/hackathons/${hackathonId}/perks`
      const method = perk ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save perk")
      }

      const data = (await res.json()) as { perk: Perk }
      onSaved(data.perk)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save perk")
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !saving) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{perk ? "Edit perk" : "Add perk"}</DialogTitle>
          <DialogDescription>Share an offer or resource with attendees.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSave() }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="perk-name">Name</Label>
            <Input
              id="perk-name"
              name="perk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OpenAI API credits"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="perk-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PerkType)}>
                <SelectTrigger id="perk-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as PerkType[]).map((key) => (
                    <SelectItem key={key} value={key}>{TYPE_LABELS[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="perk-sponsor">Sponsor (optional)</Label>
              <Select value={sponsorId || "__none"} onValueChange={(v) => setSponsorId(v === "__none" ? "" : v)}>
                <SelectTrigger id="perk-sponsor">
                  <SelectValue placeholder="No sponsor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No sponsor</SelectItem>
                  {sponsors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="perk-description">Short description</Label>
            <Input
              id="perk-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. $50 in credits for image generation"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="perk-code">Code</Label>
              <Input
                id="perk-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="HACK2026"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perk-url">Redemption link</Label>
              <Input
                id="perk-url"
                type="text"
                inputMode="url"
                value={redemptionUrl}
                onChange={(e) => setRedemptionUrl(e.target.value)}
                placeholder="https://…"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="perk-instructions">How to redeem</Label>
            <Textarea
              id="perk-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Paste the code at checkout, or follow the link and sign in with the email you registered with."
              className="min-h-[6rem]"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perk-scheduled">Release at (optional)</Label>
            <DateTimePicker
              id="perk-scheduled"
              value={scheduled}
              onChange={setScheduled}
              placeholder="When should teams see this?"
              minDate={new Date()}
            />
            <p className="text-xs text-muted-foreground">Leave blank to release when the event starts.</p>
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              Save perk
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
