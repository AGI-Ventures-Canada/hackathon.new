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
})

export type EventPageRichContent = z.infer<typeof EventPageRichContentSchema>
export type LumaRichContent = EventPageRichContent

export async function extractEventPageRichContent(
  inputUrl: string
): Promise<EventPageRichContent | null> {
  const tavilyApiKey = process.env.TAVILY_API_KEY
  if (!tavilyApiKey) {
    console.warn("TAVILY_API_KEY not set, skipping rich content extraction")
    return null
  }

  const url = normalizeUrl(inputUrl)

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
      prompt: `Extract sponsors, rules, prizes, and challenges from this hackathon/event page content.

Only extract information that is explicitly present in the content. Do not infer or fabricate data.
- For sponsors: Look for sections labeled "Sponsors", "Partners", "Supported by", or company logos listed as sponsors.
- For rules: Look for ANY content that describes what participants must follow — this includes sections labeled "Rules", "Guidelines", "Code of Conduct", "Requirements", but ALSO FAQ answers that contain team size limits, tool usage policies, eligibility criteria, format requirements (in-person vs virtual), what to bring, and participation guidelines. Combine all rule-like content into a single coherent text.
- For prizes: Look for sections labeled "Prizes", "Awards", or "Rewards" that describe monetary or material awards. Extract the award itself — not the track it belongs to.
- For challenges: Look for sections labeled "Challenges", "Tracks", "Themes", "Problem Statements", or category buckets that describe what participants should build or solve. Extract the track name, a description of the problem/goal, and any resource links mentioned alongside it (API docs, datasets, starter repos, sponsor APIs). When a page lists tracks with their own prizes, extract BOTH a challenge (for the track/theme) AND a prize (for the associated award) — use the track name in the prize description to link them.

If a section is not present in the content, return an empty array for sponsors/prizes/challenges and null for rules.

Page content:
${rawContent}`,
      maxOutputTokens: 2048,
    })

    return object
  } catch (err) {
    console.error("LLM structured extraction failed:", err)
    return null
  }
}

export async function extractLumaRichContent(
  slug: string
): Promise<LumaRichContent | null> {
  return extractEventPageRichContent(`https://luma.com/${slug}`)
}
