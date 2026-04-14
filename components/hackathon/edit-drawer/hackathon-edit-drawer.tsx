"use client"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { ChevronUp, ChevronDown } from "lucide-react"
import { useEdit, type EditSection, SECTION_ORDER } from "@/components/hackathon/preview/edit-context"
import { NameEditForm } from "./name-edit-form"

import { TimelineEditForm } from "./timeline-edit-form"
import { LocationEditForm } from "./location-edit-form"
import { SponsorsEditForm } from "./sponsors-edit-form"
import { JudgesEditForm } from "./judges-edit-form"
import { PrizesEditForm } from "./prizes-edit-form"
import type { PublicHackathon } from "@/lib/services/public-hackathons"

interface HackathonEditDrawerProps {
  hackathon: PublicHackathon
}

const sectionMeta: Record<Exclude<EditSection, null>, { title: string; description: string }> = {
  name: {
    title: "Edit Name",
    description: "Update the hackathon name",
  },
  dates: {
    title: "Edit Registration Dates",
    description: "Set when registration opens and closes",
  },
  about: {
    title: "Edit About",
    description: "Update the hackathon description",
  },
  timeline: {
    title: "Edit Timeline",
    description: "Update the hackathon schedule",
  },
  location: {
    title: "Edit Location",
    description: "Set the event location or virtual link",
  },
  sponsors: {
    title: "Manage Sponsors",
    description: "Add or remove hackathon sponsors",
  },
  judges: {
    title: "Manage Judges",
    description: "Add or remove hackathon judges",
  },
  prizes: {
    title: "Manage Prizes",
    description: "Add or remove hackathon prizes",
  },
}

export function HackathonEditDrawer({ hackathon }: HackathonEditDrawerProps) {
  const { activeSection, openSection, closeDrawer } = useEdit()

  const INLINE_SECTIONS: Set<string> = new Set(["about"])
  const isOpen = activeSection !== null && !INLINE_SECTIONS.has(activeSection)
  const currentIndex = activeSection ? SECTION_ORDER.indexOf(activeSection) : -1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < SECTION_ORDER.length - 1

  function goToPrev() {
    if (hasPrev) openSection(SECTION_ORDER[currentIndex - 1])
  }

  function goToNext() {
    if (hasNext) openSection(SECTION_ORDER[currentIndex + 1])
  }

  function handleSaveAndNext() {
    if (hasNext) {
      openSection(SECTION_ORDER[currentIndex + 1])
    } else {
      closeDrawer()
    }
  }

  return (
    <Drawer direction="right" open={isOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <DrawerTitle>
                {activeSection ? sectionMeta[activeSection].title : "Edit"}
              </DrawerTitle>
              <DrawerDescription>
                {activeSection ? sectionMeta[activeSection].description : ""}
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 ml-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={goToPrev}
                disabled={!hasPrev}
              >
                <ChevronUp className="size-4" />
                <span className="sr-only">Previous section</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={goToNext}
                disabled={!hasNext}
              >
                <ChevronDown className="size-4" />
                <span className="sr-only">Next section</span>
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {activeSection === "name" && (
            <NameEditForm
              hackathonId={hackathon.id}
              initialName={hackathon.name}
              onSaveAndNext={handleSaveAndNext}
            />
          )}

          {activeSection === "timeline" && (
            <TimelineEditForm
              hackathonId={hackathon.id}
              initialData={{
                startsAt: hackathon.starts_at,
                endsAt: hackathon.ends_at,
              }}
              onSaveAndNext={handleSaveAndNext}
            />
          )}

          {activeSection === "location" && (
            <LocationEditForm
              hackathonId={hackathon.id}
              initialData={{
                locationType: hackathon.location_type,
                locationName: hackathon.location_name,
                locationUrl: hackathon.location_url,
                locationLatitude: hackathon.location_latitude,
                locationLongitude: hackathon.location_longitude,
                requireLocationVerification: hackathon.require_location_verification,
              }}
              onSaveAndNext={handleSaveAndNext}
            />
          )}

          {activeSection === "sponsors" && (
            <SponsorsEditForm
              hackathonId={hackathon.id}
              initialSponsors={hackathon.sponsors}
              onSaveAndNext={handleSaveAndNext}
            />
          )}

          {activeSection === "judges" && (
            <JudgesEditForm
              hackathonId={hackathon.id}
              initialJudges={hackathon.judges}
              onSaveAndNext={handleSaveAndNext}
            />
          )}

          {activeSection === "prizes" && (
            <PrizesEditForm
              hackathonId={hackathon.id}
              initialPrizes={hackathon.prizes}
              onSaveAndNext={handleSaveAndNext}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
