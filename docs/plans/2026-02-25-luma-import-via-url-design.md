# Design: Luma Import via URL

**Date:** 2026-02-25
**Status:** Draft
**Appetite:** 1-2 weeks (small batch)

## Problem

Organizers already have events on Luma. Recreating everything from scratch in Oatmeal is friction that kills conversion. Every extra field is a chance for the user to abandon onboarding.

## Solution

A zero-friction import that lets organizers bring their Luma event into Oatmeal in under 30 seconds by replacing `luma.com` (or `lu.ma`) with `oatmeal.com` in their browser URL bar.

## Decisions Made

| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| URL pattern | Seamless replacement (`oatmeal.com/luma.com/...` primary, `oatmeal.com/lu.ma/...` also supported) | Explicit `/import/` route prefix |
| Data extraction | Structured scraping (Open Graph + JSON-LD) | AI extraction, hybrid with AI fallback |
| Banner image | Download and re-upload to Supabase Storage | Store Luma CDN URL reference |
| Entry points | Both URL replacement AND dashboard paste input | URL replacement only |
| Auth flow | Guest mode with localStorage persistence | URL params, server-side session |
| Sync model | One-time import, no sync | Two-way sync, one-way pull |

## Architecture

### URL Routing

Two Next.js catch-all routes handle both Luma domains:

```
app/(public)/luma.com/[...path]/page.tsx   ← primary route
app/(public)/lu.ma/[...path]/page.tsx      ← legacy short URL, redirects to luma.com route
```

**Why two routes:** `lu.ma` is Luma's legacy short URL domain. It now 301-redirects to `luma.com`. Users may try either pattern:
- `oatmeal.com/luma.com/sfagents` (primary)
- `oatmeal.com/lu.ma/sfagents` (also works)

The `lu.ma` route simply redirects to the `luma.com` equivalent. The `luma.com` route is the real handler — it reconstructs the original Luma URL (`https://luma.com/sfagents`) and kicks off the import flow.

Both routes live under `(public)` — no authentication required.

### Data Flow

```
Entry Points
─────────────────────────────────────────────────
A) Browser URL: oatmeal.com/luma.com/sfagents (or oatmeal.com/lu.ma/sfagents)
B) Dashboard: "Paste a Luma link" input

           │
           ▼

API: POST /api/import/luma
─────────────────────────────────────────────────
Input:  { url: "luma.com/sfagents" }
Steps:  1. Fetch public Luma page HTML
        2. Parse Open Graph meta tags + JSON-LD
        3. Download banner image → Supabase Storage
Output: { title, description, startsAt, endsAt,
          locationType, locationName, bannerUrl }

           │
           ▼

Client: Prefilled Creation Form
─────────────────────────────────────────────────
- Displays extracted data in editable fields
- User can modify any field before creating
- "Create Hackathon" button

           │
           ▼

Auth Gate
─────────────────────────────────────────────────
If logged in:  → POST /api/dashboard/hackathons
If not:        → Save form to localStorage
               → Redirect to sign-up
               → On return, restore form
               → POST /api/dashboard/hackathons

           │
           ▼

Result: Normal Oatmeal hackathon
─────────────────────────────────────────────────
- Created via existing createHackathon() service
- Identical to a manually created hackathon
- No reference to Luma stored
- Zero ongoing dependency on Luma
```

### Components

| Component | Type | Purpose |
|-----------|------|---------|
| `app/(public)/luma.com/[...path]/page.tsx` | Server page | Primary import page for URL pattern entry |
| `app/(public)/lu.ma/[...path]/page.tsx` | Server page | Redirects to `luma.com` equivalent |
| `lib/services/luma-import.ts` | Service | Fetches Luma page, parses JSON-LD, downloads image |
| `lib/api/routes/import.ts` | API route | Orchestrates extraction, returns structured data |
| `components/hackathon/luma-import-form.tsx` | Client component | Prefilled editable form with create button |
| Dashboard paste input | Client component | Addition to existing dashboard UI for link pasting |

