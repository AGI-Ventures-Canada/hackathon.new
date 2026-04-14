"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { assertOk } from "@/lib/utils/fetch"
import { useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field"
import { LogoUploadModal } from "@/components/org/logo-upload-modal"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Sun, Moon, ImageIcon, ExternalLink, Users, CreditCard, TriangleAlert, Check, X, Loader2 } from "lucide-react"
import { normalizeOptionalUrl, normalizeUrlFieldValue, urlInputProps } from "@/lib/utils/url"

function isValidSlugFormat(s: string): boolean {
  return s.length >= 3 && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s)
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid"

type ProfileFormProps = {
  initialData: {
    name: string
    slug: string | null
    logoUrl: string | null
    logoUrlDark: string | null
    description: string | null
    websiteUrl: string | null
  }
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const router = useRouter()
  const { openOrganizationProfile } = useClerk()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [slug, setSlug] = useState(initialData.slug ?? "")
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle")
  const [description, setDescription] = useState(initialData.description ?? "")
  const [websiteUrl, setWebsiteUrl] = useState(initialData.websiteUrl ?? "")

  const lastSaved = useRef({
    slug: initialData.slug ?? "",
    description: initialData.description ?? "",
    websiteUrl: initialData.websiteUrl ?? "",
  })

  const isDirty =
    slug !== lastSaved.current.slug ||
    description !== lastSaved.current.description ||
    websiteUrl !== lastSaved.current.websiteUrl

  useEffect(() => {
    if (slug === lastSaved.current.slug) {
      setSlugStatus("idle")
      return
    }
    if (!isValidSlugFormat(slug)) {
      setSlugStatus("invalid")
      return
    }
    setSlugStatus("checking")
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(slug)}`)
        const data = await res.json()
        setSlugStatus(data.available ? "available" : "taken")
      } catch {
        setSlugStatus("idle")
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [slug])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isDirty])

  const slugBlocked = !slug || slugStatus === "invalid" || slugStatus === "taken" || slugStatus === "checking"
  const canSave = isDirty && !saving && !slugBlocked

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const normalizedWebsiteUrl = normalizeOptionalUrl(websiteUrl) ?? ""
      await fetch("/api/dashboard/org-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          description: description || null,
          websiteUrl: normalizedWebsiteUrl || null,
        }),
      }).then(assertOk)

      setWebsiteUrl(normalizedWebsiteUrl)
      lastSaved.current = { slug, description, websiteUrl: normalizedWebsiteUrl }
      setSlugStatus("idle")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile")
    } finally {
      setSaving(false)
    }
  }

  const hasLogo = initialData.logoUrl || initialData.logoUrlDark

  return (
    <FieldGroup className="max-w-xl">
      <Field>
        <FieldLabel>Logo</FieldLabel>
        <FieldDescription>
          Upload logos for light and dark themes. Rectangular logos (2:1 ratio) work best.
        </FieldDescription>

        <div className="mt-2 flex items-start gap-4">
          {hasLogo ? (
            <div className="flex gap-3">
              {initialData.logoUrl && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Sun className="size-2.5" />
                    <span>Light</span>
                  </div>
                  <div className="bg-[#f5f5f4] border border-[#e5e5e5] p-2 flex items-center justify-center h-14 w-28">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={initialData.logoUrl}
                      alt="Light mode logo"
                      className="max-h-10 max-w-full object-contain"
                    />
                  </div>
                </div>
              )}
              {initialData.logoUrlDark && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Moon className="size-2.5" />
                    <span>Dark</span>
                  </div>
                  <div className="bg-[#1a1a1a] border border-[#333] p-2 flex items-center justify-center h-14 w-28">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={initialData.logoUrlDark}
                      alt="Dark mode logo"
                      className="max-h-10 max-w-full object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-muted/50 border border-dashed p-4 flex items-center justify-center h-14 w-28">
              <ImageIcon className="size-5 text-muted-foreground" />
            </div>
          )}

          <LogoUploadModal
            lightLogoUrl={initialData.logoUrl}
            darkLogoUrl={initialData.logoUrlDark}
            trigger={
              <Button variant="outline" size="sm">
                {hasLogo ? "Change Logo" : "Upload Logo"}
              </Button>
            }
          />
        </div>
      </Field>

      <Field>
        <FieldLabel>Organization Name</FieldLabel>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{initialData.name}</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => openOrganizationProfile()}
          >
            Edit in Clerk
            <ExternalLink className="size-3 ml-1" />
          </Button>
        </div>
        <FieldDescription>
          Name is managed through Clerk and synced automatically
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="slug">URL Slug</FieldLabel>
        <Input
          id="slug"
          type="text"
          placeholder="my-organization"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
        />
        <FieldDescription>
          <span>Your public organization page URL: /o/{slug || "your-slug"}</span>
          {slug !== lastSaved.current.slug && (
            <span className="flex items-center gap-1 mt-0.5">
              {slugStatus === "checking" && <><Loader2 className="size-3 animate-spin" /><span>Checking availability...</span></>}
              {slugStatus === "available" && <><Check className="size-3 text-primary" /><span className="text-primary">Available</span></>}
              {slugStatus === "taken" && <><X className="size-3 text-destructive" /><span className="text-destructive">Already taken</span></>}
              {slugStatus === "invalid" && <span className="text-destructive">Must be at least 3 characters, start and end with a letter or number</span>}
            </span>
          )}
          {!slug && <span className="text-destructive mt-0.5 block">Slug is required</span>}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea
          id="description"
          placeholder="Tell people about your organization..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="website-url">Website URL</FieldLabel>
        <Input
          id="website-url"
          {...urlInputProps}
          placeholder="example.com"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          onBlur={() => setWebsiteUrl(normalizeUrlFieldValue(websiteUrl))}
        />
      </Field>

      {error && (
        <p className="text-destructive text-sm">{error}</p>
      )}

      <div className="pt-2 flex items-center gap-3">
        <Button onClick={handleSave} disabled={!canSave}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {isDirty && !saving && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <TriangleAlert className="size-3.5" />
            Unsaved changes
          </span>
        )}
      </div>
    </FieldGroup>
  )
}

export function ClerkSettingsCard() {
  const { openOrganizationProfile } = useClerk()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team & Billing</CardTitle>
        <CardDescription>
          Manage members, invitations, and billing through Clerk
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openOrganizationProfile({ afterLeaveOrganizationUrl: "/onboarding" })}
          >
            <Users className="size-4 mr-2" />
            Manage Members
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openOrganizationProfile()}
          >
            <CreditCard className="size-4 mr-2" />
            Billing & Plans
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
