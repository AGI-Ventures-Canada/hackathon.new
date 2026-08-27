"use client"

import { MapPin, Video, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { AddressAutocomplete } from "@/components/ui/address-autocomplete"
import { normalizeUrlFieldValue, urlInputProps } from "@/lib/utils/url"

type LocationType = "in_person" | "virtual" | "hybrid" | null

interface StepLocationProps {
  locationType: LocationType
  locationName: string | null
  locationUrl: string | null
  onChange: (data: {
    locationType: LocationType
    locationName: string | null
    locationUrl: string | null
  }) => void
}

export function StepLocation({ locationType, locationName, locationUrl, onChange }: StepLocationProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
          Where will it take place?
        </h1>
        <p className="text-muted-foreground">
          In-person, virtual, both, or skip for now.
        </p>
      </div>

      <div className="flex gap-3" role="group" aria-label="Event location type">
        <Button
          type="button"
          variant={locationType === "in_person" ? "default" : "outline"}
          className="h-auto flex-1 flex-col gap-1 py-4"
          onClick={() =>
            onChange({
              locationType: "in_person",
              locationName: locationName,
              locationUrl,
            })
          }
          aria-pressed={locationType === "in_person"}
        >
          <MapPin className="size-5" />
          <span className="text-sm">In-person</span>
        </Button>
        <Button
          type="button"
          variant={locationType === "virtual" ? "default" : "outline"}
          className="h-auto flex-1 flex-col gap-1 py-4"
          onClick={() =>
            onChange({
              locationType: "virtual",
              locationName,
              locationUrl: locationUrl,
            })
          }
          aria-pressed={locationType === "virtual"}
        >
          <Video className="size-5" />
          <span className="text-sm">Virtual</span>
        </Button>
        <Button
          type="button"
          variant={locationType === "hybrid" ? "default" : "outline"}
          className="h-auto flex-1 flex-col gap-1 py-4"
          onClick={() =>
            onChange({
              locationType: "hybrid",
              locationName: locationName,
              locationUrl: locationUrl,
            })
          }
          aria-pressed={locationType === "hybrid"}
        >
          <Globe className="size-5" />
          <span className="text-sm">Hybrid</span>
        </Button>
      </div>

      {(locationType === "in_person" || locationType === "hybrid") && (
        <Field>
          <FieldLabel htmlFor="location-name">Venue</FieldLabel>
          <AddressAutocomplete
            id="location-name"
            value={locationName ?? ""}
            onChange={(val) =>
              onChange({ locationType, locationName: val || null, locationUrl })
            }
            placeholder="Search for a venue..."
            maxLength={240}
          />
        </Field>
      )}

      {(locationType === "virtual" || locationType === "hybrid") && (
        <Field>
          <FieldLabel htmlFor="location-url">Meeting link</FieldLabel>
          <Input
            id="location-url"
            {...urlInputProps}
            placeholder="zoom.us/j/123456789"
            value={locationUrl ?? ""}
            maxLength={2_048}
            onChange={(e) =>
              onChange({ locationType, locationName, locationUrl: e.target.value || null })
            }
            onBlur={() =>
              onChange({
                locationType,
                locationName,
                locationUrl: normalizeUrlFieldValue(locationUrl ?? "") || null,
              })
            }
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
        </Field>
      )}
    </div>
  )
}
