"use client"

import { useEffect, useRef, useState } from "react"
import { useOrganizationList, useUser } from "@clerk/nextjs"
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
import {
  completeOrganizationCreationAttempt,
  findOrganizationBySlug,
  loadOrganizationCreationAttempt,
  reconcilePendingOrganization,
  saveOrganizationCreationAttempt,
  snapshotPendingOrganizationCreation,
  withOrganizationCreationLock,
  type PendingOrganizationCreation,
} from "@/lib/auth/organization-creation"

export function CreateOrgForm({
  redirectUrl,
  skipUrl,
}: {
  redirectUrl: string
  skipUrl?: string
}) {
  const { createOrganization, setActive, isLoaded } = useOrganizationList()
  const { user } = useUser()
  const userId = user?.id ?? null
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
  const submitInFlightRef = useRef(false)
  const pendingCreationRef = useRef<PendingOrganizationCreation | null>(null)
  const profileWritePendingRef = useRef(false)
  const completedOrganizationIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoaded || !userId) return
    const stored = loadOrganizationCreationAttempt(userId)
    if (!stored) return
    pendingCreationRef.current = {
      name: stored.name,
      knownMembershipIds: stored.knownMembershipIds,
    }
    profileWritePendingRef.current = stored.profileWritePending
    completedOrganizationIdRef.current = stored.completedOrganizationId
    setName(stored.name)
    setSlug(stored.slug)
    setSlugEdited(true)
  }, [isLoaded, userId])

  useEffect(() => {
    if (!slugEdited && !pendingCreationRef.current) {
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
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          if (controller.signal.aborted) return
          setSlugAvailable(data.available)
        } else {
          setSlugAvailable(null)
        }
      } catch {
        if (controller.signal.aborted) return
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
    if (
      submitInFlightRef.current ||
      !name.trim() ||
      !slug ||
      !isValidSlugFormat(slug) ||
      (slugAvailable !== true &&
        !profileWritePendingRef.current &&
        !completedOrganizationIdRef.current) ||
      !createOrganization ||
      !userId ||
      !user
    )
      return

    submitInFlightRef.current = true
    setIsSubmitting(true)
    setError("")

    try {
      await withOrganizationCreationLock(userId, async () => {
        const latestAttempt = loadOrganizationCreationAttempt(userId)
        if (latestAttempt?.completedOrganizationId) {
          if (
            latestAttempt.name !== name.trim() ||
            latestAttempt.slug !== slug
          ) {
            throw new Error(
              "Finish the organization setup already open in this browser first.",
            )
          }
          pendingCreationRef.current = {
            name: latestAttempt.name,
            knownMembershipIds: latestAttempt.knownMembershipIds,
          }
          profileWritePendingRef.current = false
          completedOrganizationIdRef.current =
            latestAttempt.completedOrganizationId
          setCreatedOrgId(latestAttempt.completedOrganizationId)
          if (!setActive)
            throw new Error("Organization switching isn't ready. Try again.")
          await setActive({
            organization: latestAttempt.completedOrganizationId,
          })
          router.replace(redirectUrl)
          return
        }

        let orgId = createdOrgId
        if (!orgId) {
          let pending = pendingCreationRef.current
          let shouldReconcile = pending !== null
          if (!pending) {
            const stored = loadOrganizationCreationAttempt(userId)
            if (stored) {
              if (stored.name !== name.trim() || stored.slug !== slug) {
                setError(
                  "Finish the organization setup already open in this browser first.",
                )
                return
              }
              pending = {
                name: stored.name,
                knownMembershipIds: stored.knownMembershipIds,
              }
              shouldReconcile = true
              profileWritePendingRef.current = stored.profileWritePending
            } else {
              pending = await snapshotPendingOrganizationCreation(
                name,
                (params) => user.getOrganizationMemberships(params),
              )
              const saved = saveOrganizationCreationAttempt(
                userId,
                pending,
                slug,
              )
              if (saved !== "saved") {
                setError(
                  saved === "conflict"
                    ? "Finish the organization setup already open in this browser first."
                    : "Turn on browser storage so we can safely create your organization.",
                )
                return
              }
            }
            pendingCreationRef.current = pending
          }

          let org = shouldReconcile
            ? await reconcilePendingOrganization(
                pending,
                (params) => user.getOrganizationMemberships(params),
                slug,
              )
            : null
          if (!org) {
            try {
              org = await createOrganization({ name: name.trim(), slug })
            } catch (creationError) {
              const recoveredNew = await reconcilePendingOrganization(
                pending,
                (params) => user.getOrganizationMemberships(params),
                slug,
              ).catch(() => null)
              const recovered =
                recoveredNew ??
                (await findOrganizationBySlug(name, slug, (params) =>
                  user.getOrganizationMemberships(params),
                ))
              if (!recovered) throw creationError
              org = recovered
            }
          }
          orgId = org.id
          setCreatedOrgId(orgId)
        }
        if (!setActive)
          throw new Error("Organization switching isn't ready. Try again.")
        await setActive({ organization: orgId })

        const pending = pendingCreationRef.current
        if (!pending)
          throw new Error(
            "We couldn't recover the organization setup. Try again.",
          )

        if (profileWritePendingRef.current) {
          const profileRes = await fetch(
            `/api/dashboard/org-profile?expectedOrganizationId=${encodeURIComponent(orgId)}`,
          )
          if (!profileRes.ok) {
            throw new Error(
              "We couldn't check the organization profile. Keep this window open and try again.",
            )
          }
          const profile = (await profileRes.json()) as { slug?: unknown }
          if (profile.slug === slug) {
            profileWritePendingRef.current = false
            const completed = completeOrganizationCreationAttempt(
              userId,
              pending,
              slug,
              orgId,
            )
            if (completed !== "saved") {
              throw new Error(
                "We couldn't safely finish your organization. Keep this page open and try again.",
              )
            }
            completedOrganizationIdRef.current = orgId
            router.replace(redirectUrl)
            return
          }
          const checkRes = await fetch(
            `/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(slug)}`,
          )
          if (!checkRes.ok || !(await checkRes.json()).available) {
            setSlugAvailable(false)
            setError(
              "We couldn't confirm the saved slug yet. Keep this page open and try again.",
            )
            return
          }
          profileWritePendingRef.current = false
          saveOrganizationCreationAttempt(userId, pending, slug, false)
        }

        const pendingSaved = saveOrganizationCreationAttempt(
          userId,
          pending,
          slug,
          true,
        )
        if (pendingSaved !== "saved") {
          throw new Error(
            "Turn on browser storage so we can safely finish your organization.",
          )
        }
        profileWritePendingRef.current = true

        const res = await fetch("/api/dashboard/org-profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, expectedOrganizationId: orgId }),
        })

        if (!res.ok) {
          if (res.status >= 400 && res.status < 500) {
            profileWritePendingRef.current = false
            saveOrganizationCreationAttempt(userId, pending, slug, false)
          }
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? "Failed to save organization slug")
        }

        profileWritePendingRef.current = false
        const completed = completeOrganizationCreationAttempt(
          userId,
          pending,
          slug,
          orgId,
        )
        if (completed !== "saved") {
          throw new Error(
            "We couldn't safely finish your organization. Keep this page open and try again.",
          )
        }
        completedOrganizationIdRef.current = orgId
        router.replace(redirectUrl)
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create organization",
      )
    } finally {
      submitInFlightRef.current = false
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
    (slugStatus === "available" ||
      profileWritePendingRef.current ||
      completedOrganizationIdRef.current !== null) &&
    Boolean(createOrganization) &&
    Boolean(setActive) &&
    !isSubmitting

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          Events are managed under organizations. Set up yours to get started.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      >
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
              disabled={
                isSubmitting ||
                createdOrgId !== null ||
                pendingCreationRef.current !== null
              }
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
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                setSlugEdited(true)
              }}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              required
              disabled={isSubmitting}
              readOnly={
                profileWritePendingRef.current ||
                completedOrganizationIdRef.current !== null
              }
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
              onClick={() => router.replace(skipUrl)}
              disabled={
                isSubmitting ||
                createdOrgId !== null ||
                pendingCreationRef.current !== null
              }
            >
              Skip for now
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
