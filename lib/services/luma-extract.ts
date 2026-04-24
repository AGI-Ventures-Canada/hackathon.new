import { tavily } from "@tavily/core"
import { generateObject } from "ai"
import { anthropic } from "@/lib/ai/anthropic"
import { z } from "zod"
import { normalizeUrl } from "@/lib/utils/url"

const EventPageRichContentSchema = z.object({
  sponsors: z
    .array(
      z.object({
        name: z.string().describe("Company or organization name of the sponsor"),
        tier: z
          .enum(["title", "gold", "silver", "bronze", "none"])
          .nullable()
          .describe(
            "Sponsorship tier if mentioned (e.g. 'gold sponsor' -> gold, 'presenting sponsor' -> title). null if not specified."
          ),
      })
    )
    .describe("List of sponsors or partners mentioned on the event page"),

  rules: z
    .string()
    .nullable()
    .describe(
      "Event rules, guidelines, code of conduct, participation requirements, eligibility criteria, team formation rules, or key policies. Include relevant content from FAQ sections that describe what participants must follow (e.g. team size limits, tool usage policies, format requirements). Return as plain text with newlines preserved. null if no relevant rules or guidelines are found anywhere on the page."
    ),

  prizes: z
    .array(
      z.object({
        name: z.string().describe("Prize name or category (e.g. 'Grand Prize', 'Best Design')"),
        description: z
          .string()
          .nullable()
          .describe("Description of what the prize includes or criteria. null if not specified."),
        value: z
          .string()
          .nullable()
          .describe(
            "Monetary value or prize description (e.g. '$5,000', 'MacBook Pro'). null if not specified."
          ),
      })
    )
    .describe("List of prizes or awards mentioned on the event page"),

  challenges: z
    .array(
      z.object({
        title: z.string().describe("Challenge, track, or theme name (e.g. 'AI for Healthcare', 'Climate Track')"),
        description: z
          .string()
          .nullable()
          .describe(
            "What participants should build or solve for this challenge/track. null if not specified."
          ),
        resources: z
          .array(
            z.object({
              label: z.string().describe("Human-readable label for the resource link"),
              url: z.string().describe("URL of the resource"),
            })
          )
          .describe(
            "Links to APIs, docs, datasets, starter kits, or other materials referenced with this challenge. Empty array if none."
          ),
      })
    )
    .describe("List of challenges, tracks, or themes that describe what participants should build"),

  translationLinks: z
    .array(
      z.object({
        url: z
          .string()
          .describe(
            "Absolute URL (must start with https://luma.com/ or https://lu.ma/) pointing to a different-language version of THIS same event"
          ),
        languageCode: z
          .string()
          .describe(
            "ISO 639-1 code (two lowercase letters like 'fr', 'es', 'ja') for the LINKED page's language, inferred from surrounding context"
          ),
      })
    )
    .describe(
      "Other-language versions of the same event cross-linked from this page. Look for phrases like 'For the French version, click here' or 'Version française', with an accompanying URL. Empty array if none."
    ),

  agendaItems: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            "Agenda item title (e.g. 'Opening Keynote', 'Lunch Break', 'Workshop: Intro to AI Agents')"
          ),
        description: z
          .string()
          .nullable()
          .describe("What happens in this session. null if not specified."),
        startsAt: z
          .string()
          .nullable()
          .describe(
            "ISO 8601 start timestamp in the form YYYY-MM-DDTHH:MM:SS with a timezone offset (±HH:MM or Z) when the page shows one. If the page only shows a time like '9:30 AM', still emit the full ISO form using the event's known start date (provided in the prompt) and its timezone offset as anchors. Do NOT invent a placeholder date; if no event start date is provided and the page has no date, return null. Return null if no time at all is given."
          ),
        endsAt: z
          .string()
          .nullable()
          .describe(
            "ISO 8601 end timestamp in the same format as startsAt. null if not specified."
          ),
        location: z
          .string()
          .nullable()
          .describe(
            "Room, stage, venue, or Zoom/URL label for this item. null if not specified."
          ),
        speakers: z
          .array(z.string())
          .describe(
            "Speaker names for this item (e.g. ['Jane Smith', 'John Doe']). Empty array if no speakers are listed."
          ),
      })
    )
    .describe(
      "Event schedule, agenda, timeline, or program items. Look for sections labeled 'Schedule', 'Agenda', 'Timeline', 'Program', 'Itinerary', or day-by-day breakdowns of the event. Each item should be a distinct session, talk, break, or activity with a time. Empty array if the page has no schedule."
    ),

  cleanedDescription: z
    .string()
    .nullable()
    .describe(
      "The main event description with any 'click here for the X version' pointer sentences removed, so it reads cleanly for this one language. null if the original description contained no such pointers or couldn't be cleaned."
    ),
})

