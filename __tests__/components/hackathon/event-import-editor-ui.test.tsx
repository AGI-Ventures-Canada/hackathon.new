import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { DraftSource, DraftState } from "@/lib/hackathon-draft"
import type { EventPageData } from "@/lib/services/event-page-import"
import type { EventPageRichContent } from "@/lib/services/luma-extract"

type EditorProps = {
  initialState: DraftState
  storageKey: string
  legacyStorageKeys?: string[]
  sourceUrl?: string
  draftSource?: DraftSource
  initialNotice?: string
  createIfMissing?: boolean
  fallbackWhenNoSavedDraft?: React.ReactNode
  onSubmit: (
    state: DraftState,
    draftId: string,
    source: DraftSource,
    expectedOrganizationId: string,
  ) => Promise<{ id: string; slug: string }>
}

let latestProps: EditorProps | null = null
let lastSubmitResult: { id: string; slug: string } | null = null

mock.module("@/components/hackathon/hackathon-draft-editor", () => ({
  HackathonDraftEditor: (props: EditorProps) => {
    latestProps = props
    return (
      <div data-testid="draft-editor">
        {props.initialNotice && <p>{props.initialNotice}</p>}
        {props.fallbackWhenNoSavedDraft}
        <button
          type="button"
          onClick={async () => {
            lastSubmitResult = await props.onSubmit(
              props.initialState,
              "11111111-1111-4111-8111-111111111111",
              props.draftSource ?? { kind: "scratch", url: null },
              "org_123",
            )
          }}
        >
          Submit imported draft
        </button>
      </div>
    )
  },
}))

const fetchMock = mock((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(new Response(JSON.stringify({
    id: "22222222-2222-4222-8222-222222222222",
    slug: "imported-event",
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })),
)

const originalFetch = globalThis.fetch

const {
  EventImportEditor,
  EventImportRecovery,
} = await import("@/components/hackathon/event-import-editor")

const eventData: EventPageData = {
  name: "Imported event",
  description: "Build something useful.",
  startsAt: "2026-09-01T09:00:00-04:00",
  endsAt: "2026-09-01T17:00:00-04:00",
  locationType: "virtual",
  locationName: null,
  locationUrl: "https://meet.example.com/event",
  imageUrl: null,
  language: "en",
  translationLinks: [{
    url: "https://luma.com/fr?private=value",
    languageCode: "fr",
  }],
}

const richContent: EventPageRichContent = {
  sponsors: [],
  rules: null,
  prizes: [],
  challenges: [],
  translationLinks: [{
    url: "https://luma.com/es?private=value",
    languageCode: "es",
  }],
  agendaItems: [],
  cleanedDescription: "d".repeat(5_001),
}

beforeEach(() => {
  latestProps = null
  lastSubmitResult = null
  fetchMock.mockClear()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe("EventImportEditor", () => {
  it("passes a bounded, redacted draft and migration keys to the editor", () => {
    render(
      <EventImportEditor
        eventData={eventData}
        richContent={richContent}
        sourceUrl="https://events.example.com/event"
        storageKey="oatmeal:external-import:safe-reference"
        submitPath="/api/dashboard/import/event"
      />,
    )

    expect(latestProps?.storageKey).toBe(
      "oatmeal:external-import:safe-reference",
    )
    expect(latestProps?.legacyStorageKeys).toEqual([
      "oatmeal:external-import:safe-reference:https%3A%2F%2Fevents.example.com%2Fevent",
      "oatmeal:external-import",
    ])
    expect(latestProps?.initialState.description).toHaveLength(5_000)
    expect(latestProps?.draftSource).toEqual({
      kind: "event_import",
      url: "https://events.example.com/event",
      defaultLocale: "en",
      translationLinks: [
        { url: "https://luma.com/fr", languageCode: "fr" },
        { url: "https://luma.com/es", languageCode: "es" },
      ],
    })
    expect(
      screen.getByText(/some imported details were shortened or removed/i),
    ).toBeDefined()
  })

  it("posts the reviewed import exactly once with safe source metadata", async () => {
    render(
      <EventImportEditor
        eventData={eventData}
        richContent={{ ...richContent, cleanedDescription: null }}
        sourceUrl="https://events.example.com/event"
        storageKey="oatmeal:external-import:safe-reference"
        submitPath="/api/dashboard/import/event"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Submit imported draft" }))
    await waitFor(() => expect(lastSubmitResult).toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      slug: "imported-event",
    }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard/import/event")
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(request.method).toBe("POST")
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      draftId: "11111111-1111-4111-8111-111111111111",
      expectedOrganizationId: "org_123",
      sourceUrl: "https://events.example.com/event",
      defaultLocale: "en",
      translationLinks: [
        { url: "https://luma.com/fr", languageCode: "fr" },
        { url: "https://luma.com/es", languageCode: "es" },
      ],
    }))
  })

  it("reopens only an existing saved import draft", async () => {
    render(
      <EventImportRecovery
        sourceUrl="https://events.example.com/event"
        storageKey="oatmeal:external-import:safe-reference"
        submitPath="/api/dashboard/import/event"
        fallback={<p>No saved import</p>}
      />,
    )

    await waitFor(() => expect(screen.getByTestId("draft-editor")).toBeDefined())
    expect(latestProps?.createIfMissing).toBe(false)
    expect(latestProps?.initialState.name).toBe("")
    expect(latestProps?.sourceUrl).toBe("https://events.example.com/event")
    expect(screen.getByText("No saved import")).toBeDefined()
  })

  it("submits a recovered saved import through the same bounded request", async () => {
    render(
      <EventImportRecovery
        sourceUrl="https://events.example.com/event"
        storageKey="oatmeal:external-import:safe-reference"
        submitPath="/api/dashboard/import/event"
        fallback={<p>No saved import</p>}
      />,
    )

    fireEvent.click(await screen.findByRole("button", {
      name: "Submit imported draft",
    }))
    await waitFor(() => expect(lastSubmitResult).toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      slug: "imported-event",
    }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      draftId: "11111111-1111-4111-8111-111111111111",
      expectedOrganizationId: "org_123",
      sourceUrl: "https://events.example.com/event",
      defaultLocale: null,
      translationLinks: [],
    }))
  })
})
