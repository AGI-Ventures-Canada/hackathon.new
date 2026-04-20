# Dev Tools

Tools for testing the hackathon lifecycle. Available in development (no auth) and on preview/staging deployments for admin users (`ADMIN_ENABLED=true` + Clerk admin metadata). Guarded at three levels: mount point (`lib/api/index.ts`), group-level `onBeforeHandle` (admin auth in non-dev), and per-handler `devGuard()` (defence-in-depth env check).

## Files

| File | Purpose |
|------|---------|
| `lib/api/routes/dev.ts` | Elysia API endpoints (`/api/dev/hackathons/:id/*`) |
| `lib/dev/scenarios.ts` | Centralized scenario registry (single source of truth) |
| `lib/dev/test-personas.ts` | Test persona definitions and lookup |
| `components/dev-tool/dev-tool.tsx` | Global floating dev tools button (root component) |
| `components/dev-tool/dev-tool-panel.tsx` | Command-palette panel container |
| `components/dev-tool/commands/registry.ts` | Builds the unified command list (scenarios, personas, roles, event actions, settings) |
| `components/dev-tool/commands/command-list.tsx` | Searchable/grouped command list (shadcn `Command` primitive) |
| `components/dev-tool/commands/context-strip.tsx` | Pinned chips (event / status / you / roles) |
| `components/dev-tool/commands/inline-settings.tsx` | Inline Org ID / Dev User ID / Test Users editors |
| `components/dev-tool/commands/inline-event-tools.tsx` | Sub-view for event lifecycle / seed / results |
| `components/dev-tool/tabs/event-lifecycle-section.tsx` | Event transition controls (reused inside inline-event-tools) |
| `components/dev-tool/tabs/event-seed-section.tsx` | Seed-data controls (reused) |
| `components/dev-tool/tabs/event-results-section.tsx` | Results controls (reused) |
| `components/dev-tool/use-event-context.ts` | Hook for detecting event page context |

## Architecture

The Dev Tool is a single client component mounted in `app/layout.tsx` when `NODE_ENV === "development"` or `ADMIN_ENABLED === "true"`. In non-dev environments, the component checks Clerk session metadata for `admin: true` before rendering.

The opened panel is a **searchable command palette** (not tabs). Top-to-bottom:

1. **Header** — Dev Tools title, current event slug badge, running spinner, close button
2. **Context strip** — Pinned chips showing event, status, active persona, current roles
3. **Search input** — Fuzzy matches over command title / subtitle / keywords (autofocused)
4. **Grouped results** — Jump to state (scenarios) · Switch persona · Assign role (event-only) · Event actions (event-only) · Settings

Selecting a command runs it directly (scenario launch, persona switch, role assign) or opens a sub-view (settings editor, event lifecycle/seed/results). `Cmd/Ctrl+K` toggles the panel from anywhere. The component detects event context by parsing `usePathname()` for `/e/[slug]` and fetching hackathon data via `GET /api/dev/hackathons/by-slug/:slug`.

## Scenario Registry

All scenarios are defined once in `lib/dev/scenarios.ts`:

```typescript
{ name, description, category, defaultPersona, defaultRoute }
```

Consumers:
- `lib/services/admin-scenarios.ts` — admin API scenario runners
- `scripts/test-scenario.ts` — CLI scenario entry point
- `components/dev-tool/commands/registry.ts` — Dev Tool command palette

## Adding a New Dev Tool Action

### 1. Add the API endpoint in `dev.ts`

```typescript
.post(
  "/hackathons/:id/seed-thing",
  async ({ params, body, set }) => {
    const guard = devGuard(set)
    if (guard) return guard

    const db = await getDb()
    // ... do work ...
    return { seeded: count }
  },
  { body: t.Object({ count: t.Optional(t.Number()) }) }
)
```

Patterns:
- Always call `devGuard(set)` first
- Use `getDb()` for service-key Supabase (bypasses RLS)
- Use `getHackathonTenant(id, set)` when you need the tenant ID
- Use `ensureParticipant(db, hackathonId, clerkUserId, role?)` to upsert seed users as participants
- Keep dynamic imports for services (`await import(...)`) to avoid circular deps

### 2. Add the UI button inside the relevant section

Event-scoped seed actions live in `components/dev-tool/tabs/event-seed-section.tsx`. Add a `<SeedButton>`:

```tsx
<SeedButton
  icon={<IconName className="size-3" />}
  label="Button Label"
  loading={isLoading}
  onClick={() => devAction("/seed-thing", "POST", { count: 3 })}
/>
```

The `devAction()` helper (from the parent `InlineEventTools`) handles fetch, sessionStorage save, and page reload automatically.

For non-event actions (e.g., global dev utilities), add an entry in `components/dev-tool/commands/registry.ts` so it shows up in the palette directly.

### 3. Add the icon import

Icons come from `lucide-react`. Add to the import at the top of the section file you edited.

## Adding a New Scenario

1. Add the scenario definition to `lib/dev/scenarios.ts`
2. Add the runner function in `lib/services/admin-scenarios.ts` under `scenarioRunners`
3. Create the CLI script in `scripts/test-scenarios/<name>.ts`

## Constants

`SEED_USERS` — 10 fake Clerk user IDs (`seed_user_alice_001` through `seed_user_jack_010`). These are NOT real Clerk users so they won't have names/emails in Clerk lookups. The dev cleanup endpoint (`DELETE /seed-data`) deletes participants with these IDs.

`TEAM_NAMES` — 10 team names. `SUBMISSION_DATA` — 10 project title/description templates. `ROOM_NAMES` — 5 room names.

## Panel UX

- **Global**: Visible on all pages in development mode
- **Draggable**: pointer events with snap-to-edge on release (9-zone grid)
- **Escape to close**: global keydown listener
- **Click outside to close**: pointerdown listener checks panel/button refs
- **Session persistence**: `sessionStorage.getItem("devtools-state")` restores `{ position, edge }` after reload, then removes the key
- **Responsive**: accounts for sidebar width (256px at `lg:` breakpoint) in snap calculations
- **Event-aware**: small dot indicator on pill when on an event page

## Important Rules

- Never mount dev routes in production — `lib/api/index.ts` conditionally imports `devRoutes`
- Never import heavyweight services at the top of `dev.ts` — use dynamic `import()` to avoid circular deps
- Auth is enforced exclusively by the `onBeforeHandle` hook on `devRoutes` — it calls `resolvePrincipal()` and rejects non-admin callers. `devGuard()` is env-only defence-in-depth (checks `NODE_ENV` and `ADMIN_ENABLED` but not caller identity). Do not rely on `devGuard()` as an auth check. If a handler is mounted outside the `devRoutes` plugin lifecycle, `devGuard()` alone will not verify caller identity
- Admin detection relies on `sessionClaims.metadata.admin === true`. This requires the Clerk JWT template to map `"metadata": "{{user.public_metadata}}"` so that `public_metadata.admin` appears in the token payload. If the JWT template is missing or misconfigured, admin users will silently never see dev tools on staging — no error, just a permanently hidden component
- Seed cleanup must delete in dependency order (scores → assignments → criteria → room_teams → rooms → submissions → participants → teams) to respect foreign keys
- All seed data uses `SEED_USERS` IDs so cleanup can target only seeded rows without affecting real organizer data
