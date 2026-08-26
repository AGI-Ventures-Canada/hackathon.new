"use client"

import Image from "next/image"
import { Loader2, Plus } from "lucide-react"
import { useAuth, useOrganizationList } from "@clerk/nextjs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CreateOrganizationDialog } from "@/components/create-organization-dialog"
import { useRef, useState } from "react"

type OrgGateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOrgSelected: () => void | Promise<void>
}

export function OrgGateDialog({ open, onOpenChange, onOrgSelected }: OrgGateDialogProps) {
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const { getToken } = useAuth()
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const switchInFlightRef = useRef(false)

  const memberships = (userMemberships?.data ?? []).filter(
    (membership) => membership.role === "org:admin",
  )
  const hasMemberships = memberships.length > 0
  const showLoading = !isLoaded || (userMemberships?.isLoading ?? false)

  async function switchToOrg(orgId: string) {
    if (switchInFlightRef.current) return
    switchInFlightRef.current = true
    setSwitchingOrgId(orgId)
    setError(null)
    try {
      if (!setActive) throw new Error("organization_switch_unavailable")
      await setActive({ organization: orgId })
      const token = await getToken({ skipCache: true })
      if (!token) throw new Error("token_refresh_failed")
      await onOrgSelected()
      onOpenChange(false)
    } catch {
      setError("We couldn't connect that organization. Try again.")
    } finally {
      switchInFlightRef.current = false
      setSwitchingOrgId(null)
    }
  }

  return (
    <>
      <Dialog
        open={open && !createOrgOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && switchingOrgId) return
          onOpenChange(nextOpen)
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={switchingOrgId === null}
          onEscapeKeyDown={(event) => {
            if (switchingOrgId) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (switchingOrgId) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>Pick an organization</DialogTitle>
            <DialogDescription>
              Pick where to create your private event draft. You can cancel and keep editing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {showLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {hasMemberships && (
                  <div className="space-y-1">
                    {memberships.map((mem) => {
                      const isSwitching = switchingOrgId === mem.organization.id
                      const otherSwitching = switchingOrgId !== null && !isSwitching
                      return (
                        <Button
                          key={mem.organization.id}
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => void switchToOrg(mem.organization.id)}
                          disabled={otherSwitching}
                        >
                          {mem.organization.imageUrl ? (
                            <Image
                              src={mem.organization.imageUrl}
                              alt={mem.organization.name}
                              width={24}
                              height={24}
                              className="size-6 rounded object-cover"
                            />
                          ) : (
                            <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-semibold">
                              {mem.organization.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="flex-1 text-left">{mem.organization.name}</span>
                          {isSwitching && <Loader2 className="size-4 animate-spin" />}
                        </Button>
                      )
                    })}
                  </div>
                )}
                {userMemberships?.hasNextPage && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => userMemberships.fetchNext?.()}
                    disabled={userMemberships.isFetching}
                  >
                    {userMemberships.isFetching ? "Loading…" : "Show more"}
                  </Button>
                )}
                <div>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setCreateOrgOpen(true)}
                    disabled={switchingOrgId !== null}
                  >
                    <Plus className="size-4" />
                    {hasMemberships ? "Create a new organization" : "Create your first organization"}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                  disabled={switchingOrgId !== null}
                >
                  Cancel
                </Button>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
        onSuccess={async () => {
          const token = await getToken({ skipCache: true })
          if (!token) throw new Error("We couldn't refresh your sign-in. Try again.")
          await onOrgSelected()
          setCreateOrgOpen(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}
