---
name: skill-creator
description: Scaffold, test, and iteratively improve Agent Skills that conform to the agentskills.io specification. Use when the user asks to "create a skill", "make a skill", "add a skill", "write a SKILL.md", convert a workflow or script into a reusable skill, run evals to test a skill, benchmark skill performance with variance analysis, optimize a skill's description for better triggering accuracy, or split an oversized SKILL.md into smaller skills.
allowed-tools: Read Write Edit Bash(mkdir:*) Bash(ls:*) Bash(wc:*) Bash(find:*) Bash(chmod:*) Bash(cp:*) Bash(python:*) Bash(python3:*) Bash(nohup:*) Bash(kill:*) Bash(open:*) Bash(tail:*) WebFetch
---

# Skill Creator

Create, test, and iteratively improve Agent Skills that conform to the [agentskills.io specification](https://agentskills.io/specification). The loop looks like this:

- Interview the user to capture intent
- Draft the skill (structure + frontmatter + body)
- Run test prompts against the draft (with-skill and baseline in parallel)
- Evaluate qualitatively (human review) and quantitatively (assertions)
- Improve the skill based on feedback
- Repeat until satisfied
- Optionally: optimize the description for triggering accuracy, then package for distribution

Your job is to figure out where the user is in this process and jump in to help them progress. Rough idea? Start at the interview. Already have a draft? Jump to eval/iterate. "Just vibe with me, skip the evals"? Do that.

## When to activate

- User asks to create, scaffold, or author a new skill (e.g. "create a skill for X", "add a SKILL.md", "make a skill that Y")
- User asks to convert existing instructions, a script, or a workflow into a reusable skill
- User asks to test, evaluate, benchmark, or iterate on an existing skill
- User asks to optimize a skill's triggering / description
- User asks to split an oversized SKILL.md into smaller skills

## When NOT to activate

- User wants to *use* an existing skill (activate that skill directly)
- User asks to configure Claude Code settings, hooks, or slash commands (use `update-config`)
- User asks to edit `CLAUDE.md` or project memory (use `claude-md-improver` or memory tools)

## Communicating with the user

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. Pay attention to context cues:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see cues the user knows the terms before using them unexplained

It's fine to briefly define terms you're unsure about.

---

## Phase 1 — Draft the skill

### 1. Interview (required)

Before writing any files, capture intent. If the current conversation already contains a workflow the user wants to capture ("turn this into a skill"), extract answers from the history first — tools used, step sequence, corrections, I/O formats — and only ask to fill gaps.

Ask:

1. **Purpose** — one sentence: what task does this skill help with?
2. **Activation triggers** — what user phrases or contexts should cause the agent to pick it up?
3. **Output format** — what shape does success take?
4. **Scope** — public/installable skill or internal project helper?
   - Public → lives in `skills/<name>/` at repo root
   - Internal → lives in `.claude/skills/<name>/` with `metadata.internal: true` in frontmatter
5. **Scripts?** — does the skill bundle executable code? If yes, language + purpose.
6. **References?** — any long-form docs, command tables, or templates to split off?
7. **Tool restrictions** — which tools does the skill *actually* need? Default to the smallest set that works.
8. **Test cases?** — skills with objectively verifiable outputs (file transforms, data extraction, code generation) benefit from test cases. Subjective outputs (writing style, design) often don't. Suggest a default, let the user decide.

If the user gives a one-line request, still run the interview in condensed form — ask the missing answers as a short numbered list, then wait.

Check available MCPs — if useful for research (searching docs, finding similar skills), research in parallel via subagents if available. Come prepared to reduce burden on the user.

### 2. Validate the name

The `name` field and the parent directory must match, and both must satisfy:

- 1–64 characters
- lowercase `a-z`, digits, and `-` only
- no leading/trailing hyphen
- no consecutive hyphens (`--`)

If the user's proposed name violates any of these, propose a corrected name and confirm before proceeding.

### 3. Scaffold the folder

Only add subfolders that will actually be used — empty "just in case" folders are noise.

```
<skill-name>/
├── SKILL.md          # required
├── scripts/          # optional — only if the skill ships executables
├── references/       # optional — only if content is split out
└── assets/           # optional — templates, images, data files
```

### 4. Write the SKILL.md

Frontmatter template (remove any field you don't use):

```markdown
---
name: <skill-name>
description: <what it does AND when to use it — include trigger keywords>
allowed-tools: <space-separated minimal tool list>
license: <optional>
compatibility: <optional — only if the skill needs specific env>
metadata:
  internal: true   # only for internal/non-public skills
---
```

**Description rules:**

- 1–1024 chars, but aim for 2–4 sentences
- Lead with what the skill does
- End with trigger keywords ("Use when the user asks to…")
- The description is the primary triggering mechanism — all "when to use" info goes here, not in the body
- Claude currently tends to *under*-trigger skills. Be a little pushy: instead of *"Build a dashboard to display internal data"*, write *"Build a dashboard to display internal data. Use whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data — even if they don't explicitly say 'dashboard'."*

**Body rules:**

- Start with a one-paragraph overview
- Include a `## When to activate` and `## When NOT to activate` section so the agent can disambiguate
- Step-by-step workflows beat prose
- Use the imperative form
- Explain *why*, don't just stack `ALWAYS` / `NEVER`. All-caps absolutes are a yellow flag — reframe with reasoning so the model can generalize
- Move long tables, command references, and examples into `references/*.md`

### 5. Restrict tools (critical)

Populate the `allowed-tools` frontmatter field. Include **only** the tools the skill genuinely needs.

| Skill does… | Likely tools |
|---|---|
| Read-only analysis | `Read Bash(ls:*) Bash(find:*) Bash(grep:*)` |
| File edits | `Read Edit Write` |
| Runs a bundled script | `Bash(<script-name>:*) Read` |
| Web research | `WebFetch WebSearch` |
| Scaffolds a new file tree | `Write Edit Bash(mkdir:*)` |

Use the `Bash(cmd:*)` filter syntax to scope shell permissions. Never grant bare `Bash` unless the skill legitimately needs arbitrary shell access — and flag that decision to the user before writing it.

### 6. Scripts: RUN, do not READ

If the skill ships scripts, the SKILL.md **must** tell the agent to execute them, not to read them into context.

Put every script in `scripts/<name>.{sh,py,js}` and in the SKILL.md body write:

> **Run scripts/setup.sh — do not read its contents into context.** The script is self-documenting via `--help` and the body below describes its inputs and outputs.

Always document:

1. How to invoke (exact command, e.g. `bash scripts/setup.sh <arg>`)
2. What inputs it expects
3. What outputs/side effects it produces
4. When to prefer the script over inline tool calls

Make scripts executable (`chmod +x`). Scripts must be self-contained or document their dependencies at the top.

### 7. Progressive disclosure

Skills load in three levels:

1. **Metadata** (name + description) — always in context (~100 words)
2. **SKILL.md body** — in context whenever the skill triggers (<500 lines ideal)
3. **Bundled resources** — loaded as needed (unlimited; scripts can execute without loading)

Keep SKILL.md under 500 lines. If approaching the limit, add a layer of hierarchy with clear pointers to follow-up files. Reference files clearly from SKILL.md with guidance on when to read them. For large reference files (>300 lines), include a table of contents.

**Domain organization** — when a skill supports multiple domains/frameworks, organize by variant:

```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

Claude reads only the relevant reference file.

### 8. Enforce the 500-line cap (with modular-split plan)

After writing SKILL.md, run:

```bash
wc -l <skill-dir>/SKILL.md
```

- **≤ 500 lines** → proceed to validation.
- **> 500 lines** → stop. Present a **modular-split plan** to the user and wait for approval before continuing.

A split plan includes:

1. **Candidate split axes** — by lifecycle stage, by persona, by subcommand, by read-vs-write operations. Pick the axis that produces cohesive sub-skills.
2. **Proposed skills** — each with a draft `name`, `description`, and the sections that move there.
3. **Shared references** — material referenced from multiple skills goes under `references/`.
4. **Activation map** — how triggers route to each sub-skill so the user doesn't lose coverage.

Only after approval, create the new skill folders and repeat the workflow for each.

### 9. Validate

Run the final checks:

```bash
ls <skill-dir>                                    # confirm layout
wc -l <skill-dir>/SKILL.md                        # confirm ≤ 500
find <skill-dir> -name "SKILL.md" -maxdepth 2     # confirm name match
```

If the user has `skills-ref` installed, suggest `skills-ref validate ./<skill-dir>`. Don't block on it — optional tooling.

Report to the user: folder path, line count, tool list, and whether scripts/references were created.

---

## Phase 2 — Run and evaluate test cases

After the draft is clean, write test prompts and run them. This section is one continuous sequence — don't stop partway through. Do **not** use `/skill-test` or any other testing skill.

Write 2–3 realistic test prompts — the kind of thing a real user would actually type. Save to `evals/evals.json`. Don't write assertions yet — just the prompts. You'll add them in step 2 while runs are in progress.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {"id": 1, "prompt": "User's task prompt", "expected_output": "Description of expected result", "files": []}
  ]
}
```

See `references/schemas.md` for the full schema.

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Within the workspace, organize by iteration (`iteration-1/`, `iteration-2/`, …) and within that, each test case gets a descriptively-named directory. Create directories as you go, not upfront.

### Step 1: Spawn all runs (with-skill AND baseline) in the same turn

For each test case, spawn **two** subagents in the same turn — one with the skill, one without. Launch everything at once so runs finish around the same time.

**With-skill run:**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about — e.g., "the .docx file", "the final CSV">
```

**Baseline run** (same prompt, baseline depends on context):

- **New skill**: no skill at all. Same prompt, save to `without_skill/outputs/`.
- **Improving an existing skill**: the old version. Snapshot before editing (`cp -r <skill-path> <workspace>/skill-snapshot/`), point the baseline subagent at the snapshot. Save to `old_skill/outputs/`.

Write `eval_metadata.json` for each test case (assertions empty for now):

```json
{"eval_id": 0, "eval_name": "descriptive-name", "prompt": "The user's task prompt", "assertions": []}
```

### Step 2: Draft assertions while runs are in progress

Don't just wait. Draft quantitative assertions for each test case and explain them to the user. Good assertions are objectively verifiable and have descriptive names — they should read clearly in the benchmark viewer. Subjective skills (writing style, design) are better evaluated qualitatively — don't force assertions onto things that need human judgment.

Update `eval_metadata.json` and `evals/evals.json` with the assertions once drafted.

### Step 3: Capture timing data as runs complete

When each subagent task completes, the notification contains `total_tokens` and `duration_ms`. Save immediately to `timing.json` in the run directory:

```json
{"total_tokens": 84852, "duration_ms": 23332, "total_duration_seconds": 23.3}
```

This is the only chance to capture this data — process each notification as it arrives.

### Step 4: Grade, aggregate, and launch the viewer

Once all runs are done:

1. **Grade each run** — spawn a grader subagent (or grade inline) that reads `agents/grader.md` and evaluates each assertion against outputs. Save to `grading.json` in each run directory. The file must use fields `text`, `passed`, `evidence` — the viewer depends on these exact names. For programmatically-checkable assertions, write and run a script rather than eyeballing it.

2. **Aggregate into benchmark** — from the skill-creator directory:
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   Produces `benchmark.json` and `benchmark.md` with pass_rate, time, tokens per configuration, mean ± stddev, delta. See `references/schemas.md` for the schema. Put each with_skill version before its baseline counterpart.

3. **Analyst pass** — read the benchmark data and surface patterns the aggregate stats hide. See `agents/analyzer.md` for what to look for: non-discriminating assertions, high-variance evals, time/token tradeoffs.

4. **Launch the viewer:**
   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```
   For iteration 2+, also pass `--previous-workspace <workspace>/iteration-<N-1>`.

   **Cowork / headless**: no display → use `--static <output_path>` to write a standalone HTML file. Feedback downloads as `feedback.json` on "Submit All Reviews"; copy it into the workspace for the next iteration.

   Always use `generate_review.py` — don't write custom HTML.

5. **Tell the user**: "I've opened the results in your browser. There are two tabs — 'Outputs' lets you click through each test case and leave feedback, 'Benchmark' shows the quantitative comparison. When you're done, come back here."

The viewer's "Outputs" tab shows prompt, output (rendered inline where possible), previous output (iteration 2+), formal grades if graded, and a feedback textbox that auto-saves. "Benchmark" tab shows the stats summary with per-eval breakdowns. On "Submit All Reviews", feedback saves to `feedback.json`.

### Step 5: Read the feedback

When the user says they're done, read `feedback.json`:

```json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
```

Empty feedback means the user thought it was fine. Focus improvements where they left specific complaints.

Kill the viewer server when done:

```bash
kill $VIEWER_PID 2>/dev/null
```

---

## Phase 3 — Improve the skill

This is the heart of the loop. Based on the feedback:

1. **Generalize from the feedback.** Skills get used across many prompts. If a stubborn issue comes up in the test cases, don't patch it with overfitty MUSTs — try different metaphors, different patterns of working. It's relatively cheap to try.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Read the transcripts, not just the final outputs — if the skill is making the model waste time on unproductive things, cut those parts.

3. **Explain the why.** Today's LLMs are smart; good theory-of-mind means they go beyond rote instructions given good context. If you find yourself writing ALWAYS / NEVER in caps or super-rigid structure, reframe and explain *why* so the model can generalize.

4. **Look for repeated work across test cases.** If all three subagents independently wrote similar helper scripts, that's a signal the skill should bundle that script.

Your thinking time is not the blocker — take your time. Draft a revision, look at it anew, then apply.

### The iteration loop

1. Apply improvements to the skill
2. Rerun all test cases into a new `iteration-<N+1>/`, including baselines. New skill → baseline is always `without_skill`. Improving an existing skill → baseline can be the original snapshot or the previous iteration, your judgment.
3. Launch the viewer with `--previous-workspace` pointing at the previous iteration
4. Wait for review feedback
5. Read, improve, repeat

Stop when the user says they're happy, feedback is all empty, or you're not making meaningful progress.

---

## Advanced: blind comparison

For more rigorous comparison between two skill versions ("is the new one actually better?"), use the blind comparison system. Read `agents/comparator.md` and `agents/analyzer.md`. Give two outputs to an independent agent without telling it which is which; let it judge quality; analyze why the winner won.

Optional, requires subagents, most users won't need it — the human review loop is usually sufficient.

---

## Description optimization

The description field is the primary mechanism that determines whether Claude invokes a skill. After creating or improving a skill, offer to optimize the description for triggering accuracy.

### Step 1: Generate trigger eval queries

Create 20 eval queries — mix of should-trigger and should-not-trigger. Save as JSON:

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

Queries must be realistic — something a Claude Code or Claude.ai user would actually type. Include concrete detail: file paths, personal context, column names, company names, URLs. Mix lengths. Some lowercase, abbreviations, typos. Focus on edge cases rather than clear-cut.

Bad: `"Format this data"`, `"Extract text from PDF"`, `"Create a chart"`

Good: `"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"`

**Should-trigger (8–10)**: different phrasings of the same intent, some formal, some casual. Cases where the user doesn't explicitly name the skill or file type. Uncommon use cases. Cases where this skill competes with another but should win.

**Should-not-trigger (8–10)**: the valuable ones are near-misses — queries that share keywords but need something different. Adjacent domains, ambiguous phrasing, cases where another tool is more appropriate. Avoid obvious irrelevance — "Write a fibonacci function" as a negative test for a PDF skill is too easy.

### Step 2: Review with user

Present the eval set using the HTML template:

1. Read `assets/eval_review.html`
2. Replace placeholders:
   - `__EVAL_DATA_PLACEHOLDER__` → JSON array (no quotes — it's a JS variable assignment)
   - `__SKILL_NAME_PLACEHOLDER__` → skill name
   - `__SKILL_DESCRIPTION_PLACEHOLDER__` → current description
3. Write to `/tmp/eval_review_<skill-name>.html` and `open` it
4. User edits, toggles should-trigger, clicks "Export Eval Set"
5. Downloads to `~/Downloads/eval_set.json` — check for most recent version (`eval_set (1).json` etc.)

Bad eval queries lead to bad descriptions — this step matters.

### Step 3: Run the optimization loop

Tell the user: "This will take some time — I'll run the optimization loop in the background and check on it periodically."

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

Use the model ID from your system prompt so the triggering test matches what the user actually experiences.

While it runs, periodically `tail` the output and give progress updates.

The loop splits evals 60/40 train/test, evaluates the current description (3 runs per query for a reliable trigger rate), calls Claude to propose improvements, re-evaluates on both train and test, iterates up to 5 times. Returns `best_description` selected by *test* score (avoids overfitting).

### How skill triggering works

Skills appear in Claude's `available_skills` list with name + description. Claude consults a skill based on that description, but only for tasks it can't easily handle on its own — simple one-step queries ("read this PDF") may not trigger a skill even with a perfect description, because Claude handles them directly. Complex, multi-step, or specialized queries reliably trigger when descriptions match. So eval queries should be substantive.

### Step 4: Apply the result

Take `best_description` from the JSON output, update the skill's SKILL.md frontmatter. Show the user before/after and report scores.

---

## Package and present (if `present_files` tool is available)

Check whether you have the `present_files` tool. If not, skip. If yes:

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

After packaging, point the user at the `.skill` file.

---

## Environment-specific notes

### Claude.ai

Core workflow is the same (draft → test → review → improve → repeat), but:

- **No subagents** → no parallel runs. Read the skill's SKILL.md, follow its instructions yourself to accomplish each test prompt, one at a time. Skip baselines.
- **No browser / headless** → skip the browser reviewer. Present results inline: show prompt + output. For file outputs (.docx, .xlsx), save to filesystem and tell the user where. Ask for feedback inline.
- **Skip quantitative benchmarking** — relies on baselines that aren't meaningful without subagents.
- **Skip description optimization** — requires the `claude -p` CLI (Claude Code only).
- **Skip blind comparison** — requires subagents.
- **Packaging works** — `package_skill.py` just needs Python + filesystem.

### Cowork

- Subagents available → the main workflow works. If you hit severe timeouts, run test prompts in series.
- No display → use `--static <output_path>` to generate a standalone HTML file. Give the user a link.
- Cowork setup disinclines Claude from generating the eval viewer — explicitly: **GENERATE THE EVAL VIEWER BEFORE evaluating outputs yourself.** Get results in front of the human ASAP, using `generate_review.py` (not custom HTML).
- Feedback downloads as `feedback.json` on "Submit All Reviews" — you may have to request access before reading.
- Description optimization works (uses `claude -p` via subprocess, no browser). Save it for the end once the skill is in good shape.

### Updating an existing skill

- **Preserve the original name.** Keep the directory name and `name` frontmatter unchanged. If the installed skill is `research-helper`, output `research-helper.skill` (not `research-helper-v2`).
- **Copy to a writeable location before editing.** Installed skill paths may be read-only. Copy to `/tmp/skill-name/`, edit there, package from the copy.
- **Stage in `/tmp/` first if packaging manually**, then copy to output — direct writes may fail on permissions.

---

## Reference files (read as needed, not upfront)

- `references/frontmatter-and-anti-patterns.md` — field-by-field frontmatter spec, `allowed-tools` scope quick picks, and the full anti-pattern list. **Check before finalizing any skill's frontmatter.**
- `references/oatmeal-conventions.md` — Oatmeal repo-specific placement rules (public vs. internal, `.agents/` vs. `.claude/` symlinks, `CLAUDE.md` ↔ `AGENTS.md`, `skills-lock.json`).
- `references/schemas.md` — JSON structures for `evals.json`, `grading.json`, `benchmark.json`.
- `agents/grader.md` — how to evaluate assertions against outputs.
- `agents/comparator.md` — how to do blind A/B comparison.
- `agents/analyzer.md` — how to analyze why one version beat another.

---

Core loop, one more time:

- Figure out what the skill is about
- Draft or edit the skill
- Run claude-with-access-to-the-skill on test prompts
- Evaluate with the user — run `eval-viewer/generate_review.py` before diving into your own critique
- Repeat until you and the user are satisfied
- Package the final skill and return it

Add these to your TodoList so you don't drop a step. In Cowork specifically, put "Create evals JSON and run `eval-viewer/generate_review.py` so human can review test cases" on the list — that step tends to get skipped.

Good luck!