### Field Mapping

Verified against a real Luma event page (`luma.com/sfagents`). Luma embeds a `<script type="application/ld+json">` block with schema.org Event data. This is our primary extraction source.

**Primary source: JSON-LD (`@type: "Event"`)**

| JSON-LD Field | Example (from sfagents) | Oatmeal Field |
|--------------|-------------------------|---------------|
| `name` | `"Autonomous Agents Hackathon"` | `name` |
| `description` | `"Autonomous Agents Hackathon! We've brought together..."` | `description` |
| `startDate` | `"2026-02-27T09:30:00.000-08:00"` | `starts_at` |
| `endDate` | `"2026-02-27T19:30:00.000-08:00"` | `ends_at` |
| `image[0]` | `"https://images.lumacdn.com/cdn-cgi/image/..."` | `banner_url` (re-uploaded to Supabase Storage) |
| `location.name` | `"San Francisco, California"` | `location_name` |
| `eventAttendanceMode` | `"OfflineEventAttendanceMode"` | `location_type` (`in_person`) |
| `location.url` | (present for virtual events) | `location_url` |

**`eventAttendanceMode` mapping:**

| JSON-LD Value | Oatmeal `location_type` |
|--------------|------------------------|
| `OfflineEventAttendanceMode` | `in_person` |
| `OnlineEventAttendanceMode` | `virtual` |
| `MixedEventAttendanceMode` | `in_person` (default) |

**Available but not mapped in v1 (stored in `metadata` for future use):**

| JSON-LD Field | Example | Notes |
|--------------|---------|-------|
| `location.geo` | `{ lat: 37.79, lng: -122.4 }` | Could power map features later |
| `offers[].price` | `0` | Could show "Free event" badge |
| `organizer[]` | 5 organizations | Could pre-populate sponsors |
| `eventStatus` | `"EventScheduled"` | Could filter out cancelled events |

**Fields NOT imported (user configures later):**
- `registration_opens_at` / `registration_closes_at`
- `min_team_size` / `max_team_size` / `allow_solo`
- `max_participants`
- `rules`
- `anonymous_judging`

### Auth Flow (Guest Mode)

The import page is public. No login required to see the prefilled form. Auth is only required when the user commits to creating the hackathon.

**localStorage persistence across auth redirect:**

1. User fills/reviews form, clicks "Create Hackathon"
2. If not authenticated:
   a. Serialize form state to `localStorage` under key `oatmeal:luma-import`
   b. Redirect to `/sign-in?redirect_url=/luma.com/{path}`
   c. After sign-in, user returns to the import page
   d. Page checks `localStorage` for saved form state
   e. Restores form, user clicks "Create Hackathon" again
   f. Clear `localStorage` after successful creation
3. If authenticated:
   a. Submit directly to `POST /api/dashboard/hackathons`
   b. Redirect to `/e/{slug}/manage`

**localStorage schema:**

```json
{
  "title": "My Hackathon",
  "description": "A great event...",
  "startsAt": "2026-04-01T09:00:00Z",
  "endsAt": "2026-04-02T17:00:00Z",
  "locationType": "in_person",
  "locationName": "San Francisco, CA",
  "bannerUrl": "https://our-supabase-storage.com/...",
  "lumaUrl": "luma.com/my-hackathon",
  "savedAt": "2026-02-25T12:00:00Z"
}
```

Include `savedAt` timestamp so we can expire stale data (e.g., ignore if older than 24 hours).

### Banner Image Handling

1. Extract image URL from `og:image` meta tag
2. Fetch the image from Luma's CDN
3. Upload to Supabase Storage (same bucket used for other hackathon banners)
4. Return our Supabase Storage URL as `bannerUrl`
5. If image fetch fails, leave `bannerUrl` as null — user can upload their own later

