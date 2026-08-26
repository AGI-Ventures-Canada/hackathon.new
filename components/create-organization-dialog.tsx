"use client"

import { useState, useEffect, useRef } from "react"
import { useOrganizationList, useUser } from "@clerk/nextjs"
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
import {
  clearOrganizationCreationAttempt,
  completeOrganizationCreationAttempt,
  findOrganizationBySlug,
  loadOrganizationCreationAttempt,
  reconcilePendingOrganization,
  saveOrganizationCreationAttempt,
  snapshotPendingOrganizationCreation,
  withOrganizationCreationLock,
  type PendingOrganizationCreation,
} from "@/lib/auth/organization-creation"

interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void | Promise<void>
}

type CreatedOrganization = {
  id: string
  destroy: () => Promise<unknown>
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateOrganizationDialogProps) {
  const router = useRouter()
  const { createOrganization, setActive } = useOrganizationList()
  const { user } = useUser()
  const userId = user?.id ?? null
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createdOrgRef = useRef<CreatedOrganization | null>(null)
  const destroyableOrganizationIdRef = useRef<string | null>(null)
  const profileSavedRef = useRef(false)
  const submitInFlightRef = useRef(false)
  const discardInFlightRef = useRef(false)
  const pendingCreationRef = useRef<PendingOrganizationCreation | null>(null)
  const profileWritePendingRef = useRef(false)
  const completedOrganizationIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !userId) return
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
  }, [open, userId])

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
    if (
      submitInFlightRef.current ||
      !name.trim() ||
      !slug ||
      !isValidSlugFormat(slug) ||
      (slugAvailable !== true &&
        !profileWritePendingRef.current &&
        !completedOrganizationIdRef.current) ||
      !createOrganization ||
      !setActive ||
      !user ||
      !userId
    )
      return

    submitInFlightRef.current = true
    setIsSubmitting(true)
    setError(null)

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
          profileSavedRef.current = true
          profileWritePendingRef.current = false
          completedOrganizationIdRef.current =
            latestAttempt.completedOrganizationId
          await setActive({
            organization: latestAttempt.completedOrganizationId,
          })
          if (onSuccess) {
            await onSuccess()
          } else {
            router.push("/home")
          }
          resetForm()
          onOpenChange(false)
          return
        }

        if (!profileSavedRef.current && !profileWritePendingRef.current) {
          const checkRes = await fetch(
            `/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(slug)}`,
          )
          if (checkRes.ok) {
            const checkData = await checkRes.json()
            if (!checkData.available) {
              setSlugAvailable(false)
              setError("This slug was just taken. Pick another one.")
              return
            }
          }
        }

        let org = createdOrgRef.current
        if (!org) {
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

          org = shouldReconcile
            ? await reconcilePendingOrganization(
                pending,
                (params) => user.getOrganizationMemberships(params),
                slug,
              )
            : null
          if (!org) {
            try {
              org = await createOrganization({ name: name.trim(), slug })
              destroyableOrganizationIdRef.current = org.id
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
          createdOrgRef.current = org
        }
        await setActive({ organization: org.id })

        const pending = pendingCreationRef.current
        if (!pending)
          throw new Error(
            "We couldn't recover the organization setup. Try again.",
          )

        if (profileWritePendingRef.current && !profileSavedRef.current) {
          const profileRes = await fetch(
            `/api/dashboard/org-profile?expectedOrganizationId=${encodeURIComponent(org.id)}`,
          )
          if (!profileRes.ok) {
            throw new Error(
              "We couldn't check the organization profile. Keep this window open and try again.",
            )
          }
          const profile = (await profileRes.json()) as { slug?: unknown }
          if (profile.slug === slug) {
            profileSavedRef.current = true
            profileWritePendingRef.current = false
            const completed = completeOrganizationCreationAttempt(
              userId,
              pending,
              slug,
              org.id,
            )
            if (completed !== "saved") {
              throw new Error(
                "We couldn't safely finish your organization. Keep this window open and try again.",
              )
            }
            completedOrganizationIdRef.current = org.id
          } else {
            const checkRes = await fetch(
              `/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(slug)}`,
            )
            if (!checkRes.ok || !(await checkRes.json()).available) {
              setSlugAvailable(false)
              setError(
                "We couldn't confirm the saved slug yet. Keep this window open and try again.",
              )
              return
            }
            profileWritePendingRef.current = false
            saveOrganizationCreationAttempt(userId, pending, slug, false)
          }
        }

        if (!profileSavedRef.current) {
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
            body: JSON.stringify({ slug, expectedOrganizationId: org.id }),
          })

          if (!res.ok) {
            if (res.status >= 400 && res.status < 500) {
              profileWritePendingRef.current = false
              saveOrganizationCreationAttempt(userId, pending, slug, false)
            }
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error ?? "Failed to save organization slug")
          }
          profileSavedRef.current = true
          profileWritePendingRef.current = false
          const completed = completeOrganizationCreationAttempt(
            userId,
            pending,
            slug,
            org.id,
          )
          if (completed !== "saved") {
            throw new Error(
              "We couldn't safely finish your organization. Keep this window open and try again.",
            )
          }
          completedOrganizationIdRef.current = org.id
        }

        if (onSuccess) {
          await onSuccess()
        } else {
          router.push("/home")
        }
        resetForm()
        onOpenChange(false)
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
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  function resetForm() {
    setName("")
    setSlug("")
    setSlugEdited(false)
    setSlugAvailable(null)
    setError(null)
    createdOrgRef.current = null
    destroyableOrganizationIdRef.current = null
    pendingCreationRef.current = null
    profileSavedRef.current = false
    profileWritePendingRef.current = false
    completedOrganizationIdRef.current = null
  }

  async function closeDialog() {
    if (submitInFlightRef.current || discardInFlightRef.current) return
    discardInFlightRef.current = true
    setIsDiscarding(true)
    setError(null)
    try {
      const storedBeforeClose = userId
        ? loadOrganizationCreationAttempt(userId)
        : null
      if (
        !createdOrgRef.current &&
        !pendingCreationRef.current &&
        !storedBeforeClose
      ) {
        resetForm()
        onOpenChange(false)
        return
      }
      if (!userId) {
        setError(
          "We couldn't check the unfinished organization. Try again before closing.",
        )
        return
      }
      await withOrganizationCreationLock(userId, async () => {
        if (userId) {
          const stored = loadOrganizationCreationAttempt(userId)
          if (stored?.completedOrganizationId) {
            resetForm()
            onOpenChange(false)
            return
          }
        }
        let createdOrg = createdOrgRef.current
        if (!createdOrg && pendingCreationRef.current) {
          if (!user) {
            setError(
              "We couldn't check the unfinished organization. Try again before closing.",
            )
            return
          }
          try {
            createdOrg = await reconcilePendingOrganization(
              pendingCreationRef.current,
              (params) => user.getOrganizationMemberships(params),
              slug,
            )
          } catch {
            setError(
              "We couldn't check the unfinished organization. Try again before closing.",
            )
            return
          }
          createdOrgRef.current = createdOrg
        }
        if (createdOrg && !profileSavedRef.current) {
          if (profileWritePendingRef.current) {
            if (!setActive || !userId || !pendingCreationRef.current) {
              setError(
                "We couldn't check the unfinished organization. Try again before closing.",
              )
              return
            }
            try {
              await setActive({ organization: createdOrg.id })
              const profileRes = await fetch(
                `/api/dashboard/org-profile?expectedOrganizationId=${encodeURIComponent(createdOrg.id)}`,
              )
              if (!profileRes.ok) throw new Error("profile_check_failed")
              const profile = (await profileRes.json()) as { slug?: unknown }
              if (profile.slug === slug) {
                profileSavedRef.current = true
                profileWritePendingRef.current = false
                const completed = completeOrganizationCreationAttempt(
                  userId,
                  pendingCreationRef.current,
                  slug,
                  createdOrg.id,
                )
                if (completed !== "saved") {
                  throw new Error("completion_store_failed")
                }
                completedOrganizationIdRef.current = createdOrg.id
              } else {
                setError(
                  "We couldn't confirm the saved slug yet, so we kept the organization. Try again before closing.",
                )
                return
              }
            } catch {
              setError(
                "We couldn't check the unfinished organization, so we kept it. Try again before closing.",
              )
              return
            }
          }
        }
        if (createdOrg && !profileSavedRef.current) {
          if (destroyableOrganizationIdRef.current !== createdOrg.id) {
            resetForm()
            onOpenChange(false)
            return
          }
          try {
            await createdOrg.destroy()
          } catch {
            setError(
              "We couldn't remove the unfinished organization. Try again.",
            )
            return
          }
          createdOrgRef.current = null
          destroyableOrganizationIdRef.current = null
          try {
            await setActive?.({ organization: null })
          } catch {}
        }
        if (userId && !profileSavedRef.current) {
          clearOrganizationCreationAttempt(userId)
        }
        resetForm()
        onOpenChange(false)
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't check the unfinished organization. Try again before closing.",
      )
    } finally {
      discardInFlightRef.current = false
      setIsDiscarding(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    void closeDialog()
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
    !isSubmitting &&
    !isDiscarding

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!isSubmitting && !isDiscarding}
        onEscapeKeyDown={(event) => {
          if (isSubmitting || isDiscarding) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (isSubmitting || isDiscarding) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Create New Organization</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        >
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
                disabled={
                  isSubmitting ||
                  isDiscarding ||
                  createdOrgRef.current !== null ||
                  pendingCreationRef.current !== null
                }
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
                disabled={
                  isSubmitting || isDiscarding || profileSavedRef.current
                }
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
                    "At least 3 characters — lowercase letters, numbers, and hyphens only"}
                </p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => void closeDialog()}
              disabled={isSubmitting || isDiscarding}
            >
              {isDiscarding ? "Canceling..." : "Cancel"}
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
