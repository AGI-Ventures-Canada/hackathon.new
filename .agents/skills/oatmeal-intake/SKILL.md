---
name: oatmeal-intake
description: >-
  Scan the Oatmeal Product's Notion pitches and meeting notes for newly-mentioned issues (bugs, defects, feature
  requests, problems, action items), present the deduplicated candidates for approval, then create the ones you
  approve as GitHub issues in the oatmeal repo — running the fix pipeline (issue-context → issue-plan, pausing at
  the approval gate) only for the bugs, while enhancements are filed as backlog issues with no pipeline. Use when
  the user says "check Notion for new oatmeal issues", "intake new pitches/meetings", "scan the Oatmeal product
  page for issues", "pull issues from the product notes", or runs it on a schedule. Each invocation does ONE scan
  pass and is idempotent, so pair it with /loop for continuous intake. It proposes and files issues (and drafts
  plans for bugs) only — it never writes code, opens PRs, or merges.
compatibility: Requires `gh` (authenticated) and the Notion MCP tools (notion-fetch, notion-search,
  notion-query-meeting-notes). Expects the issue-context/issue-plan skills installed in this repo.
---

# Oatmeal Notion → Issue Intake

## What this skill is for

Product issues for Oatmeal surface first in Notion — in **pitches** attached to the Oatmeal Product page and in
**meeting notes** — long before they become GitHub issues. This skill is the front door of the fix pipeline: it
watches those Notion sources, surfaces genuinely actionable items, lets a human approve which become issues, and
then files them — sending **bugs** into the context → plan pipeline (so they arrive as a triaged issue with a
draft plan awaiting review) while **enhancements** are filed as backlog issues for later prioritization.

Two deliberate choices keep the volume sane:
- **Propose, don't auto-file.** Pitches and meetings are noisy; a human confirms the candidate list before
  anything is written to the tracker.
- **Pipeline only for bugs.** A bug is a concrete, scoped fix the plan pipeline handles well. A feature request
  is a product decision that deserves prioritization first — so enhancements become backlog issues, not auto-drafted
  plans.

It does **one scan pass per invocation** and is **idempotent** — running it again won't re-propose an item that
already became an issue. That's what makes it safe to run on a loop (`/loop 30m /oatmeal-intake`).

## Configuration

