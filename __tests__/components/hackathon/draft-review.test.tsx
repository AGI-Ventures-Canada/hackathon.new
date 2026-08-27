import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { DraftState } from "@/lib/hackathon-draft"

mock.module("@/components/ui/optimized-image", () => ({
  OptimizedImage: ({ alt }: { alt: string }) => (
    <span aria-label={alt} role="img" />
  ),
}))

const { DraftReview } = await import("@/components/hackathon/draft-review")

const richDraft: DraftState = {
  name: "Agent Builders Jam",
  description: "Build a helpful agent for your community.",
  startsAt: "2026-09-08T12:30:00.000Z",
  endsAt: "2026-09-09T21:00:00.000Z",
  registrationOpensAt: "2026-08-26T14:00:00.000Z",
  registrationClosesAt: "2026-09-07T21:00:00.000Z",
  locationType: "hybrid",
  locationName: "Community Hall, 123 Main Street",
  locationUrl: "https://meet.example.com/agent-builders",
  imageUrl: "https://images.example.com/agent-builders.png",
  sponsors: [
    { name: "OpenAI", tier: "Community partner" },
    { name: "Oatmeal Labs", tier: null },
  ],
  rules: "Be kind. Use safe test data.",
  prizes: [
    {
      name: "Best helper",
      description: "For the most useful project.",
      value: "$5,000",
    },
  ],
  challenges: [
    {
      title: "Help your neighborhood",
      description: "Make a tool that solves a local problem.",
      resources: [
        {
          label: "Community data guide",
          url: "https://data.example.com/community-guide",
        },
        {
          label: "Starter kit",
          url: "https://code.example.com/starter-kit",
        },
      ],
    },
    {
      title: "Make access easier",
      description: "Help more people use public services.",
      resources: [
        {
          label: "Access checklist",
          url: "https://access.example.com/checklist",
        },
      ],
    },
  ],
  agendaItems: [
    {
      title: "Welcome and kickoff",
      description: "Meet the team and hear the challenge rules.",
      startsAt: "2026-09-08T12:45:00.000Z",
      endsAt: "2026-09-08T13:15:00.000Z",
      location: "Main stage",
      speakers: ["Alex Chen", "Sam Rivera"],
    },
    {
      title: "Project demos",
      description: "Each team shows what it built.",
      startsAt: "2026-09-09T18:00:00.000Z",
      endsAt: "2026-09-09T20:00:00.000Z",
      location: "Demo room and live stream",
      speakers: ["Jordan Lee"],
    },
  ],
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

afterEach(() => {
  cleanup()
})

describe("DraftReview", () => {
  it("shows every rich challenge, resource, and agenda detail", async () => {
    render(<DraftReview state={richDraft} />)

    for (const text of [
      "Agent Builders Jam",
      "Build a helpful agent for your community.",
      "In person and online",
      "Community Hall, 123 Main Street",
      "https://meet.example.com/agent-builders",
      "https://images.example.com/agent-builders.png",
      "Be kind. Use safe test data.",
      "OpenAI · Community partner",
      "Oatmeal Labs",
      "Best helper",
      "$5,000 · For the most useful project.",
      "Help your neighborhood",
      "Make a tool that solves a local problem.",
      "Community data guide",
      "https://data.example.com/community-guide",
      "Starter kit",
      "https://code.example.com/starter-kit",
      "Make access easier",
      "Help more people use public services.",
      "Access checklist",
      "https://access.example.com/checklist",
      "Welcome and kickoff",
      "Meet the team and hear the challenge rules.",
      "Main stage",
      "Alex Chen",
      "Sam Rivera",
      "Project demos",
      "Each team shows what it built.",
      "Demo room and live stream",
      "Jordan Lee",
    ]) {
      expect(screen.getByText(text)).toBeDefined()
    }

    for (const value of [
      richDraft.startsAt,
      richDraft.endsAt,
      richDraft.registrationOpensAt,
      richDraft.registrationClosesAt,
    ]) {
      expect(value).not.toBeNull()
      await waitFor(() => {
        expect(screen.getByText(formatDate(value!))).toBeDefined()
      })
    }

    for (const item of richDraft.agendaItems) {
      expect(item.startsAt).not.toBeNull()
      expect(item.endsAt).not.toBeNull()
      await waitFor(() => {
        expect(screen.getByText(formatDate(item.startsAt!))).toBeDefined()
        expect(screen.getByText(formatDate(item.endsAt!))).toBeDefined()
      })
    }

    expect(screen.getByRole("img", { name: "Agent Builders Jam image" })).toBeDefined()
  })

  it("uses plain names for each location type", () => {
    const view = render(
      <DraftReview state={{ ...richDraft, locationType: "in_person" }} />,
    )
    expect(screen.getByText("In person")).toBeDefined()

    view.rerender(
      <DraftReview state={{ ...richDraft, locationType: "virtual" }} />,
    )
    expect(screen.getByText("Online")).toBeDefined()

    view.rerender(
      <DraftReview state={{ ...richDraft, locationType: "hybrid" }} />,
    )
    expect(screen.getByText("In person and online")).toBeDefined()
  })
})
