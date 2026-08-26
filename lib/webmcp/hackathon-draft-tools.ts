import { z } from "zod"
import {
  hackathonDraftPatchSchema,
  type DraftEnvelope,
  type DraftPatch,
} from "@/lib/hackathon-draft"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import { defineWebMcpTool } from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"

type HackathonDraftToolActions = {
  getEnvelope: () => DraftEnvelope
  updateDraft: (expectedRevision: number, patch: DraftPatch) => DraftEnvelope
  openReview: () => void
  openSignIn?: () => void
}

function snippet(value: string | null, maxLength: number): string | null {
  if (!value || value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

const draftSectionSchema = z.enum([
  "overview",
  "content",
  "sponsors",
  "prizes",
  "challenges",
  "schedule",
])

type DraftSection = z.infer<typeof draftSectionSchema>

function summarizeEnvelope(
  envelope: DraftEnvelope,
  section: DraftSection,
  offset: number,
  resourceOffset: number,
) {
  const state = envelope.state
  const header = {
    version: envelope.version,
    revision: envelope.revision,
    savedAt: envelope.savedAt,
    section,
  }

  if (section === "overview") {
    return {
      ...header,
      source: {
        kind: envelope.source.kind,
        url: snippet(envelope.source.url, 160),
      },
      state: {
        name: snippet(state.name, 120),
        startsAt: state.startsAt,
        endsAt: state.endsAt,
        registrationOpensAt: state.registrationOpensAt,
        registrationClosesAt: state.registrationClosesAt,
        locationType: state.locationType,
        locationName: snippet(state.locationName, 120),
      },
      totals: {
        sponsors: state.sponsors.length,
        prizes: state.prizes.length,
        challenges: state.challenges.length,
        agendaItems: state.agendaItems.length,
      },
      canCreate: state.name.trim().length > 0,
    }
  }

  if (section === "content") {
    return {
      ...header,
      state: {
        name: snippet(state.name, 120),
        description: snippet(state.description, 350),
        locationUrl: snippet(state.locationUrl, 160),
        imageUrl: snippet(state.imageUrl, 160),
        rules: snippet(state.rules, 350),
      },
    }
  }

  if (section === "sponsors") {
    const items = state.sponsors.slice(offset, offset + 4).map((sponsor) => ({
      name: snippet(sponsor.name, 80),
      tier: snippet(sponsor.tier, 40),
    }))
    return {
      ...header,
      offset,
      total: state.sponsors.length,
      nextOffset: offset + items.length < state.sponsors.length ? offset + items.length : null,
      items,
    }
  }

  if (section === "prizes") {
    const items = state.prizes.slice(offset, offset + 3).map((prize) => ({
      name: snippet(prize.name, 80),
      value: snippet(prize.value, 60),
      description: snippet(prize.description, 140),
    }))
    return {
      ...header,
      offset,
      total: state.prizes.length,
      nextOffset: offset + items.length < state.prizes.length ? offset + items.length : null,
      items,
    }
  }

  if (section === "challenges") {
    const challenge = state.challenges[offset]
    if (!challenge) {
      return { ...header, offset, total: state.challenges.length, challenge: null }
    }
    const resources = challenge.resources.slice(resourceOffset, resourceOffset + 3).map((resource) => ({
      label: snippet(resource.label, 80),
      url: snippet(resource.url, 160),
    }))
    return {
      ...header,
      offset,
      total: state.challenges.length,
      nextOffset: offset + 1 < state.challenges.length ? offset + 1 : null,
      challenge: {
        title: snippet(challenge.title, 100),
        description: snippet(challenge.description, 220),
        resourceOffset,
        resourceTotal: challenge.resources.length,
        resourceNextOffset:
          resourceOffset + resources.length < challenge.resources.length
            ? resourceOffset + resources.length
            : null,
        resources,
      },
    }
  }

  const items = state.agendaItems.slice(offset, offset + 2).map((item) => ({
    title: snippet(item.title, 80),
    description: snippet(item.description, 120),
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    location: snippet(item.location, 80),
    speakers: item.speakers.slice(0, 3).map((speaker) => snippet(speaker, 60)),
  }))
  return {
    ...header,
    offset,
    total: state.agendaItems.length,
    nextOffset: offset + items.length < state.agendaItems.length ? offset + items.length : null,
    items,
  }
}

export function createHackathonDraftTools(
  actions: HackathonDraftToolActions,
): WebMcpTool[] {
  const tools: WebMcpTool[] = [
    defineWebMcpTool({
      name: "get_hackathon_draft",
      title: "Read event draft",
      description:
        "Read one bounded section of the visible event draft. Start with overview, then page through a section before replacing its array.",
      schema: z.object({
        section: draftSectionSchema.default("overview"),
        offset: z.number().int().nonnegative().max(50).default(0),
        resourceOffset: z.number().int().nonnegative().max(20).default(0),
      }).strict(),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ section, offset, resourceOffset }) =>
        summarizeEnvelope(actions.getEnvelope(), section, offset, resourceOffset),
    }),
    defineWebMcpTool({
      name: "update_hackathon_draft",
      title: "Update event draft",
      description:
        "Update one or more visible draft fields. Use the latest expectedRevision. Omitted fields stay unchanged, null clears a field, and arrays replace a section.",
      schema: z.object({
        expectedRevision: z.number().int().nonnegative(),
        patch: hackathonDraftPatchSchema,
      }).strict(),
      execute: ({ expectedRevision, patch }) => {
        try {
          const envelope = actions.updateDraft(expectedRevision, patch)
          return {
            revision: envelope.revision,
            savedAt: envelope.savedAt,
            canCreate: envelope.state.name.trim().length > 0,
            changedFields: Object.keys(patch),
          }
        } catch (error) {
          if (error instanceof WebMcpRequestError) throw error
          throw new WebMcpRequestError({
            code: "invalid_patch",
            message: error instanceof Error ? error.message : "Check the draft update.",
            retryable: false,
          })
        }
      },
    }),
    defineWebMcpTool({
      name: "open_hackathon_review",
      title: "Review event draft",
      description:
        "Open the full visible review. A person must review every section and click Create Event.",
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true },
      execute: () => {
        actions.openReview()
        return {
          data: {
            opened: true,
            nextStep: "Review every section, then click Create Event.",
          },
          requiresHumanAction: true,
        }
      },
    }),
  ]

  if (actions.openSignIn) {
    tools.push(defineWebMcpTool({
      name: "open_sign_in",
      title: "Open sign in",
      description:
        "Open the visible sign-in choice after the draft is saved. A person must choose Sign In or Sign Up before they can create the event.",
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true },
      execute: () => {
        actions.openSignIn?.()
        return {
          data: {
            opened: true,
            nextStep: "Choose Sign In or Sign Up. Your event draft will stay saved.",
          },
          requiresHumanAction: true,
        }
      },
    }))
  }

  return tools
}
