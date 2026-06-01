---
name: issue-implement
description: >-
  Implement the approved fix for a GitHub issue from its plan artifact — writes the code, adds tests, verifies,
  commits, and pushes a fix branch, then hands off to code review (which opens the PR). Use this once a plan from
  the issue-plan skill has been reviewed and approved, or when the user says "implement the fix", "build the fix
  from the plan", "go ahead and implement #N", "ship the fix for issue 42", or "execute the plan for this issue".
  It reads `.sdlc/plans/issue-<N>.md`, makes exactly the changes the plan describes on a feature branch, runs the
  project's tests/lint/build, commits, and pushes — it does NOT open the PR itself; that happens in the review
  stage. Modular — drop into any git repo. The implementation stage of an issue → context → plan → implement →
  review pipeline; pairs with issue-plan and issue-review.
compatibility: Requires `git` and `gh` (authenticated, for push). Expects an approved plan from issue-plan.
---

# Issue Fix Implementation

## What this skill is for

This is the **implementation stage** of an issue → context → plan → implement → review pipeline. The earlier
stages gathered context and produced a reviewed plan; this stage executes that plan into working code on a fix
branch and pushes it, then hands off to the **review** stage, which is what actually opens the PR. It is the only
stage that writes the fix code.

Because it pushes a branch, it acts on **shared state**. The safety model is deliberate: this skill should only
run on an **approved** plan, and the plan approval is the single authorization checkpoint for everything
downstream, including the push and (in the next stage) the PR. Within that, the skill still refuses to do
anything destructive or to ship code that doesn't pass the project's own checks.

## The contract: build the plan, nothing more

Implement **exactly** what the approved plan describes — its ordered steps, its file targets, its test strategy.
Do not expand scope, refactor adjacent code, or "improve" things the plan didn't call for. If you discover the
plan is wrong or incomplete mid-implementation (a step doesn't work, a file moved, an assumption breaks), **stop
and report** rather than improvising a different fix — that's a signal to revise the plan, not to freelance.

## Invocation

Normally reached via the gated hand-off from `issue-plan` (only after the user approves the plan). It also has a
deterministic slash entry point:

- `/issue-implement 42` — implement the approved plan for issue 42
- `/issue-implement #42` or a full issue URL — also accepted

Everything after the skill name is the issue reference. Invoking this directly is itself a go-ahead to implement
and push the branch (the PR is opened later, by the review stage) — but the preconditions below still apply: no
approved plan, or open blocking decisions, means stop. If invoked with no reference, ask which issue rather than
guessing.

## Preconditions — verify before doing anything

1. **An approved plan exists.** Read `.sdlc/plans/issue-<NUMBER>.md`. If it's missing, the pipeline hasn't
   reached this stage — direct the user to run `issue-plan` first and stop.
2. **No unresolved blockers.** If the plan's **Decisions needed (blocking)** section still has open items, stop:
   those must be answered before implementation can sensibly proceed. (The gated hand-off from `issue-plan`
   should prevent this, but check anyway — a manually-invoked run might not have.)
3. **Clean-enough working tree.** Run `git status`. If there are unrelated uncommitted changes, surface them and
   confirm with the user before proceeding — you don't want to sweep someone's work into this fix's commit.

## Workflow

### 1. Branch

Never commit the fix directly to `main`/`master`. Create and switch to a feature branch:

```
fix/issue-<NUMBER>-<short-slug>
```

If a branch for this issue already exists, check it out and continue on it rather than creating a duplicate.

### 2. Implement the plan, step by step

Work the plan's implementation steps **in order**. For each step, make the change at the file targets the plan
names. Keep changes tightly scoped to the step. Use the codebase's existing conventions (the context artifact and
surrounding code show them) — match what's there rather than imposing a new style.

### 3. Add the tests the plan specified

Write the new tests described in the plan's test strategy — the ones that lock in the fix and would have caught
the bug. Put them where the project's existing tests live, following their patterns.

### 4. Verify — and do not proceed if this fails

Run the project's checks, **in this order**, using the commands the context/plan captured (or detected from the
package manifest, Makefile, or CI config):

1. **Tests** — the full relevant suite, including your new tests.
2. **Lint**.
3. **Build**.

If any step fails, **fix the underlying issue and re-run** — never push broken code, never skip or weaken a
check to make it pass (`--no-verify`, deleting assertions, `xfail`-ing the new test, etc.). If you genuinely
cannot get them green, **stop and report** what's failing and why; do not commit or push.

This mirrors the standard pre-push discipline: tests, then lint, then build, all green before anything leaves the
machine.

### 5. Commit

Once everything is green, stage the relevant files (by name — don't blanket-add) and create a commit. Write a
message that explains the *why*, and link the issue so it auto-closes on merge:

```
<type>: <concise summary>

<short body: what the fix does and why, referencing the plan>

Fixes #<NUMBER>
```

Create a **new** commit; never amend or force-anything. Don't bypass commit hooks — if a hook fails, fix the
cause.

### 6. Push the branch

Push the branch (`-u` to set upstream). **Do not open the PR here** — that is the review stage's job. Pushing
without a PR is fine: it backs up the work and gives the review stage a remote branch to open against.

### 7. Hand off to review

This stage does not open the PR. Once the branch is pushed with a green gate, hand off to the **review** stage:
invoke the `issue-review` skill (Skill tool) with the issue number. It runs a full code review of the diff
against the plan, fixes any blocking findings, re-verifies, and then opens the PR. If `issue-review` isn't
installed in this repo, stop and tell the user the fix is committed and pushed on the branch and is ready for
review + PR — but do **not** open the PR yourself, so the review gate is never skipped.

### 8. Report

Return the **branch name**, a one-line summary of what was implemented, and the verification results
(tests/lint/build all green). State that the branch is pushed and handed to the review stage — the PR has not
been opened yet.

## Guardrails recap

- **Feature branch only.** Never commit or push to `main`/`master` directly.
- **Green or stop.** No push unless tests, lint, and build all pass. Never weaken a check to get there.
- **Plan fidelity.** Build what the plan says; if the plan is wrong, stop and flag it rather than inventing a
  different fix.
- **Don't open the PR.** Opening the PR belongs to `issue-review`, which gates it on a full code review. Hand
  off; don't shortcut.
- **No destructive or stealthy git.** No force-push, no `--no-verify`, no amending published commits, no
  blanket `git add -A`. Create new commits and push normally.
