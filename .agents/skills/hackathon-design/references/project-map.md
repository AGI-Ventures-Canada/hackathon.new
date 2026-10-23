# Project map

Read the current files before copying a pattern; this map is a starting point, not an alternative source of architectural rules. Paths below are relative to the repository root.

## Instruction and component sources

| Source | What to check |
| --- | --- |
| `CLAUDE.md` (`AGENTS.md` symlink) | Product rules, forms, mobile, mutations, parity, tests, release process |
| `components/ui/CLAUDE.md` | Local primitive interaction rules |
| `components.json` | Current shadcn style, aliases, and icon library |
| `components/ui/` | Existing primitives and variants before creating controls |
| `app/globals.css` | Semantic color, chart, spacing/radius, and theme tokens |
| `app/layout.tsx` | Existing fonts and provider composition |
| `components/theme-provider.tsx`, `components/theme-switcher.tsx` | Theme behavior and switching |
| `node_modules/next/dist/docs/` | Installed Next.js version's APIs and conventions |

## Routes and shells

| Surface | Start here |
| --- | --- |
| Dashboard shell | `app/(dashboard)/layout.tsx` |
| Home, organizing, participating, judging, sponsoring | `app/(dashboard)/home/` |
| Browse | `app/(dashboard)/browse/` |
| Settings | `app/(dashboard)/settings/` |
| Public event | `app/(public)/e/[slug]/` |
| Organizer workspace | `app/(public)/e/[slug]/manage/` and `components/hackathon/manage/` |
| Public shell | `app/(public)/layout.tsx`, `components/public/` |
| Desktop navigation | `components/app-sidebar-simple.tsx` |
| Mobile navigation | `components/mobile-header.tsx`, `hooks/use-mobile.ts` |
| Shared page headings | `components/page-header.tsx`, `components/page-actions.tsx` |
| Shared loading UI | Nearby `loading.tsx`, `components/dashboard/dashboard-grid-loading.tsx` |

Do not infer every management URL from an old route summary. Locate the current route and links with `rg` before changing navigation. Dashboard sidebar visibility uses `lg:` (1024px), matching the mobile hook.

## Behavior and data

| Concern | Existing implementation |
| --- | --- |
| Props-based optimistic lists | `hooks/use-optimistic-list.ts` |
| Optimistic mutation lifecycle and rollback | `hooks/use-optimistic-mutation.ts` |
| Hydration-safe client flag | `hooks/use-is-client.ts` and root hydration guidance |
| Response errors and body parsing | `lib/utils/fetch.ts` (`assertOk`, `assertOkJson`) |
| Bare-domain URL normalization | `lib/utils/url.ts` (`normalizeUrl`) |
| UUID validation | `lib/utils/uuid.ts` (`isValidUuid`) |
| URL-synced tabs | `components/ui/tabs-url-sync.tsx` and nearby consumers |
| API routes and auth | `lib/api/` and `lib/api/CLAUDE.md` |
| Domain behavior | `lib/services/` |
| Organizer parity registry | `lib/webmcp/organizer-parity.ts` |
| WebMCP tools | `lib/webmcp/` |
| CLI commands | `packages/cli/src/commands/`, `packages/cli/CLAUDE.md` |

Read domain instructions before changing behavior. Reuse shared server validation instead of adding competing client-only rules. Keep CLI code isolated from app imports.

## Verification and previews

- Use `__tests__/` for relevant UI, API, service, and parity tests; read its local instructions when editing tests.
- Use `scripts/test-scenario.ts` and `scripts/test-scenarios/` for local lifecycle scenarios after checking `scripts/CLAUDE.md`. Confirm the target is local before running setup or reset commands.
- Existing explicit component previews live under `app/dev/`; do not add demo data to production routes.
- Use `bun run test` rather than invoking the built-in runner directly. Integration and email tests have their own scripts to isolate mocks.
- Before pushing, run `bun lint`, `bun run build`, `bun run test:all`, and `bun cli:build`, then use `.claude/skills/pr-review/SKILL.md`.
- UI browser checks use the root workflow and `.agents/skills/agent-browser/`; honor the root sandbox exception.
- Keep `.auth/`, `.env*`, generated indexes, build output, screenshots with private data, and credentials out of commits.

## Other installed skills

Consult `next-best-practices` for framework details, `clerk` and its focused skills for auth, `elysiajs` for API work, and the database guidance for schema changes. This design skill coordinates the user flow; it does not replace those implementation instructions.
