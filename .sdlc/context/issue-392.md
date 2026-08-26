# Context: Issue #392 — No judge-facing search/filter for projects

- **Link:** https://github.com/AGI-Ventures-Canada/oatmeal/issues/392
- **State / labels:** open, enhancement
- **Reporter / assignees:** alex-agiventures, —
- **Gathered:** 2026-05-28 on commit 5d545a60

## Triage verdict
- **Verdict:** needs-fixing
- **Confidence:** high
- **Evidence:** Re-checked at HEAD `1a9f2191`. The gap still exists:
  `components/hackathon/judging/judge-assignments-card.tsx` list mode slices `assignments` directly into
  `pageAssignments` with no search/filter state (the only `filter` is `assignments.filter(a => a.isComplete)`,
  i.e. completion tracking). No commit has touched the file since this artifact was gathered, and no commit /
  merged PR references #392 or a judge-facing search. Issue is OPEN, label `enhancement`.
- **Recommendation:** proceed to planning (actionable).

## Problem statement
Per the Build OS26 incident report (item #9): judges had no ability to search or filter the projects they were
assigned, and were "forced to scroll through all 26 projects manually with no way to find assigned ones."
Expected: a judge can quickly narrow their assignment list to find a specific project. Actual: the list is a
flat, paginated scroll with no text search.

## Relevant code locations
| Location | Role / why relevant |
|----------|---------------------|
| `components/hackathon/judging/judge-assignments-card.tsx:45` | The judge's assignment list component. Has a `"focus"` and a `"list"` view mode. |
| `components/hackathon/judging/judge-assignments-card.tsx:56-61` | List mode paginates `assignments` at `PAGE_SIZE = 20` with **no filtering** — the gap. |
| `components/hackathon/judging/judge-assignments-card.tsx:140-225` | List render: maps `pageAssignments` over `submissionTitle` / `teamName`. Where a filtered list + empty state belong. |
| `components/hackathon/judging/manual-winner-list.tsx:56-65` | **Existing search-filter pattern to mirror**: `search` state + `useMemo` filtering by `projectTitle`/`teamName`. |
| `__tests__/components/hackathon/judging/judge-assignments-card.test.tsx` | Existing test for this component — extend it. |

## Key code excerpts
`judge-assignments-card.tsx` list-mode pagination (no filter):
```tsx
const [page, setPage] = useState(0)
const total = assignments.length
const totalPages = Math.ceil(total / PAGE_SIZE)
const pageAssignments = assignments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
```
Each row renders `a.submissionTitle` and `a.teamName` (lines 158-161) — the natural fields to match on.

Reusable filter pattern from `manual-winner-list.tsx`:
```tsx
const filtered = useMemo(() => {
  if (!data) return []
  const q = search.trim().toLowerCase()
  if (!q) return data.projects
  return data.projects.filter((p) =>
    p.projectTitle.toLowerCase().includes(q) ||
    (p.teamName?.toLowerCase().includes(q) ?? false))
}, [data, search])
```

## Surrounding context (blast radius)
- **Callers:** `JudgeAssignmentsCard` is rendered by the judge dashboard/showcase paths; `FocusScoringView`
  (focus mode) is a sibling within the same card. A search box should be scoped to **list mode only** so it
  doesn't disturb focus-mode navigation.
- **Dependencies:** local component state only (`useState`/`useMemo`). No API, service, or DB changes needed —
  `assignments` is already fully in the client.
- **Sibling code:** `focus-scoring-view.tsx` (single-item nav, out of scope), `manual-winner-list.tsx` (the
  filter pattern), `scoring-panel.tsx` (mocked in tests).
- **Data flow:** `assignments: JudgeAssignment[]` arrives as a prop; filtering is purely presentational.

## Tests
- **Existing coverage:** `__tests__/components/hackathon/judging/judge-assignments-card.test.tsx` — renders, view
  toggle, list mode, status badges. Uses `bun:test` + `@testing-library/react`, mocks `ScoringPanel`, helpers
  `resetComponentMocks` / `setPathname`.
- **Coverage gaps:** no test for search/filter (doesn't exist yet) or filtered empty state.
- **How to run:** `bun run test` (unit runner: `bun scripts/run-unit-tests.ts`). Lint: `bun run lint`. Build:
  `bun run build`.

## Git history
- `a08e04c9` feat(submissions): add video links — last touched this card.
- `1a8ac105` feat(judging): add weighted-score judging style with unified scorecard — added list/unified modes.
- `c2f5ab89` fix(judging): add missing scoring endpoints and prefetch next assignment (#237).
- No prior search/filter work on this component.

## Environment & reproduction
- **Stack:** Next.js (App Router) + Supabase + bun. **Commands:** `bun run test` / `bun run lint` /
  `bun run build`.
- **Reproduction:** open the judge view with >20 assignments, switch to List mode — only pagination, no way to
  search by project or team name.

## Open questions for planning
- Match fields: title only, or title + team name? (manual-winner-list matches both.)
- Should the search box show in both view modes or list-mode only?
- When a search yields no matches, what should the empty state say?
- Should pagination reset to page 0 when the query changes?

## Context completeness
- [x] Issue + all comments read
- [x] All issue-referenced files/symbols located (note any drift)
- [x] Callers/callees mapped
- [x] Tests + run commands identified
- [x] Git history reviewed
- [x] Reproduction facts captured

> No plan included. This artifact is input to a separate planning step.
