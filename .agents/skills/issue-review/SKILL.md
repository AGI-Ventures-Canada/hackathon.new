---
name: issue-review
description: >-
  Run a full code review of an implemented fix BEFORE opening the pull request, then open it. Use right after the
  issue-implement skill has committed and pushed a fix branch, or when the user says "review the fix for #N before
  the PR", "code-review issue 42's changes", "review and raise the PR", or "is this fix ready to open?". It reviews
  the branch diff against the approved plan and a correctness/security/tests/conventions rubric, auto-fixes
  blocking findings (re-verifying tests/lint/build), records non-blocking nits, and only then pushes and opens the
  PR linking the issue. If the repo has its own code-review skill/command, it delegates to that; otherwise it uses
  a built-in rubric. Modular — drop into any git repo. The review-and-publish stage of an issue → context → plan →
  implement → review pipeline; pairs with issue-implement. It never merges the PR.
compatibility: Requires `git` and `gh` (authenticated). Expects a committed fix branch from issue-implement.
---

# Pre-PR Code Review

## What this skill is for

This is the **review-and-publish stage**. The implement stage made the fix work and committed it on a branch;
this stage makes sure it's *right* before the rest of the team sees it, then opens the PR. Separating "make it
work" from "make it right and publish" means the diff gets a deliberate critical pass — against the plan and a
quality rubric — instead of going straight to reviewers raw.

A self-review by the same agent that wrote the code is weaker than an independent one, so the goal here is to
shift into a genuinely skeptical frame: assume there *is* a bug or a gap and go looking for it, rather than
confirming the work is fine.

## Boundaries: review and open, never merge

**Do:** review the diff, fix blocking problems, re-verify, write a review record, push, open the PR.
**Do not:** merge the PR, expand the fix beyond the plan, or gold-plate. Opening the PR is the end of this stage;
merging is a human decision.

If review uncovers that the **plan itself was wrong** (not just the code) — the approach doesn't actually solve
the issue, or it causes a problem the plan didn't anticipate — **stop and flag it** for re-planning rather than
silently redesigning the fix here. Re-architecting under the guise of "review fixes" defeats the pipeline's
checkpoints.

## Invocation

Normally reached automatically from `issue-implement`. Deterministic slash entry point:

- `/issue-review 42` — review the fix branch for issue 42 and open its PR
- `/issue-review #42` or a full issue URL — also accepted

If invoked with no reference, infer the issue from the current `fix/issue-<N>-*` branch; if that's ambiguous,
ask. Invoking this is a go-ahead to open the PR once review passes.

## Workflow

### 1. Locate inputs and scope the diff

