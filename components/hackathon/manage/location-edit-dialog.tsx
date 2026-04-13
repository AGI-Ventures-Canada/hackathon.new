"use client"

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
}

export function LocationEditDialog({ open, onOpenChange, hackathonId, initialData }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set event location</DialogTitle>
        </DialogHeader>
        <LocationEditForm
          hackathonId={hackathonId}
          initialData={initialData}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
