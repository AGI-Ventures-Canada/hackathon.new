"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { OptimizedImage } from "@/components/ui/optimized-image"
import { useIsClient } from "@/hooks/use-is-client"
import type { DraftState } from "@/lib/hackathon-draft"

const LOCATION_TYPE_LABELS: Record<
  NonNullable<DraftState["locationType"]>,
  string
> = {
  in_person: "In person",
  virtual: "Online",
  hybrid: "In person and online",
}

function valueOrNotSet(value: string | null): string {
  return value?.trim() || "Not set"
}

function formatDate(value: string | null, isClient: boolean): string {
  if (!value) return "Not set"
  if (!isClient) return "Loading…"
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function safeImageUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function DraftReview({ state }: { state: DraftState }) {
  const isClient = useIsClient()
  const imageUrl = safeImageUrl(state.imageUrl)

  return (
    <div className="space-y-4" data-webmcp-draft-review>
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Review your event</h1>
        <p className="text-sm text-muted-foreground">
          Check every section before you create it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{state.name.trim() || "Untitled event"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium">What&apos;s it about?</p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {valueOrNotSet(state.description)}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-medium">Starts</p>
              <p className="text-muted-foreground">{formatDate(state.startsAt, isClient)}</p>
            </div>
            <div>
              <p className="font-medium">Ends</p>
              <p className="text-muted-foreground">{formatDate(state.endsAt, isClient)}</p>
            </div>
            <div>
              <p className="font-medium">Registration opens</p>
              <p className="text-muted-foreground">
                {formatDate(state.registrationOpensAt, isClient)}
              </p>
            </div>
            <div>
              <p className="font-medium">Registration closes</p>
              <p className="text-muted-foreground">
                {formatDate(state.registrationClosesAt, isClient)}
              </p>
            </div>
            <div>
              <p className="font-medium">Location type</p>
              <p className="text-muted-foreground">
                {state.locationType
                  ? LOCATION_TYPE_LABELS[state.locationType]
                  : "Not set"}
              </p>
            </div>
            <div>
              <p className="font-medium">Location name</p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {valueOrNotSet(state.locationName)}
              </p>
            </div>
            <div>
              <p className="font-medium">Location link</p>
              <p className="break-all text-muted-foreground">
                {valueOrNotSet(state.locationUrl)}
              </p>
            </div>
            <div>
              <p className="font-medium">Event image</p>
              <p className="break-all text-muted-foreground">{valueOrNotSet(imageUrl)}</p>
            </div>
          </div>
          {imageUrl && (
            <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
              <OptimizedImage
                src={imageUrl}
                alt={`${state.name.trim() || "Event"} image`}
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover"
                unoptimized
              />
            </div>
          )}
          <div>
            <p className="font-medium">Rules</p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {valueOrNotSet(state.rules)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Sponsors ({state.sponsors.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {state.sponsors.length ? state.sponsors.map((sponsor, index) => (
              <Badge key={`${sponsor.name}-${index}`} variant="secondary">
                {sponsor.name}{sponsor.tier ? ` · ${sponsor.tier}` : ""}
              </Badge>
            )) : <p className="text-sm text-muted-foreground">None yet</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Prizes ({state.prizes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {state.prizes.length ? state.prizes.map((prize, index) => (
              <div key={`${prize.name}-${index}`}>
                <p className="text-sm font-medium">{prize.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[prize.value, prize.description].filter(Boolean).join(" · ") || "No details yet"}
                </p>
              </div>
            )) : <p className="text-sm text-muted-foreground">None yet</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Challenges ({state.challenges.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.challenges.length ? state.challenges.map((challenge, index) => (
              <div className="space-y-3 rounded-md border p-3" key={`${challenge.title}-${index}`}>
                <p className="text-sm font-medium">{challenge.title}</p>
                <div>
                  <p className="text-sm font-medium">What&apos;s the challenge?</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {valueOrNotSet(challenge.description)}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Resources ({challenge.resources.length})
                  </p>
                  {challenge.resources.length ? (
                    <ul className="space-y-2">
                      {challenge.resources.map((resource, resourceIndex) => (
                        <li
                          className="space-y-1 rounded-md bg-muted p-2"
                          key={`${resource.url}-${resourceIndex}`}
                        >
                          <p className="text-sm">
                            {valueOrNotSet(resource.label)}
                          </p>
                          <p className="break-all text-xs text-muted-foreground">
                            {resource.url}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">None yet</p>
                  )}
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">None yet</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Schedule ({state.agendaItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.agendaItems.length ? state.agendaItems.map((item, index) => (
              <div className="space-y-3 rounded-md border p-3" key={`${item.title}-${index}`}>
                <p className="text-sm font-medium">{item.title}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">Starts</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.startsAt, isClient)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Ends</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.endsAt, isClient)}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">What happens?</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {valueOrNotSet(item.description)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Where?</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {valueOrNotSet(item.location)}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Speakers ({item.speakers.length})</p>
                  {item.speakers.length ? (
                    <div className="flex flex-wrap gap-2">
                      {item.speakers.map((speaker, speakerIndex) => (
                        <Badge
                          key={`${speaker}-${speakerIndex}`}
                          variant="secondary"
                        >
                          {speaker}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">None yet</p>
                  )}
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">We&apos;ll add a starter schedule.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