Resolve the issue number, the fix branch (usually the current `fix/issue-<N>-*`), and the base branch (the
repo's default branch, e.g. `origin/main`). Read the approved plan at `.sdlc/plans/issue-<NUMBER>.md`.

Get the review scope:
```
git diff <base>...HEAD --stat      # what changed
git diff <base>...HEAD             # the actual change
```
If there's no diff, there's nothing to review — report that and stop. Read the **full** changed files (not just
the hunks) so you review the change in context, not through a keyhole.

### 2. Confirm the gate is green

A review on top of failing checks is moot. Confirm (re-running if you're not certain they're fresh) that
**tests, lint, and build** all pass. If they don't, that's the first blocking finding — fix before reviewing
further.

### 3. Pick the reviewer

If the repo already has code-review tooling — a `/code-review` skill, a `.claude/skills/*review*`, or a review
command documented in `CLAUDE.md`/`AGENTS.md` — **delegate to it** and collect its findings; the team tuned it
for their standards. Otherwise, use the built-in rubric below. You can also combine: run the repo's tool and add
any rubric dimensions it doesn't cover.

### 4. Review rubric (built-in)

Go dimension by dimension over the diff. For each, look for concrete problems, not vibes:
- **Plan fidelity** — does the change implement the approved plan? Any scope creep, skipped steps, or silent
  deviations? (Deviations aren't automatically wrong, but they must be justified.)
- **Correctness & edge cases** — logic errors, off-by-one, null/empty/zero, error and failure paths, async races,
  state that can get out of sync.
- **Security** — untrusted input at boundaries, injection, authz checks, secrets, unsafe rendering.
- **Tests** — do the new tests actually exercise the fix and lock in the regression? Are assertions meaningful
  (not just "renders")? What important path is still untested?
- **Conventions** — matches surrounding code and the project's documented rules (CLAUDE.md/AGENTS.md): naming,
  imports, form/input conventions, error handling patterns.
- **Performance & footprint** — obvious inefficiencies, needless dependencies, work that could be memoized or
  avoided.
- **UI (if applicable)** — loading/empty/error states, accessibility (labels, keyboard), responsive behavior.

### 5. Classify findings

Sort every finding into:
- **Blocking** — correctness, security, missing/weak tests for the core behavior, plan violations, convention
  breaches that would fail review. These must be resolved before the PR opens.
- **Non-blocking** — nits, stylistic preferences, optional improvements. These get noted, not necessarily fixed.

Be honest about the split. Inflating nits into blockers causes thrash; burying a real bug as a nit defeats the
review.

### 6. Resolve blocking findings, then re-verify

Fix each blocking finding in new commits (clear messages). After fixing, **re-run tests, lint, and build** — a
fix that breaks the gate isn't done. Loop until there are no blocking findings and the gate is green.

Restraint matters: fix what's blocking, note what isn't. Don't refactor untouched code or polish nits into a
sprawling diff — that makes the PR harder to review, not easier. If you find yourself fixing the same class of
issue repeatedly, stop and reconsider whether the plan/approach is the real problem (see boundaries above).

### 7. Write the review record

Write a short review artifact to `.sdlc/reviews/issue-<NUMBER>.md` using the template below — what you checked,
what was blocking and how it was resolved, and the non-blocking notes carried into the PR.

### 8. Push and open the PR

Push the branch and open the PR with `gh pr create` against the default branch. The body should include a
summary, a link to the plan, the **review summary** (blocking items resolved + any non-blocking notes), a test
plan, and `Fixes #<NUMBER>`. Do **not** merge.

### 9. Report and point to babysitting

Return the PR URL, the review verdict (e.g. "3 blocking resolved, 2 nits noted"), what changed during review, and
the remaining non-blocking notes. State the PR is open and awaiting human review — not merged.

Then point the user to the tail of the pipeline: the `babysit-pr` skill tends the open PR (watches CI, addresses
review feedback, keeps it current) until it's merge-ready. Because tending is an ongoing, interval activity,
don't invoke it once here — suggest running it on a loop, e.g. `/loop 10m /babysit-pr <pr-number>`. If
`babysit-pr` isn't installed, just note the PR is open and ready to be monitored.

## Review record template

```markdown
# Review: Issue #<NUMBER> — <title>

- **Branch:** <fix/issue-N-...>  →  base <default-branch>
- **Plan:** `.sdlc/plans/issue-<NUMBER>.md`
- **Reviewed:** <date> on commit <short-sha>
- **Reviewer:** <repo's /code-review tool | built-in rubric>

## Verdict
<e.g. "Ready — 2 blocking findings resolved, 3 nits noted.">

## Blocking findings (resolved)
1. <finding> — **Fix:** <what changed> (`<sha>`)

## Non-blocking notes (carried to PR)
- <nit / optional improvement>

## Checks
- [ ] Diff reviewed in full-file context
- [ ] Plan fidelity confirmed (deviations justified)
- [ ] Correctness / security / tests / conventions reviewed
- [ ] tests + lint + build green after fixes
```

## Guardrails recap

- **Never open the PR with unresolved blocking findings or a red gate.**
- **Never merge** — opening the PR is the end of this stage.
- **Review like an outsider** — assume there's a bug; don't rubber-stamp your own code.
- **Fix blocking, note the rest** — no gold-plating, no scope creep, keep the diff reviewable.
- **Plan problems escalate, not improvise** — if the approach is wrong, flag for re-planning.
