"use client"

import Image from "next/image"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Plus } from "lucide-react"
import { useOrganizationList } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { CreateOrganizationDialog } from "@/components/create-organization-dialog"

export function CliAuthOrgGate() {
  const router = useRouter()
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const [createOrgOpen, setCreateOrgOpen] = useState(false)
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function chooseOrg(orgId: string) {
    setError(null)
    setSwitchingOrgId(orgId)

    try {
      await setActive?.({ organization: orgId })
      router.refresh()
    } catch {
      setError("We couldn't switch organizations. Try again.")
      setSwitchingOrgId(null)
    }
  }

  function handleOrgCreated() {
    setCreateOrgOpen(false)
    router.refresh()
  }

  const memberships = userMemberships?.data ?? []

  return (
    <>
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Building2 className="size-6" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">Pick an organization</h1>
        <p className="mb-6 text-muted-foreground">
          Pick where this terminal should make events.
        </p>

        <div className="space-y-3 text-left">
          {memberships.map((membership) => {
            const org = membership.organization
            const isSwitching = switchingOrgId === org.id

            return (
              <Button
                key={org.id}
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={switchingOrgId !== null}
                onClick={() => void chooseOrg(org.id)}
              >
                {org.imageUrl ? (
                  <Image
                    src={org.imageUrl}
                    alt={org.name}
                    width={24}
                    height={24}
                    className="size-6 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-6 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
                    {org.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate">{isSwitching ? "Switching..." : org.name}</span>
              </Button>
            )
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={switchingOrgId !== null}
            onClick={() => setCreateOrgOpen(true)}
          >
            <Plus className="size-4" />
            Create organization
          </Button>
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>

      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
        onSuccess={handleOrgCreated}
      />
    </>
  )
}
