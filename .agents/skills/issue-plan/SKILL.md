---
name: issue-plan
description: >-
  Design a fix for a GitHub issue from already-gathered context — this produces a PLAN, not code. Use right after
  the issue-context skill writes its context artifact (`.sdlc/context/issue-<N>.md`), or whenever the user asks to
  "plan the fix", "how should we fix #N", "draft an approach for this issue", "turn the context into a plan", or
  "what's the plan for issue 42". It reads the context artifact, resolves the open questions left for planning,
  chooses an approach, and writes an ordered implementation plan (approach, steps with file targets, tests, risks)
  to `.sdlc/plans/issue-<N>.md` — then pauses for review before any implementation. It plans only; it never edits
  code. Modular — drop into any git repo. Second stage of an issue → context → plan → fix pipeline; pairs with the
  issue-context skill.
compatibility: Requires `git`. Expects a context artifact from the issue-context skill (or will gather it first).
---

# Issue Fix Planning

## What this skill is for

This is the **planning stage** of a fix pipeline. The prior stage (`issue-context`) gathered raw, unbiased
context and deliberately stopped short of any solution. This stage picks up that context artifact and turns it
into a concrete, reviewable plan — and then stops short of *implementation*.

Three stages, three boundaries: **context** answers "what exists and is relevant," **plan** answers "what we'll
do and why," **implementation** (a later, separate step) does it. Keeping plan separate from implementation means
a human (or another agent) can review and correct the approach cheaply — before any code is written and while
changing direction still costs nothing.

## What changes from the context stage: now you decide

The context stage was forbidden from choosing an approach. This stage is the opposite — **deciding is the job.**
You are expected to resolve the open questions, commit to an approach, and justify it. Where a decision genuinely
needs a human or product call (a UX choice, a backward-compat tradeoff, a priority), surface it explicitly as a
**decision needed** rather than silently guessing. The line you do *not* cross is writing or editing code.

**Do** produce: a chosen approach, ordered steps with concrete file targets, a test strategy, risks, and any
decisions that need a human.
**Do not** produce: code edits, new files other than the plan artifact, or a half-started implementation.

## Configuration

- **Reads:** the context artifact, default `.sdlc/context/issue-<NUMBER>.md`.
- **Writes:** the plan artifact, default `.sdlc/plans/issue-<NUMBER>.md`.

Match whatever directory convention the context stage used in this repo; if it wrote somewhere else, mirror it.
Create parent directories as needed.

## Invocation

Reached automatically via the hand-off from `issue-context`, but also has a deterministic slash entry point —
typing it forces invocation with no triggering ambiguity:

- `/issue-plan 42` — plan the fix for issue 42 from its context artifact
- `/issue-plan #42` or a full issue URL — also accepted

Everything after the skill name is the issue reference. If invoked with **no** reference, don't guess: ask which
issue, or — if exactly one artifact exists in `.sdlc/context/` — confirm that one before proceeding. If the
issue's context artifact doesn't exist yet, gather it first (see step 1).

## Workflow

### 1. Locate the inputs

Resolve the issue number (from the argument, a `#N`, or a URL). Find the context artifact at the configured path.

If the artifact is **missing**, do not invent context — that defeats the pipeline. Invoke the `issue-context`
skill first to gather it (Skill tool), then continue. If `issue-context` isn't installed, tell the user that
context-gathering must run first and stop.

### 2. Absorb the context

Read the **entire** artifact — problem statement, code locations, blast radius, tests, git history, environment,
and especially the **Open questions for planning** section.

The artifact records the commit it was gathered on. If `HEAD` has moved meaningfully since then, spot-check that
the key code locations still match (files renamed, lines shifted). Note any drift in the plan — a plan built on
stale context is worse than no plan.

### 3. Resolve the open questions

