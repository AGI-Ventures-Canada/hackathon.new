"use client"

import { useRef } from "react"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { assertOk } from "@/lib/utils/fetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { normalizeOptionalUrl, normalizeUrl, urlInputProps } from "@/lib/utils/url"

interface SponsorFormProps {
  hackathonId: string
}

export function SponsorForm({ hackathonId }: SponsorFormProps) {
  const formRef = useRef<HTMLFormElement>(null)

  const { execute: submitSponsor, isPending, error } = useOptimisticMutation({
    fn: (data: { name: string; logoUrl: string | null | undefined; websiteUrl: string | null | undefined; tier: string }) =>
      fetch(`/api/dashboard/hackathons/${hackathonId}/sponsors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(assertOk),
    onOptimistic: () => formRef.current?.reset(),
  })

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    await submitSponsor({
      name: formData.get("name") as string,
      logoUrl: normalizeOptionalUrl(formData.get("logoUrl") as string | null),
      websiteUrl: normalizeOptionalUrl(formData.get("websiteUrl") as string | null),
      tier: formData.get("tier") as string,
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            name="name"
            placeholder="Sponsor name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tier">Tier</Label>
          <Select name="tier" defaultValue="none">
            <SelectTrigger>
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="silver">Silver</SelectItem>
              <SelectItem value="bronze">Bronze</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input
            id="logoUrl"
            name="logoUrl"
            {...urlInputProps}
            placeholder="cdn.example.com/logo.png"
            onBlur={(e) => {
              if (e.currentTarget.value.trim()) {
                e.currentTarget.value = normalizeUrl(e.currentTarget.value)
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="websiteUrl">Website URL</Label>
          <Input
            id="websiteUrl"
            name="websiteUrl"
            {...urlInputProps}
            placeholder="company.com"
            onBlur={(e) => {
              if (e.currentTarget.value.trim()) {
                e.currentTarget.value = normalizeUrl(e.currentTarget.value)
              }
            }}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding..." : "Add Sponsor"}
      </Button>
    </form>
  )
}
