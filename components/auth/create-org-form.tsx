"use client"

import { useEffect, useRef, useState } from "react"
import { useOrganizationList } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { generateSlug, isValidSlugFormat } from "@/lib/utils/slug"

export function CreateOrgForm({
  redirectUrl,
  skipUrl,
}: {
  redirectUrl: string
  skipUrl?: string
}) {
  const { createOrganization, setActive, isLoaded } = useOrganizationList()
  const router = useRouter()

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!slugEdited) {
      setSlug(generateSlug(name))
    }
  }, [name, slugEdited])

  useEffect(() => {
    if (!slug || !isValidSlugFormat(slug)) {
      setSlugAvailable(null)
      return
    }

    setIsCheckingSlug(true)
    setSlugAvailable(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(slug)}`,
        )
        if (res.ok) {
          const data = await res.json()
          setSlugAvailable(data.available)
        } else {
          setSlugAvailable(null)
        }
      } catch {
        setSlugAvailable(null)
      } finally {
        setIsCheckingSlug(false)
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (
      !name.trim() ||
      !slug ||
      !isValidSlugFormat(slug) ||
      slugAvailable !== true ||
      !createOrganization
    )
      return

    setIsSubmitting(true)
    setError("")

    try {
      let orgId = createdOrgId
      if (!orgId) {
        const org = await createOrganization({ name: name.trim() })
        orgId = org.id
        setCreatedOrgId(orgId)
        await setActive?.({ organization: orgId })
      }

      const res = await fetch("/api/dashboard/org-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save organization slug")
      }

      router.push(redirectUrl)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create organization",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSubmitting) {
      e.preventDefault()
      const form = (e.target as HTMLElement).closest("form")
      form?.requestSubmit()
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const slugStatus = (() => {
    if (!slug) return null
    if (!isValidSlugFormat(slug)) return "invalid"
    if (isCheckingSlug) return "checking"
    if (slugAvailable === true) return "available"
    if (slugAvailable === false) return "taken"
    return null
  })()

  const canSubmit =
    name.trim().length > 0 &&
    slug.length > 0 &&
    slugStatus === "available" &&
    !isSubmitting

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          Events are managed under organizations. Set up yours to get started.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} autoComplete="off">
        <CardContent className="space-y-4">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              name="org-name"
              placeholder="Acme Inc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">URL slug</Label>
            <Input
              id="org-slug"
              name="org-slug"
              placeholder="acme-inc"
              value={slug}
              onChange={(e) => {
                setSlug(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
                setSlugEdited(true)
              }}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              required
            />
            {slug && (
              <p
                className={`text-xs ${
                  slugStatus === "available"
                    ? "text-primary"
                    : slugStatus === "taken" || slugStatus === "invalid"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {slugStatus === "checking" && "Checking availability..."}
                {slugStatus === "available" && "This slug is available"}
                {slugStatus === "taken" && "This slug is already taken"}
                {slugStatus === "invalid" &&
                  "Slugs can only contain lowercase letters, numbers, and hyphens"}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Create organization
          </Button>
          {skipUrl && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push(skipUrl)}
            >
              Skip for now
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