This is the core of planning. Walk each open question the context stage logged and resolve it:
- **Decide from evidence** when the context supports a clear answer, and state the evidence.
- **Flag as a decision needed** when it requires a human/product judgment (e.g. desired behavior is genuinely
  ambiguous, or there's a real tradeoff). Don't paper over these — a flagged decision is a feature, not a gap.

### 4. Choose an approach

Identify the viable approaches. Pick one and briefly justify it; note the main alternative(s) you rejected and
why. Keep the **blast radius** from the context's surrounding-context section front of mind — an approach that
touches a shared utility or public API carries more risk than a localized change, and the plan should say so.

Prefer the smallest change that correctly addresses the **root cause**, not just the symptom. If the context
suggests the reported bug is a symptom of something deeper, say that and plan for the cause.

### 5. Break it into ordered steps

Decompose the approach into concrete, ordered steps. Each step should:
- Name the **specific file(s) and `file:line` targets** to change, drawn from the artifact's code locations.
- Be small enough to implement and review on its own.
- State what "done" looks like for that step.

Describe the changes precisely in prose — the implementer (next stage) writes the actual code.

### 6. Test strategy

From the artifact's test section, lay out:
- Which **existing tests** cover the area and must keep passing.
- What **new tests** to add (describe them — name, what they assert, the case they lock in — but don't write
  them).
- How to **reproduce the issue and verify the fix**, using the run/test commands the context captured.

### 7. Risks & rollout

Call out what could go wrong:
- **Blast radius / regressions** — what else depends on the code being changed.
- **Migration / backward-compat** — data, API, or config concerns.
- **Sequencing or feature-flagging** — if the change is risky or large enough to warrant a staged rollout.

### 8. Write the plan, then pause

Write the plan to the configured path using the template below. Then present a concise summary in the
conversation — the chosen approach, the step count, and any **decisions needed** — and **pause**.

Do **not** start implementing. Implementation is a separate stage that should begin only on an explicit go-ahead.
End by stating the plan is ready for review and asking whether to proceed to implementation (or to revise the
plan). If any **decisions needed** are open, those must be answered before implementation can sensibly start —
say so.

### 9. Hand off to implementation — gated on approval

Implementation is the next stage (the `issue-implement` skill), but the hand-off is **gated**, not automatic.
It may only fire when **both** conditions hold:

1. The user has **explicitly approved** the plan (e.g. "looks good, go ahead", "implement it").
2. There are **no open Decisions needed** — every blocking decision has been answered.

When both hold, hand off by invoking the `issue-implement` skill (Skill tool) with the issue number. That stage
writes code, runs the project's checks, and opens a PR — so the user's approval here is the authorization for
that whole downstream, which is exactly why it must be explicit. Until then, stay paused: do not invoke
`issue-implement`, and never implement the fix yourself in this skill. If `issue-implement` isn't installed, tell
the user the plan is approved and ready to implement, and stop.

## Plan template

```markdown
# Plan: Issue #<NUMBER> — <title>

- **Context source:** `.sdlc/context/issue-<NUMBER>.md` (gathered on <short-sha>)
- **Planned:** <date> on commit <short-sha>
- **Context drift:** <none / note any files/lines that moved since context was gathered>

## Problem (from context)
<2–4 sentence factual restatement of what we're fixing and the expected vs. actual behavior.>

## Resolved questions
| Open question | Resolution | Basis |
|---------------|------------|-------|
| <question from context> | <decision> | <evidence, or "decision needed — see below"> |

## Decisions needed (blocking)
<Questions requiring a human/product call before implementation. Omit the section if none.>
- <decision> — <the options and the tradeoff>

## Approach
<The chosen approach and why. Note rejected alternatives in a sentence each.>

## Implementation steps
1. **<step title>** — `path/to/file.ext:LINE`
   <what to change, in prose; "done" = <criterion>>
2. ...

## Test strategy
- **Must keep passing:** <existing tests + command>
- **New tests to add:** <described, not written>
- **Reproduce & verify:** <steps/commands>

## Risks & rollout
- **Blast radius:** <what else is affected>
- **Migration / compat:** <or "none">
- **Sequencing / flags:** <or "ship directly">

> Plan only. No code written. Implementation is a separate, explicitly-approved stage.
```

## Guardrails recap

- **Plan, don't build.** The only file you write is the plan artifact. No code edits, no scaffolding, no
  partial implementation.
- **Decide, but flag genuine judgment calls.** Resolving open questions is your job; surface the ones that truly
  need a human as *decisions needed* rather than guessing.
- **Don't plan on missing or stale context.** If there's no artifact, gather it via `issue-context` first; if
  the context is clearly stale, refresh it rather than planning on top of it.
