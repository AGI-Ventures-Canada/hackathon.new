---
name: babysit-pr
description: Babysit every open PR authored by the current GitHub user. Wait for the claude[bot] reviewer and CI to run, address all actionable feedback, commit and push fixes, and loop every 5 minutes until the PR is clean — then post a GitHub comment tagging the author so they get a push notification. Use after creating a new PR, or when the user says "babysit my PRs", "address my PR feedback", "fix the review bot comments", or similar.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(gh:*), Bash(git:*), Bash(bun:*), Bash(bunx:*), Bash(jq:*), Bash(awk:*), Bash(sort:*), Bash(uniq:*), Bash(wc:*), ScheduleWakeup, Skill
---

# Babysit PR

Autonomously shepherd every open PR authored by the current `gh` user through CI and the claude[bot] reviewer until it is clean and ready for human review. This skill is designed to be invoked via `/loop /babysit-pr` (dynamic self-pacing) so it can wake itself every 5 minutes.

## Invocation

The user invokes this skill via `/loop /babysit-pr`. The first iteration runs immediately; subsequent iterations are scheduled by this skill via `ScheduleWakeup` with `delaySeconds: 300` (5 min), `prompt: "/babysit-pr"`. When all PRs are ready, **omit** the `ScheduleWakeup` call to end the loop.

If the user invokes `/babysit-pr` directly (without `/loop`), still run one iteration and schedule the next wake — the wake mechanism is the same.

## Pre-flight Checks

Run once at the top of every iteration:

1. **Working tree must be clean.** Run `git status --porcelain`. If non-empty, abort with an alert to the human: *"Working tree has uncommitted changes — babysit-pr refuses to run. Commit or stash before retrying."* Do not schedule another wake.
2. **`gh` must be authenticated.** Run `gh auth status`. If not authenticated, alert and stop.
3. **Identify the current user**: `gh api user --jq .login` → store as `$ME`.
4. **List target PRs**: `gh pr list --author @me --state open --json number,headRefName,baseRefName,headRefOid,url,title --limit 50`. If empty, alert *"No open PRs to babysit"* and stop the loop (no wake).

## Per-PR Babysit Cycle

Process PRs sequentially, one at a time. For each PR `#N` on branch `$B`:

### 1. Collect State (run in parallel)

- `gh pr view N --json statusCheckRollup,reviewDecision,mergeable,headRefOid,headRefName,isDraft`
- `gh api "repos/{owner}/{repo}/pulls/N/reviews" --jq '.[] | select(.user.login | test("claude"; "i")) | {id, commit_id, state, submitted_at, body}'`
- `gh api "repos/{owner}/{repo}/pulls/N/comments" --paginate --jq '.[] | select(.user.login | test("claude"; "i"))'`  (review comments are file/line-scoped — this is the main feedback surface)
- `gh api "repos/{owner}/{repo}/issues/N/comments" --paginate --jq '.[] | select(.user.login | test("claude"; "i"))'` (PR-level conversation comments)

Use `jq -s` to merge comment arrays as needed.

### 2. Skip Conditions

Skip this PR this iteration (no changes, but still schedule a wake) if any of:

- `isDraft: true` — don't babysit drafts
- `statusCheckRollup` still has `in_progress` or `queued` checks → CI isn't done yet
- Latest claude[bot] review was submitted **less than 60 seconds ago** → give the reviewer a beat
- Latest commit on `$B` has no finished CI run yet

### 3. Classify Feedback

Partition comments by commit:

- **Actionable** — claude[bot] review comments where `commit_id` equals the current `headRefOid` AND no subsequent review with `state: APPROVED` or `state: DISMISSED` exists from claude[bot]
- **Stale** — comments on older commits where the referenced lines have since been modified. Treat as resolved.
- **Human** — any comment not authored by a `claude*` bot. **Never address these** — not this skill's job.

### 4. Detect Regression Loops

Before attempting fixes, detect regression:

1. Pull all claude[bot] review comments across the full PR history (including older commits).
2. Group by `(path, original_line)`.
3. A group is a **regression loop** if it has **≥ 3 comments across ≥ 2 distinct commits**, where prior occurrences were followed by commits touching that file.
4. For each regression group: DO NOT attempt another fix. Add it to the summary and use Step 6 to reply explaining.

### 5. Fix Actionable Comments

Ensure local branch is synced with remote:

```bash
git fetch origin
git checkout $B
git pull --ff-only origin $B
```

For each actionable comment (in file path order, to batch edits):

- Read the referenced file + lines.
- Apply the smallest fix that addresses the comment.
- If the comment is a subjective suggestion ("consider renaming"), architectural pushback, or you can't confidently implement it, **skip it** and handle via Step 6.
- Never fix by suppressing the lint/check (no `// eslint-disable`, no `// @ts-ignore`) — the comment is about the underlying issue.

