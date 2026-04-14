"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type TeamSettingsData = {
  minTeamSize: number
  maxTeamSize: number
  allowSolo: boolean
}

type Preset = {
  key: string
  label: string
  description: string
  min: number
  max: number
}

const PRESETS: Preset[] = [
  { key: "pairs", label: "Pairs or more", description: "2\u20135 people", min: 2, max: 5 },
  { key: "small", label: "Small teams", description: "3\u20135 people", min: 3, max: 5 },
  { key: "large", label: "Large teams", description: "4\u20138 people", min: 4, max: 8 },
]

function matchPreset(data: TeamSettingsData): string | null {
  for (const p of PRESETS) {
    if (p.min === data.minTeamSize && p.max === data.maxTeamSize) {
      return p.key
    }
  }
  return null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hackathonId: string
  initialData: TeamSettingsData
  onSaved?: () => void
}

export function TeamSettingsDialog({ open, onOpenChange, hackathonId, initialData, onSaved }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(() => matchPreset(initialData) ?? "custom")
  const [customMin, setCustomMin] = useState(initialData.minTeamSize)
  const [customMax, setCustomMax] = useState(initialData.maxTeamSize)
  const [allowSolo, setAllowSolo] = useState(initialData.allowSolo)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getValues(): TeamSettingsData {
    if (selected === "custom") {
      return { minTeamSize: customMin, maxTeamSize: customMax, allowSolo }
    }
    const preset = PRESETS.find((p) => p.key === selected)
    if (!preset) return initialData
    return { minTeamSize: preset.min, maxTeamSize: preset.max, allowSolo }
  }

  function handlePresetClick(key: string) {
    setSelected(key)
    if (key !== "custom") {
      const p = PRESETS.find((pr) => pr.key === key)!
      setCustomMin(p.min)
      setCustomMax(p.max)
    }
  }

  async function handleSave() {
    const values = getValues()
    if (values.minTeamSize < 1 || values.maxTeamSize < values.minTeamSize) {
      setError("Max must be at least the min, and min must be at least 1")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save")
      }
      router.refresh()
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const isCustom = selected === "custom"
  const values = getValues()
  const isDirty =
    values.minTeamSize !== initialData.minTeamSize ||
    values.maxTeamSize !== initialData.maxTeamSize ||
    values.allowSolo !== initialData.allowSolo

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Team size</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">How big are teams?</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => handlePresetClick(preset.key)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                  selected === preset.key && "border-primary ring-1 ring-primary",
                )}
              >
                <p className="text-sm font-medium">{preset.label}</p>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => handlePresetClick("custom")}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                isCustom && "border-primary ring-1 ring-primary",
              )}
            >
              <p className="text-sm font-medium">Custom</p>
              <p className="text-xs text-muted-foreground">Pick your own</p>
            </button>
          </div>
          {isCustom && (
            <div className="flex items-center gap-2 px-1 pt-1">
              <Input
                type="number"
                min={1}
                max={customMax}
                value={customMin}
                onChange={(e) => { setCustomMin(Number(e.target.value)); setError(null) }}
                className="w-16 text-center"
                aria-label="Minimum team size"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="number"
                min={customMin}
                max={50}
                value={customMax}
                onChange={(e) => { setCustomMax(Number(e.target.value)); setError(null) }}
                className="w-16 text-center"
                aria-label="Maximum team size"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
              <span className="text-sm text-muted-foreground">people</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium">Allow solo participants</p>
            <p className="text-xs text-muted-foreground">People can join without a team</p>
          </div>
          <Switch
            checked={allowSolo}
            onCheckedChange={(checked) => { setAllowSolo(checked); setError(null) }}
          />
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving\u2026" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function teamSettingsSummary(data: TeamSettingsData): string {
  const { minTeamSize, maxTeamSize, allowSolo } = data
  const range = minTeamSize === maxTeamSize ? `${minTeamSize}` : `${minTeamSize}\u2013${maxTeamSize}`
  const solo = allowSolo ? ", solo allowed" : ""
  return `${range} people per team${solo}`
}