export type EventPageRichContent = z.infer<typeof EventPageRichContentSchema>
export type LumaRichContent = EventPageRichContent

export type ExtractRichContentOptions = {
  eventStartsAt?: string | null
}

export async function extractEventPageRichContent(
  inputUrl: string,
  options: ExtractRichContentOptions = {}
): Promise<EventPageRichContent | null> {
  const tavilyApiKey = process.env.TAVILY_API_KEY
  if (!tavilyApiKey) {
    console.warn("TAVILY_API_KEY not set, skipping rich content extraction")
    return null
  }

  const url = normalizeUrl(inputUrl)
  const eventStartsAt = options.eventStartsAt?.trim() || null
  const anchorLine = eventStartsAt
    ? `\nThe event's known start timestamp is ${eventStartsAt}. Use this as the anchor for any agenda times that appear on the page without a date — emit the agenda item with this date (and the same timezone offset). For multi-day events, increment the date relative to this anchor based on "Day 2", "Day 3", or explicit dates on the page.\n`
    : ""

  let rawContent: string
  try {
    const client = tavily({ apiKey: tavilyApiKey })
    const response = await client.extract([url], {
      extractDepth: "advanced",
      format: "markdown",
    })

    if (!response.results.length || !response.results[0].rawContent) {
      console.warn(`Tavily returned no content for ${url}`)
      return null
    }

    rawContent = response.results[0].rawContent
  } catch (err) {
    console.error("Tavily extraction failed:", err)
    return null
  }

  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: EventPageRichContentSchema,
      prompt: `Extract sponsors, rules, prizes, challenges, and agenda items from this hackathon/event page content.

Only extract information that is explicitly present in the content. Do not infer or fabricate data.
- For sponsors: Look for sections labeled "Sponsors", "Partners", "Supported by", or company logos listed as sponsors.
- For rules: Look for ANY content that describes what participants must follow — this includes sections labeled "Rules", "Guidelines", "Code of Conduct", "Requirements", but ALSO FAQ answers that contain team size limits, tool usage policies, eligibility criteria, format requirements (in-person vs virtual), what to bring, and participation guidelines. Combine all rule-like content into a single coherent text.
- For prizes: Look for sections labeled "Prizes", "Awards", or "Rewards" that describe monetary or material awards. Extract the award itself — not the track it belongs to.
- For challenges: Look for sections labeled "Challenges", "Tracks", "Themes", "Problem Statements", or category buckets that describe what participants should build or solve. Extract the track name, a description of the problem/goal, and any resource links mentioned alongside it (API docs, datasets, starter repos, sponsor APIs). When a page lists tracks with their own prizes, extract BOTH a challenge (for the track/theme) AND a prize (for the associated award) — use the track name in the prize description to link them.
- For agendaItems: Look for sections labeled "Schedule", "Agenda", "Timeline", "Program", "Itinerary", "Run of Show", or day-by-day breakdowns. Emit one entry per distinct session, talk, break, panel, workshop, or activity. Times MUST be ISO 8601. If the page shows only "9:30 AM" without a date, anchor to the event's start date; if it shows only a date, leave the time null. Preserve the page's timezone offset when available. Do NOT emit agenda items without any time information. Do NOT include generic phrases like "hacking" or "networking" unless they have a specific time slot.
- For translationLinks: Look for explicit mentions of a different-language version of THIS SAME event, typically phrased as "For the French version, click here", "Version française", "English version", "Cliquez ici pour la version anglaise", or similar. Each entry must have (1) an absolute luma.com/lu.ma URL and (2) the ISO 639-1 code of the language THAT LINKED PAGE is written in. Do NOT include links to unrelated events, sponsor pages, general website links, or the current page itself.
- For cleanedDescription: If translationLinks is non-empty, return the event's main description with ALL pointer sentences like "(For the French version, click here)" or "Version française ici: ..." removed. CRITICAL: preserve the ORIGINAL LANGUAGE of the page exactly — do NOT translate into another language. If the page is in French, return French text; if it is in Japanese, return Japanese. Only remove the pointer sentence(s); keep every other character verbatim. If translationLinks is empty, return null.

If a section is not present in the content, return an empty array for sponsors/prizes/challenges/agendaItems/translationLinks and null for rules/cleanedDescription.
${anchorLine}
Page content:
${rawContent}`,
      maxOutputTokens: 4096,
    })

    return object
  } catch (err) {
    console.error("LLM structured extraction failed:", err)
    return null
  }
}

export async function extractLumaRichContent(
  slug: string,
  options: ExtractRichContentOptions = {}
): Promise<LumaRichContent | null> {
  return extractEventPageRichContent(`https://luma.com/${slug}`, options)
}
