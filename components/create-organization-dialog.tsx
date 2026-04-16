"use client"

import { useState, useEffect, useRef } from "react"
import { useOrganizationList } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { generateSlug, isValidSlugFormat } from "@/lib/utils/slug"

interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateOrganizationDialogProps) {
  const router = useRouter()
  const { createOrganization, setActive } = useOrganizationList()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!slugEdited) {
      setSlug(generateSlug(name))
    }
  }, [name, slugEdited])

  useEffect(() => {
    if (!slug || !isValidSlugFormat(slug)) {
      setSlugAvailable(null)
      setIsCheckingSlug(false)
      return
    }

    setIsCheckingSlug(true)
    setSlugAvailable(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const controller = new AbortController()

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(slug)}`,
          { signal: controller.signal }
        )
        if (res.ok) {
          const data = await res.json()
          setSlugAvailable(data.available)
        } else {
          setSlugAvailable(null)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        setSlugAvailable(null)
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingSlug(false)
        }
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      controller.abort()
    }
  }, [slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug || !isValidSlugFormat(slug) || slugAvailable !== true || !createOrganization) return

    setIsSubmitting(true)
    setError(null)

    try {
      const checkRes = await fetch(
        `/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(slug)}`
      )
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (!checkData.available) {
          setSlugAvailable(false)
          setError("This slug was just taken. Pick another one.")
          return
        }
      }

      const org = await createOrganization({ name: name.trim() })
      await setActive?.({ organization: org.id })

      const res = await fetch("/api/dashboard/org-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      })

      if (!res.ok) {
        try {
          await org.destroy()
        } catch (destroyErr) {
          console.error("Failed to destroy org after slug save failure", destroyErr)
        }
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to save organization slug")
      }

      onOpenChange(false)
      resetForm()
      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/home")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization")
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSubmitting) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  function resetForm() {
    setName("")
    setSlug("")
    setSlugEdited(false)
    setSlugAvailable(null)
    setError(null)
  }

  function handleOpenChange(open: boolean) {
    if (!open) resetForm()
    onOpenChange(open)
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} autoComplete="off">
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
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
              <Label htmlFor="org-slug">URL Slug</Label>
              <Input
                id="org-slug"
                name="org-slug"
                placeholder="acme-inc"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  setSlugEdited(true)
                }}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                required
              />
              {slug && (
                <p className={`text-xs ${
                  slugStatus === "available"
                    ? "text-primary"
                    : slugStatus === "taken" || slugStatus === "invalid"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}>
                  {slugStatus === "checking" && "Checking availability..."}
                  {slugStatus === "available" && "This slug is available"}
                  {slugStatus === "taken" && "This slug is already taken"}
                  {slugStatus === "invalid" && "At least 3 characters — lowercase letters, numbers, and hyphens only"}
                </p>
              )}
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Creating..." : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
