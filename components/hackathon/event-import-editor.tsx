"use client"

import { useCallback } from "react"
import { HackathonDraftEditor, type DraftState } from "@/components/hackathon/hackathon-draft-editor"
import type { EventPageData } from "@/lib/services/event-page-import"
import type { EventPageRichContent } from "@/lib/services/luma-extract"

type EventImportEditorProps = {
  eventData: EventPageData
  richContent: EventPageRichContent | null
  sourceUrl: string
  storageKey: string
  submitPath: string
}

function eventDataToState(
  eventData: EventPageData,
  richContent: EventPageRichContent | null
): DraftState {
  return {
    name: eventData.name,
    description: eventData.description,
    startsAt: eventData.startsAt,
    endsAt: eventData.endsAt,
    locationType: eventData.locationType,
    locationName: eventData.locationName,
    locationUrl: eventData.locationUrl,
    imageUrl: eventData.imageUrl,
    sponsors: richContent?.sponsors ?? [],
    rules: richContent?.rules ?? null,
    prizes: richContent?.prizes?.map((prize) => ({
      name: prize.name,
      description: prize.description,
      value: prize.value,
    })) ?? [],
  }
}

export function EventImportEditor({
  eventData,
  richContent,
  sourceUrl,
  storageKey,
  submitPath,
}: EventImportEditorProps) {
  const handleSubmit = useCallback(async (state: DraftState) => {
    const res = await fetch(submitPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: state.name,
        description: state.description,
        startsAt: state.startsAt,
        endsAt: state.endsAt,
        locationType: state.locationType,
        locationName: state.locationName,
        locationUrl: state.locationUrl,
        imageUrl: state.imageUrl,
        sponsors: state.sponsors,
        rules: state.rules,
        prizes: state.prizes,
        sourceUrl,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to create hackathon")
    }

    return res.json()
  }, [submitPath, sourceUrl])

  return (
    <HackathonDraftEditor
      initialState={eventDataToState(eventData, richContent)}
      storageKey={storageKey}
      onSubmit={handleSubmit}
      sourceUrl={sourceUrl}
      signInDescription="Your edits have been saved. Sign in to upload images and create your hackathon."
    />
  )
}