Also fix CI failures (independent of comments):

- Lint: `bun lint` → fix violations directly (not via `--fix` blindly — read diffs).
- Build: `bun run build` → fix compilation errors.
- Tests: `bun run test:all` → fix failing tests. If a test failure reveals a bug in test code vs production code, fix the right one (usually production, unless the test is clearly wrong).
- If a check failure isn't something the skill can safely fix (flaky test, infrastructure error, external service down), note it in the summary and skip.

### 6. Reply on Skipped Comments

For each comment in Step 4 (regression) or Step 5 (unfixable), post a reply:

```bash
gh api --method POST \
  "repos/{owner}/{repo}/pulls/N/comments/{comment_id}/replies" \
  -f body="<explanation>"
```

Explanation templates:

- **Regression**: *"I've attempted this fix across multiple commits and it keeps re-surfacing. Flagging for human review rather than looping further."*
- **Architectural/subjective**: *"This is a design decision that needs human judgment — leaving as-is for author review."*
- **Cannot safely fix**: *"I can't address this mechanically without risk of breaking `<thing>`. Flagging for human review."*

### 7. Pre-Push Checklist

Before committing, run the project's checks in order:

```bash
bun lint && bun run build && bun run test:all
```

If any fail AFTER your fixes, stop — do **not** push broken code. Alert the human and skip this PR for the iteration.

### 8. Commit and Push

Stage only files you touched (never `git add -A`):

```bash
git add <specific files>
git commit -m "fix(review): address claude[bot] feedback"
git push origin $B
```

- Use `--force-with-lease` **only** if you had to rebase (you shouldn't need to in this skill — only append commits).
- Never push to `main` or `staging` directly (you'll be on the PR branch, but double-check: `git branch --show-current` must equal `$B`).

### 9. Readiness Check

A PR is **ready for human review** when all of:

- Zero open claude[bot] review comments on `headRefOid`
- `statusCheckRollup` — every check has `conclusion: SUCCESS` (or `NEUTRAL` / `SKIPPED`)
- Latest claude[bot] review (if present) has `state: APPROVED` OR no review has been requested since last commit
- PR is not a draft

If ready AND the skill hasn't already posted a "ready" comment on the current `headRefOid`:

```bash
gh pr comment N --body "@$ME — this PR has been babysat clean and is ready for your review.

<summary — see template below>"
```

Track "already notified" by checking for an existing issue comment authored by the current user that contains the text "babysat clean" AND references the current `headRefOid` (include the short SHA in the body so you can detect it next iteration).

### 10. Summary Template

```markdown
@$ME — this PR has been babysat clean and is ready for your review.

**Commit:** `<short-sha>`

**Iterations:** <N>
**claude[bot] comments addressed:** <X fixed, Y replied>
**CI fixes:** <lint/build/test counts or "none">
**All checks:** green

<if any regression loops:>
**⚠️ Regression loops detected (left for human judgment):**
- `path/to/file.ts:42` — bot kept flagging "<summary>" across 3 commits
- ...
```

## Loop Control (End of Iteration)

After processing all PRs:

- **If every PR is ready** (or only skipped for non-recoverable reasons): do NOT call `ScheduleWakeup`. The loop ends naturally. Output a final one-line summary to the user.
- **If any PR still has actionable work or pending CI**: call `ScheduleWakeup` with `delaySeconds: 300`, `reason: "waiting for claude[bot] and CI to run against latest push"`, `prompt: "/babysit-pr"`.
- **Max iterations guardrail**: if any single PR has been through **10+ babysit iterations** without reaching ready, stop looping for that PR, post an alert comment tagging `@$ME` explaining the stall, and move on.

## Safety Rules

- **Never push to `main` or `staging`.** Verify current branch before every push.
- **Never force-push** (except `--force-with-lease` if the skill had to rebase — prefer append-only).
- **Never merge the PR.** Always leave merging to the human.
- **Never dismiss or resolve human reviewer comments.** Only claude[bot] comments are in scope.
- **Never commit with a dirty working tree that wasn't your doing.** Abort if pre-flight finds unexpected changes.
- **Never skip CI checks with `--no-verify` or equivalent.** If hooks fail, fix the root cause.
- **Never `git add -A` or `git add .`** — stage specific files only.
- **Never suppress the issue** a review comment points at (no `eslint-disable`, no `@ts-ignore`, no `.skip` on failing tests) — fix the underlying problem.
- **If unsure, stop and ask** — post a comment tagging the human rather than guessing at an ambiguous fix.

## Portability Notes

This skill is currently scoped to the Oatmeal repo's toolchain (`bun lint`, `bun run build`, `bun run test:all`). To lift it to another project, replace those commands in **Step 7** with the target project's equivalents. The GitHub/git logic is project-agnostic.
