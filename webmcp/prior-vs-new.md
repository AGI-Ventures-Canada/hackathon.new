# WebMCP prior-versus-new record

## Baseline

The fixed pre-challenge baseline is commit `7d2bea2f3b639d80bf1a6614729b307d68636801` on `staging`:

- Authored on August 25, 2026 at 12:29:41 PDT.
- Subject: `fix(judging): guard scoring setup (#466)`.
- A case-insensitive repository search at that commit finds no `WebMCP` or `document.modelContext` implementation.

PR #468 keeps this baseline visible and targets `staging`. Its first WebMCP commit is `aa1539ae332a0ad4d3cbc4ac1c7beed1c07de113`, authored later on August 25, 2026 at 17:25:05 PDT.

## Work added after the baseline

- Shared `document.modelContext` declarations, Zod-to-JSON-Schema contracts, structured result envelopes, abort handling, annotations, opaque references, and output budgets.
- Versioned local event drafts, safe legacy migration, atomic revision-checked patches, full visual review, sign-in continuation, rich aggregate creation, and compensation on child failure.
- Dynamic visitor, attendee, organizer, judge, and mentor tools tied to route, role, lifecycle, judging style, and visible capability.
- Server-side event version, role, status, ownership, audience, release, results, anonymous-judging, and mentor privacy checks.
- Optional exact-origin trial metadata for Vercel Preview and Production.
- Deterministic tests, model-selection eval cases, public docs, security notes, and a hosted preview matrix.
- Next.js 16.2.11 security update, `SECURITY.md`, public-safe setup examples, and repository publication audit work.

No database migration or parallel WebMCP backend was added. The implementation reuses Oatmeal's existing pages, services, API routes, audit log, lifecycle flushes, and human controls.

## Reproduce the boundary check

```bash
git grep -n -i 'modelContext\|webmcp' 7d2bea2f3b639d80bf1a6614729b307d68636801 -- ':!bun.lock' ':!package.json'
git diff --stat 7d2bea2f3b639d80bf1a6614729b307d68636801...feature/webmcp-organizer-tools
```
