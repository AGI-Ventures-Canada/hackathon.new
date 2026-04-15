"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink, Gift, Key, Ticket } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Perk, PerkType } from "@/lib/services/perks"

type Props = {
  perks: Perk[]
  sponsors: { id: string; name: string }[]
}

const TYPE_ICON: Record<PerkType, typeof Gift> = {
  api_key: Key,
  credit: Gift,
  coupon: Ticket,
  other: Gift,
}

const TYPE_LABEL: Record<PerkType, string> = {
  api_key: "API key",
  credit: "Credits",
  coupon: "Coupon",
  other: "Perk",
}

function PerkCard({ perk, sponsorName }: { perk: Perk; sponsorName: string | null }) {
  const [copied, setCopied] = useState(false)
  const Icon = TYPE_ICON[perk.type]

  async function copyCode() {
    if (!perk.code) return
    try {
      await navigator.clipboard.writeText(perk.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — user can still select manually
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="size-4 text-muted-foreground" />
            <h3 className="truncate text-base font-semibold">{perk.name}</h3>
            <Badge variant="outline" className="text-xs">{TYPE_LABEL[perk.type]}</Badge>
            {sponsorName && (
              <span className="text-xs text-muted-foreground">from {sponsorName}</span>
            )}
          </div>
          {perk.description && (
            <p className="mt-1 text-sm text-muted-foreground">{perk.description}</p>
          )}
          {perk.code && (
            <div className="mt-3 flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-mono">{perk.code}</code>
              <Button size="sm" variant="outline" onClick={copyCode}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          {perk.instructions && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{perk.instructions}</p>
          )}
        </div>
        {perk.redemptionUrl && (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href={perk.redemptionUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">Redeem</span>
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

export function PerksSection({ perks, sponsors }: Props) {
  if (perks.length === 0) return null

  const sponsorMap = new Map(sponsors.map((s) => [s.id, s.name]))

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Perks</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Sponsor credits, API keys, and coupons for your team. Copy the code or click to redeem.
      </p>
      <div className="space-y-3">
        {perks.map((perk) => (
          <PerkCard
            key={perk.id}
            perk={perk}
            sponsorName={perk.sponsorId ? sponsorMap.get(perk.sponsorId) ?? null : null}
          />
        ))}
      </div>
    </div>
  )
}
