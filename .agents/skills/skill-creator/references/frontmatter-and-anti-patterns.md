# Frontmatter fields and anti-patterns

Companion reference for `skill-creator`'s SKILL.md. Check this file before finalizing a skill's frontmatter or during a pre-ship review.

## Frontmatter fields

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Must match parent directory name. 1–64 chars, lowercase `a-z`, digits, `-`; no leading/trailing hyphen, no `--` |
| `description` | yes | What + when; include trigger keywords; 1–1024 chars; lead with what the skill does, end with "Use when…" triggers |
| `allowed-tools` | strongly recommended | Space-separated minimal tool list. Scope Bash with `Bash(cmd:*)`. Never grant bare `Bash` unless arbitrary shell access is genuinely required |
| `license` | no | Short name or filename |
| `compatibility` | no | Only if env-specific |
| `metadata` | no | Use `internal: true` for non-public skills |

### Tool-scope quick picks

| Skill does… | Likely `allowed-tools` |
|---|---|
| Read-only analysis | `Read Bash(ls:*) Bash(find:*) Bash(grep:*)` |
| File edits | `Read Edit Write` |
| Runs a bundled script | `Bash(<script-name>:*) Read` |
| Web research | `WebFetch WebSearch` |
| Scaffolds a new file tree | `Write Edit Bash(mkdir:*)` |

## Anti-patterns (reject these)

- Placing scripts at the skill root instead of in `scripts/`
- Telling the agent to "review" or "read through" a script instead of running it
- Granting unscoped `Bash` when `Bash(git:*)` or `Bash(npm:*)` would do
- Empty `references/` or `assets/` folders "for future use"
- SKILL.md re-explaining what the script already prints via `--help`
- Vague descriptions like "Helps with X" — agents can't route on these
- Consecutive hyphens or uppercase in `name`
- Deeply nested references (keep file refs one level from SKILL.md)
- Over-use of ALL-CAPS MUSTs and NEVERs — reframe with reasoning so the model can generalize
- Overfitting revisions to the specific test cases rather than generalizing