- **Oatmeal Product page:** `2fcffe5c4f748051ab56f0cc96ec2093`
  (https://www.notion.so/2fcffe5c4f748051ab56f0cc96ec2093). Its `Pitches` relation lists the pitch pages.
- **Repo:** `AGI-Ventures-Canada/oatmeal`.
- **Provenance label:** `intake` (create it once with `gh label create intake` if missing).
- **State file:** `.sdlc/intake/seen.json` — records which Notion source items have already produced an issue,
  plus the last scan time. This is the primary dedup mechanism; keep it updated.

## The disciplines that keep this safe

Because this can run unattended on a loop, three disciplines matter more than anything else here:

1. **Propose before creating.** Never write to the tracker without human sign-off. Present the deduplicated
   candidate list and create only what's approved. (See step 5.)
2. **Dedup hard — be idempotent.** Never propose or file a second issue for a source item that already produced
   one. Before proposing, check both the state file *and* existing GitHub issues (open **and** closed) for the
   source's provenance marker. A loop that re-surfaces the same meeting action item every 30 minutes is worse
   than useless.
3. **Detect conservatively.** Pitches and meeting notes are full of discussion, musings, decisions, and
   already-done work. Only surface things that are clearly **actionable and unresolved**: a described bug, a
   missing capability someone asked for, an explicit "we need to / this is broken / TODO". When in doubt, leave it
   off the list and note it. A false candidate wastes the reviewer's attention.

## Workflow — one scan pass

### 1. Load state

Read `.sdlc/intake/seen.json` (create it if absent: `{ "last_scan": null, "items": {} }`). The `items` map is
keyed by a stable source key (the Notion page/block ID of the item) → `{ issue, title, created_at }`.

### 2. Gather Notion sources

- **Pitches:** `notion-fetch` the Oatmeal Product page and read its `Pitches` relation — the list of pitch page
  URLs. Prioritize pitches created/edited since `last_scan` (fetch a pitch to see its content + last-edited time).
- **Meeting notes:** use `notion-query-meeting-notes` (and/or `notion-search`) to find Oatmeal-related meeting
  notes, again focusing on ones newer than `last_scan`.

Focusing on items changed since the last scan keeps each pass cheap; on the first run (`last_scan == null`), do a
bounded backfill of the most recent pitches/meetings rather than the entire history.

### 3. Extract candidate issues

Read each new/updated source and pull out **actionable, unresolved** items. For each candidate capture:
- a clear **title** (imperative, specific),
- a short **description** in your own words,
- the **source** (Notion page URL + the relevant section/block),
- **type** (`bug` vs `enhancement`) and any stated **severity**.

Skip: resolved/shipped items, pure discussion or decisions with no ask, duplicates of each other (merge into one),
and anything too vague to act on.

### 4. Dedup against state + existing issues

For each candidate, before proposing it:
- If its source key is in `seen.json.items` → **drop** (already filed).
- Search existing issues for the provenance marker and for a near-duplicate title:
  `gh issue list --repo AGI-Ventures-Canada/oatmeal --state all --search "<notion-page-id>"` and a title search.
  If a match exists → **drop**, and backfill `seen.json` so future passes are fast.

### 5. Propose the candidates for approval

Do **not** create anything yet. Present the surviving (genuinely new, deduplicated) candidates as a table for the
user to approve, so a human gates what reaches the tracker:

| # | Proposed title | Type | Source | Why it's actionable |
|---|----------------|------|--------|---------------------|
| 1 | … | bug / enhancement | <notion link + section> | <one line> |

Also list, separately and briefly: items **dropped as dupes** (with the existing issue #) and items **flagged but
not proposed** (too vague / possibly resolved), so the reviewer sees the full picture. Then wait for the user to
say which candidates to create (e.g. "all", "1,3,5", "just the bugs", "none").

### 6. Create the approved issues

For each **approved** candidate, create the issue with a provenance marker so it's traceable and dedup-able. Use
the type as a label, plus `intake`:

```
gh issue create --repo AGI-Ventures-Canada/oatmeal --title "<title>" --label "<bug|enhancement>" --label intake \
  --body "<body>"
```

Body template (the acceptance criteria differ by type):
```markdown
> Intake source: <notion-url>  ·  filed by oatmeal-intake on <date>

## What was raised
<description in your words>

## Source context
<short quote or paraphrase from the pitch/meeting, with the section it came from>

## Acceptance criteria
# bug:
- [ ] Root cause confirmed and reproduced
- [ ] Fix implemented and covered by a regression test
# enhancement (backlog):
- [ ] Scoped and prioritized before implementation
- [ ] Behavior/outcome agreed against the source intent
```

Record each created issue in `seen.json.items` immediately (source key → issue number) so a crash mid-pass can't
cause a re-file next run.

### 7. Run the pipeline — for approved BUGS only

For each newly created issue **labeled `bug`**, start the fix pipeline by invoking the `issue-context` skill
(Skill tool) with the issue number. It gathers context and auto-chains into `issue-plan`, which **pauses at the
human approval gate** — so a bug arrives as a triaged issue plus a draft plan awaiting review, and **no code**.
Process bugs one at a time.

**Enhancements get no pipeline.** They're filed as backlog issues and left for product prioritization — a feature
request isn't a scoped fix and shouldn't auto-generate a plan. Do not invoke `issue-context`/`issue-plan` for
them, and never invoke `issue-implement` or open PRs from here.

If `issue-context` isn't installed, still create approved issues and report the bugs as ready for the pipeline.

### 8. Update state and report

Write `last_scan` to now and save `seen.json`. Then report:
- **Created — bugs (pipeline started):** issue # + URL, and that a draft plan is pending your approval.
- **Created — enhancements (backlog):** issue # + URL, no pipeline.
- **Not created:** candidates the user declined.
- **Dropped (dupes):** count + the existing issue #s.
- **Flagged, not proposed:** ambiguous/borderline items, so a human can decide.

## Guardrails recap

- **Propose, then create.** Never write to the tracker without human approval of the candidate list.
- **Pipeline for bugs only.** Approved bugs run context → plan (pausing at the gate); enhancements are filed as
  backlog issues with no pipeline.
- **Idempotent.** One issue per source item, ever. Check state + open/closed issues before proposing; update
  state immediately after creating.
- **Conservative.** Only surface clearly actionable, unresolved items. Leave-and-note beats false candidates.
- **One pass per run.** No internal polling; compose with `/loop` for cadence.
- **Issues + plans only.** Never write code, open PRs, or merge — the plan-approval gate downstream is the human
  checkpoint and must not be bypassed.
- **Read-only in Notion.** This skill reads pitches/meetings; it does not modify Notion content.
