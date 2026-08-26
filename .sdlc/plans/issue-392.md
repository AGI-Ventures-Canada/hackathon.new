# Plan: Issue #392 — Judge-facing search/filter for assignments

- **Context source:** `.sdlc/context/issue-392.md` (gathered on 5d545a60)
- **Planned:** 2026-05-28 on commit 5d545a60
- **Context drift:** none

## Problem (from context)
In the judge assignment list (`JudgeAssignmentsCard` "list" mode), judges can only paginate through projects with
no way to search. The incident report flagged judges "scrolling through all 26 projects manually with no way to
find assigned ones." Fix: add a text search that filters the list by project title and team name.

## Resolved questions
| Open question | Resolution | Basis |
|---------------|------------|-------|
| Match fields — title only or title + team? | **Title + team name**, case-insensitive substring. | Mirrors `manual-winner-list.tsx:56-65`, the established pattern in this codebase. |
| Show search in both modes or list-only? | **List mode only.** | Focus mode is single-item sequential nav; a filter there is meaningless and would complicate `currentIndex` logic. Keeps blast radius to list mode. |
| Empty-state copy when no matches? | Show `No projects match "<query>".` in muted text where the list would be. | Consistent with the existing muted-text style; gives the judge clear feedback. |
| Reset pagination on query change? | **Yes**, reset `page` to 0 whenever the query changes. | Otherwise a judge on page 2 could filter to a 1-page result and see an empty page. |

## Approach
Purely presentational, client-side filtering inside `JudgeAssignmentsCard` — no API/service/DB changes, since
`assignments` is already fully present on the client. Add a `query` state and a `useMemo`-derived `filtered`
list; paginate `filtered` instead of `assignments`; render a search `Input` above the list and an empty state
when `filtered` is empty.

Rejected alternative: pushing search to the server / a new query param — unnecessary (data is already client-side),
larger blast radius, and slower UX. Rejected: adding search to `FocusScoringView` too — out of scope for this
issue and complicates sequential navigation.

## Implementation steps
1. **Add search state + filtered list** — `components/hackathon/judging/judge-assignments-card.tsx`
   Add `const [query, setQuery] = useState("")`. Add a `useMemo` `filtered` that lowercases the trimmed query and
   filters `assignments` by `submissionTitle` / `teamName` (empty query → all). Derive `totalPages` and
   `pageAssignments` from `filtered` instead of `assignments`. Reset `page` to 0 when `query` changes (guarded
   `useEffect` or clamp in the page setter). *Done = list narrows as you type; pagination reflects filtered count.*
2. **Render the search input (list mode only)** — same file, at the top of the `viewMode === "list"` branch
   (around line 139). Use the existing `Input` UI component with a search icon, bound to `query`/`setQuery`,
   placeholder "Search projects or teams…". *Done = input shows only in list mode, not focus mode.*
3. **Empty state** — when `filtered.length === 0`, render muted text `No projects match "{query}"` in place of
   the rows. *Done = clearing results shows the message, not a blank card.*
4. **Tests** — `__tests__/components/hackathon/judging/judge-assignments-card.test.tsx`
   Add cases: (a) typing in search narrows the list to matching title; (b) matching by team name works;
   (c) no-match shows the empty-state copy; (d) search input is absent in focus mode. Follow existing
   `fireEvent` + `screen` patterns.

## Test strategy
- **Must keep passing:** existing `judge-assignments-card.test.tsx` cases (render, toggle, list, badges).
- **New tests to add:** the four cases in step 4 (described, not yet written).
- **Reproduce & verify:** `bun run test`, then `bun run lint`, then `bun run build`. Manually: List mode with
  several assignments, type a partial title/team → list narrows; clear → full list returns.

## Risks & rollout
- **Blast radius:** confined to list mode of one component; focus mode untouched; no data layer changes.
- **Migration / compat:** none.
- **Sequencing / flags:** ship directly; additive UI, safe to merge once green.

> Plan only. No code written. Implementation is a separate, explicitly-approved stage.
