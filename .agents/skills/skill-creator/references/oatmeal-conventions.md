# Oatmeal repo conventions

These conventions apply to skills authored *inside the Oatmeal repo*. They're enforced by repo tooling (skills-lock.json, skills.sh) and by [CLAUDE.md](../../../../CLAUDE.md). Consult this file whenever you're scaffolding a skill inside this repo.

## Where skills live

| Kind | Location | Frontmatter |
|---|---|---|
| Public, installable skills (distributed via skills.sh) | [skills/\<name\>/](../../../../skills/) | omit `metadata.internal` |
| Internal project helpers, not for distribution | [.claude/skills/\<name\>/](../../../../.claude/skills/) | `metadata.internal: true` |
| Third-party skills pulled in via `skills-lock.json` | [.agents/skills/\<name\>/](../../../../.agents/skills/) with a symlink at `.claude/skills/<name>` | managed by the skills tool — don't hand-edit metadata |

The `.agents/skills/` tree holds the canonical checked-in copy of every installed skill. The corresponding `.claude/skills/<name>` entry is a symlink (`ln -s ../../.agents/skills/<name>`). Flat single-file skills (`.claude/skills/<name>.md`) are allowed for tiny internal helpers.

## CLAUDE.md ↔ AGENTS.md symlink rule

Every directory with agent instructions must expose both `CLAUDE.md` and `AGENTS.md`, with one symlinked to the other:

```bash
ln -s CLAUDE.md AGENTS.md
```

Never maintain them as separate files with duplicated content. This applies to repo-level `CLAUDE.md`s, not to the skill's own `SKILL.md`.

## skills-lock.json

Installed skills (source: GitHub or elsewhere) are tracked in [skills-lock.json](../../../../skills-lock.json) at the repo root. Each entry records the source repo + a `computedHash`. If you modify a file inside `.agents/skills/<name>/`, its hash drifts from the lock — that's fine for in-repo customizations, but note that a future skills-sync may flag or overwrite the drift.

If you're **customizing** a locked skill (as the Oatmeal repo has done with `skill-creator`), make the customizations in place in `.agents/skills/<name>/`. Don't duplicate into `.claude/skills/<name>/` — keep the symlink pattern intact.

## Public skills index

When adding a new public skill under `skills/`, update [skills/README.md](../../../../skills/README.md) with a one-line description and trigger summary.