**Considerations:**
- Validate file size before processing (consistent with existing sponsor logo validation)
- Support common formats: JPEG, PNG, WebP
- Use a temp/import path in storage until hackathon is created, then move to permanent path (or accept orphaned uploads as acceptable for v1)

## Fallback Options

If the primary approach (structured scraping) fails or proves insufficient, these alternatives were evaluated during design and can be adopted without major architectural changes.

### Fallback 1: AI-Powered Extraction

**When to consider:** If Luma removes or significantly changes their Open Graph / JSON-LD tags, breaking structured parsing.

**Approach:** Fetch the Luma page HTML and pass it to Claude Haiku via AI SDK to extract structured data.

```typescript
const result = await generateObject({
  model: anthropic("claude-haiku-4-5-20251001"),
  schema: z.object({
    title: z.string(),
    description: z.string().nullable(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    locationName: z.string().nullable(),
    locationType: z.enum(["in_person", "virtual"]).nullable(),
    imageUrl: z.string().nullable(),
  }),
  prompt: `Extract event details from this HTML: ${html}`,
})
```

**Trade-offs:**
- Adds ~2-3s latency per import
- ~$0.001-0.01 cost per import
- Resilient to HTML structure changes
- Requires AI SDK infrastructure (already in codebase)

### Fallback 2: Hybrid (Structured + AI Fallback)

**When to consider:** If structured scraping works most of the time but occasionally returns incomplete data.

**Approach:** Try structured parsing first. If key fields (title, description) are missing, fall back to AI extraction.

```typescript
const structuredData = parseMetaTags(html)
if (!structuredData.title || !structuredData.description) {
  return await aiExtract(html)
}
return structuredData
```

**Trade-offs:**
- Fast path (~200ms) most of the time
- AI fallback (~2-3s) only when needed
- More code to maintain (two extraction paths)
- Best reliability overall

### Fallback 3: Luma CDN URL for Banner (Skip Re-upload)

**When to consider:** If Supabase Storage upload adds too much complexity or latency to the import flow.

**Approach:** Store the `og:image` URL directly in `banner_url` instead of re-uploading.

**Trade-offs:**
- Simpler and faster
- Creates dependency on Luma's CDN (image breaks if they change/delete it)
- Inconsistent with "once created, it's your data" philosophy
- Easy to migrate later by backfilling image uploads

## Scope Boundaries

### In Scope (v1)

- URL replacement routes (`oatmeal.com/luma.com/...` and `oatmeal.com/lu.ma/...`)
- Dashboard "paste a Luma link" input
- Structured data extraction (Open Graph + JSON-LD)
- Banner image download and re-upload
- Guest mode (no auth required to see prefilled form)
- localStorage persistence across auth redirect
- Graceful degradation (empty fields if extraction fails)

### Out of Scope (v1)

- Two-way sync or any sync mechanism
- Luma API usage
- Requiring Luma API keys or authentication
- Requiring user signup before seeing prefilled form
- Other platforms (Eventbrite, Partiful, etc.)
- Importing attendee/participant lists
- Importing custom Luma fields beyond core set

### Future Considerations

- **Other platforms:** The `app/(public)/luma.com/` route pattern is platform-specific by design. Adding Eventbrite later would mean `app/(public)/eventbrite.com/[...path]/`. The extraction service (`luma-import.ts`) is Luma-specific, but the form component and auth flow are reusable.
- **User-initiated sync:** A future "re-import" button could re-fetch the Luma page and show a diff. This would use the same extraction service. No architectural changes needed.
- **API-based sync:** Would require the existing `org_api_credentials` Luma API key infrastructure. Completely separate from the import feature.

## Success Criteria

- User pastes a Luma link or visits URL → sees prefilled hackathon in <30 seconds
- All core fields extracted correctly from Luma public pages
- Banner image stored in our own storage
- Works without authentication (guest mode)
- Form state preserved across sign-up redirect
- Created hackathon is identical to a manually created one
- Graceful degradation when extraction fails (empty fields, not errors)
