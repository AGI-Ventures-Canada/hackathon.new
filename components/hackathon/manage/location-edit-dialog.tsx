"use client"

import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LocationEditForm } from "@/components/hackathon/edit-drawer/location-edit-form"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hackathonId: string
  initialData: {
    locationType: "in_person" | "virtual" | null
    locationName: string | null
    locationUrl: string | null
    locationLatitude: number | null
    locationLongitude: number | null
    requireLocationVerification: boolean
  }
  onSaved?: () => void
}

export function LocationEditDialog({ open, onOpenChange, hackathonId, initialData, onSaved }: Props) {
  const router = useRouter()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set event location</DialogTitle>
        </DialogHeader>
        <LocationEditForm
          hackathonId={hackathonId}
          initialData={initialData}
          onSave={async (data) => {
            const res = await fetch(`/api/dashboard/hackathons/${hackathonId}/settings`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error || "Failed to save")
            }
            router.refresh()
            onSaved?.()
            onOpenChange(false)
            return true
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
