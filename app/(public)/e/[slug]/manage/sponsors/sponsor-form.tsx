"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name") as string,
      logoUrl: normalizeOptionalUrl(formData.get("logoUrl") as string | null),
      websiteUrl: normalizeOptionalUrl(formData.get("websiteUrl") as string | null),
      tier: formData.get("tier") as string,
    }

    try {
      const response = await fetch(`/api/dashboard/hackathons/${hackathonId}/sponsors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to add sponsor")
      }

      e.currentTarget.reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <Button type="submit" disabled={loading}>
        {loading ? "Adding..." : "Add Sponsor"}
      </Button>
    </form>
  )
}
