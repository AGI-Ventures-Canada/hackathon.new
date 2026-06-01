---
name: issue-context
description: >-
  Use this when the user references an existing GitHub issue (a number, "#42", "issue 333", "ticket 99", "bug
  report #512", or a GitHub URL) and asks you to look into, investigate, research, dig into, explore, scope out,
  triage, or gather context on it. Even when the request looks simple enough to just handle directly, prefer this
  skill: it runs a specific multi-step investigation (issue + comments, referenced code, callers/callees, tests,
  git history) and writes a structured context artifact for a later planning step — and it deliberately stops
  short of proposing a fix, which ad-hoc handling tends to jump straight to. Go-to for "look into #42", "research
  ticket 99", "scope out issue 4501", "pull together what we'd need to start on this issue", "gather context
  before we fix it", or "what files, tests, and git history are involved". Modular — drop into any git repo. Skip
  it only when the user wants you to actually plan, design, or write the fix; edit code; or comment on, close,
  label, or create an issue — and when there is no referenced issue (a bare stack trace or a failing build).
compatibility: Requires `gh` (GitHub CLI, authenticated) and `git`. `jq` recommended.
---

# Issue Context Gathering

## What this skill is for

This is the **research stage** of a fix pipeline. Given a GitHub issue, it pulls the issue and assembles every
piece of context a planner would need to design a fix — then **stops**. The output is a single markdown artifact
that a separate planning step (run later, by a human or another agent) consumes.

The value here is separation of concerns. Context gathering is breadth-first, exploratory, and cheap to get
wrong; planning is a focused decision that benefits from having all context already laid out. Mixing them leads
to premature solutions anchored on the first file you happened to read. By keeping this stage strictly about
*what exists* and *what's relevant*, the eventual plan rests on a complete picture instead of a partial one.

## The one hard rule: gather, don't solve

**Do not produce a plan, a proposed fix, a design, a code change, or a recommended approach.** Not even a small
one, not even "the obvious fix is…". The moment you find yourself writing "we should…" or "the fix is to…",
stop — that belongs to the next stage.

You *may* and *should* record:
- Factual observations ("`parseConfig` is called from 3 places: …")
- Open questions and ambiguities ("the issue doesn't say which environment")
- Constraints you discovered ("this function is also used by the public API")

You may **not** record:
- Which option to choose, what to change, or how to implement anything.

Why this matters: the person/agent who picks this up next wants raw, unbiased context. If you pre-decide the
approach, you bias them and you may have anchored on incomplete information. Discipline here is the whole point
of the skill.

## Configuration

The context artifact is written to a configurable location. Default:

```
.sdlc/context/issue-<NUMBER>.md
```

If the repo already has a conventional docs or scratch directory, prefer it and tell the user where you wrote
the file. Create parent directories as needed. This directory is safe to gitignore; mention that to the user if
it isn't already ignored.

## Invocation

This skill can be triggered by natural language, but the deterministic entry point is the slash command — typing
it forces invocation with no triggering ambiguity:

- `/issue-context 42` — by issue number
- `/issue-context #42` or `/issue-context https://github.com/owner/name/issues/42` — `#N` or full URL
- `/issue-context 42 --repo owner/name` — explicit repo for multi-remote checkouts

Everything after the skill name is the issue reference; pass it straight through to `scripts/fetch_issue.sh`. If
invoked with **no** reference, don't guess — ask which issue, or run `gh issue list` and let the user pick.

## Workflow

Work through these in order. Use `TaskCreate` to track them if the issue is non-trivial.

### 1. Resolve and fetch the issue

Accept an issue number, a `#N` reference, or a full GitHub URL. Fetch the full issue with body, comments, and
metadata using the bundled helper (it wraps `gh issue view --json`):

```bash
scripts/fetch_issue.sh <issue-number-or-url>
# multi-remote / explicit repo:
scripts/fetch_issue.sh <issue-number-or-url> --repo owner/name
```

If `gh` is not authenticated, surface the exact error and stop — don't guess at issue contents. Read every
comment, not just the description: clarifications, repro steps, and "actually it's also…" details usually live
in the comment thread.

### 2. Extract signals from the issue text

Mine the issue + comments for concrete anchors into the codebase. Pull out:
- **File paths and function/class/symbol names** mentioned explicitly.
- **Error messages, stack traces, log lines** — these are gold; the exact string usually greps straight to the
  source line.
- **API endpoints, CLI commands, config keys, env vars, UI labels** referenced.
- **Version/commit/PR references** and **linked issues** (`#123`, "fixed in", "regressed since").
- **Reproduction steps** and the stated **expected vs. actual** behavior.

List these anchors before you start searching — they drive the next step.

### 3. Map signals to code

For each anchor, locate it in the repo and read enough to understand its role:
- Grep error-message strings and symbol names (`grep -rn`, ripgrep if available) to find definitions and
  references.
- Read the primary file(s) involved. Note `file:line` for everything relevant.
- Verify mentioned paths still exist (issues go stale; files get renamed/moved). Record drift if found.

### 4. Expand outward

A fix rarely lives in one file. Map the neighborhood so the planner sees blast radius:
- **Callers and callees** of the key functions — who depends on this, what it depends on.
- **Shared utilities, types, interfaces, and config** the area relies on.
- **Sibling code** handling similar cases (often the model for, or the inconsistency behind, the bug).
- **Data flow**: where the relevant data originates and where it ends up.

Record each location with a one-line note on *why* it's relevant. Don't editorialize about fixes.

### 5. Find the tests

Locate existing tests that exercise the affected area — unit, integration, e2e. Note:
- Which tests cover the code (and which paths are *uncovered*).
- The command(s) to run the relevant tests.
- Any fixtures or test data tied to the behavior.

This tells the planner what safety net exists and where reproduction in a test is feasible. Do **not** write
tests here.

### 6. Git archaeology

History explains intent. For the touched files/areas:
- `git log --oneline -n 20 -- <path>` for recent change history.
- `git blame` (or `git log -L`) on the specific suspect lines to find when/why they were introduced.
- Identify linked PRs and the commit a regression may have started from, if the issue claims a regression.

Capture commit hashes and one-line summaries — not a theory of the bug.

### 7. Reproduction & environment facts

Record how the project is built, run, and tested so the planner/fixer can reproduce, **without doing it
yourself unless it's a cheap read-only check**:
- Build/run/test commands (from README, package manifests, CI config, Makefile).
- Relevant runtime/version requirements and env vars.
- Any reproduction recipe stated in the issue, normalized into clear steps.

### 8. Write the artifact

Write the gathered context to the configured path using the template below. Then report to the user: the file
path, a 2–3 sentence factual summary of what the issue is about, and any **open questions** that planning will
need to resolve. Explicitly note that **no plan was created** — this is ready for the planning stage.

### 9. Hand off to planning

This is the first stage of an issue → context → plan → fix pipeline. Once the artifact is written, hand off to
the planning stage: invoke the `issue-plan` skill (Skill tool) with the issue number, so it can turn this
context into a plan. The handoff is just the trigger — `issue-plan` self-confirms and pauses for review before
anything is implemented, so it's safe to chain automatically.

Two caveats that keep this honest:
- If the user explicitly asked for *context only* (e.g. "just gather context", "don't plan yet"), respect that
  and stop here — mention `issue-plan` is the next step but don't invoke it.
- If the `issue-plan` skill isn't installed in this repo, simply tell the user the artifact is ready and that the
  planning stage would consume it. Never plan the fix yourself in this skill — that boundary still holds.

## Artifact template

Use this exact structure so downstream steps can rely on it:

```markdown
# Context: Issue #<NUMBER> — <title>

- **Link:** <url>
- **State / labels:** <state>, <labels>
- **Reporter / assignees:** <author>, <assignees>
- **Gathered:** <date> on commit <short-sha>

## Problem statement
<Restate the issue factually: what's reported, expected vs. actual behavior, and reproduction steps from the
issue + comments. Quote key lines. No interpretation about the fix.>

## Relevant code locations
| Location | Role / why relevant |
|----------|---------------------|
| `path/to/file.ext:LINE` | <one-line factual note> |

## Key code excerpts
<Short, focused snippets of the most central code, with file:line headers. Enough for a planner to understand
the mechanism without re-reading the repo.>

## Surrounding context (blast radius)
- **Callers:** <who calls the key code>
- **Callees / dependencies:** <what it relies on>
- **Related / sibling code:** <similar handlers, shared utils, types, config>
- **Data flow:** <where relevant data comes from and goes>

## Tests
- **Existing coverage:** <tests touching this area, file:line>
- **Coverage gaps:** <relevant untested paths>
- **How to run:** <command(s)>

## Git history
- `<sha>` <summary> — <why noted (e.g. last touched this fn)>
- **Suspected origin (if regression):** `<sha>` <summary>
- **Linked PRs/issues:** <refs>

## Environment & reproduction
- **Build/run/test commands:** <…>
- **Requirements / env vars:** <…>
- **Reproduction steps:** <normalized from issue>

## Open questions for planning
- <Ambiguities, missing info, or decisions the planner must make. These are questions, NOT answers.>

## Context completeness
- [ ] Issue + all comments read
- [ ] All issue-referenced files/symbols located (note any drift)
- [ ] Callers/callees mapped
- [ ] Tests + run commands identified
- [ ] Git history reviewed
- [ ] Reproduction facts captured

> No plan included. This artifact is input to a separate planning step.
```

## Guardrails recap

- **Never edit code or create non-context files.** The only file you write is the context artifact.
- **Never propose a fix or approach.** Findings and open questions only.
- If the issue is too vague to anchor into code, say so plainly and list what's missing — an honest "context is
  thin because the issue lacks X" is more useful than fabricated relevance.
