---
name: hackathon-design
description: Design, build, refine, and review real hackathon.new interfaces using the project's existing components, tokens, APIs, and workflows. Use when developing app screens, public event pages, forms, tables, dashboards, navigation, responsive layouts, accessible interactions, or UI polish in this project.
license: LICENSE
allowed-tools: Read Glob Grep Edit Write Bash(rg:*) Bash(ls:*) Bash(git status:*) Bash(git diff:*) Bash(bun lint:*) Bash(bun run:*) Bash(bun cli:build:*)
metadata:
  internal: true
---

# Hackathon Design

Ship usable interfaces for this project, from a single control to a complete flow. Start from the running product and improve its clarity, behavior, and finish together. Deliver working code backed by the app's real data and permissions; visual quality includes loading, failure, mobile use, and keyboard use.

## When to activate

Use for regular interface design and development, including new screens, existing-screen redesigns, component work, accessibility fixes, responsive repairs, and design reviews. A request to "make this easier to use" or "polish this page" belongs here even without a design file.

For critique-only requests, activate in read-only mode and report findings without changing files. For an explicit mockup or exploration request, honor that scope and label unconnected behavior; do not substitute a mockup for a requested working feature.

## When NOT to activate

- Backend-only, database-only, infrastructure, email delivery, or CLI-only tasks with no interface work: use the relevant domain guidance.
- Hackathon planning or attendee advice: use the public skills in `skills/`.

## 1. Inspect the project and define the outcome

Read root `CLAUDE.md` / `AGENTS.md` and instructions for affected directories first. They govern implementation and release; this skill adds a design workflow. Use [project-map.md](references/project-map.md) to locate the current routes, components, hooks, and checks. Consult the installed framework or service skills when the work reaches those domains.

Inspect `git status`, the target route, its data loader, related client components, and the nearest comparable flow. Preserve unrelated work. Read existing tests before deciding what behavior to change.

Identify:

1. Who is using the screen: organizer, attendee, judge, sponsor, or visitor?
2. What are they trying to do, and what confirms it worked?
3. What already exists, and which exact behavior or visual issue needs to change?
4. Which role, event lifecycle, data, and failure states affect that action?
5. What is the impact on the app, WebMCP, and CLI?

Infer routine choices from the request and repository. Ask only for missing decisions that materially change the work. Follow the root requirements process for new product features; fixes and polish can proceed within the existing scope. Do not impose a theme questionnaire or require a clean working tree for routine edits.

## 2. Choose the surface and plan its states

Read [app-screens.md](references/app-screens.md) for the surface being changed:

- **Existing app screen:** preserve its shell, routes, content, behavior, and brand unless the task changes them. Put the main task and useful data first.
- **New app screen:** use the surrounding product's navigation and components. Plan shell, content, permissions, and data states before decoration.
- **Component:** keep its API, variants, semantics, and consumers in view. Verify the relevant states without inventing an entire page.
- **Public event page:** help people understand and join the event using real event details and lifecycle rules.
- **Marketing page:** only use a marketing structure when requested. Choose sections from available content and the visitor's decision, rather than a fixed hero or section quota.

Write a short implementation outline tied to the user outcome. For small fixes, this can be one sentence. For larger work, name the affected files, state transitions, parity impact, and verification before editing.

## 3. Build with the existing design system

Inspect `components/ui/`, `components.json`, `app/globals.css`, and a nearby implementation. Reuse shadcn components as-is and use their variants; compose layouts around them rather than restyling their internals. Use the custom dashboard sidebar at `components/app-sidebar-simple.tsx` for sidebar changes.

Use semantic tokens such as `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, and `text-destructive`. Preserve the existing typography, radius, theme provider, and light/dark palette. Do not import a theme catalog, change global tokens, add fonts, or add a UI library merely to make one screen feel different.

Make hierarchy come from useful grouping, spacing, alignment, and clear labels. Give the main action a clear place. Use tables for comparison, lists for scanning, and forms for input; use cards when they group a meaningful unit. Avoid decorative charts, fabricated statistics, redundant containers, and animation that competes with the task.

Write short, plain product copy. Prefer "Projects" and "People" where the root copy rules call for them. Keep raw IDs, implementation terms, and technical timestamps out of user decisions.

Read [responsive-and-theme.md](references/responsive-and-theme.md) when composing layouts, changing navigation, adding charts, or touching color and motion.

## 4. Implement the complete behavior

Read [interaction-and-states.md](references/interaction-and-states.md) before wiring forms, mutations, or data views.

- Keep `app/**/page.tsx` server-rendered; extract client interactions into separate components. Await Next.js request APIs and use the installed Next.js documentation for version-specific behavior.
- Reuse existing API/service validation and permissions. Hiding a control is not authorization. Preserve event lifecycle gates and distinguish queued actions from completed ones.
- Show loading, empty, error, and populated states where applicable. Stream slow lists with `Suspense` and matching `loading.tsx` shells. Pagination and filtering should provide immediate loading feedback.
- Use the existing optimistic hooks for reversible list mutations, with rollback and inline errors. Keep explicit pending feedback and existing confirmation for critical transitions, uploads, OAuth, and batch operations.
- Preserve routes, URL state, handlers, field names, analytics, test hooks, and legal text unless the requested change requires updating them.
- Keep browser-only values out of the first server/client render; use the project's hydration-safe patterns.
- Every visible action must work. Use actual APIs for production features. Put deterministic example data in tests or explicit previews, not fabricated production results.

For organizer pages or behavior changes, check `lib/webmcp/organizer-parity.ts`. Add useful WebMCP support and update CLI behavior when applicable; record a reason when a surface has no useful equivalent. UI polish alone may have no API or parity change, but still assess it.

## 5. Verify and finish

Read [review-finish.md](references/review-finish.md). Review the complete task, not just the first viewport: keyboard and focus, mobile layout, theme contrast, real actions, reload/back behavior, data states, and error recovery.

Run meaningful tests for changed behavior using `bun run test`; keep integration and email lanes separate as the repository requires. Use the repository's complete local gate before a push: `bun lint`, `bun run build`, `bun run test:all`, and `bun cli:build`. Invoke the internal `pr-review` skill before pushing. Browser verification follows root instructions, including the sandbox exception; report any skipped checks honestly.

Inspect the final diff for unrelated edits, dead controls, temporary assets, secret values, and generated files. Do not add CSS stamps, hidden attribution in product code, design logs, or a parallel snapshot/cache system.

Report the implemented outcome, affected flow, validation, and any remaining limitation. When asked to release, follow the root feature-branch → staging PR → main PR workflow and its waiting period; this skill does not grant deployment or merge permission on its own.

## Maintenance

The canonical installation is this directory, with symlinks in the configured coding tools' skill directories. Keep project-specific paths in `references/project-map.md` current when the architecture changes. This is a local adaptation, so it is intentionally not an upstream-managed `skills-lock.json` entry. Update it deliberately rather than replacing it with a global installer.

The adapted design guidance retains its required notice in [LICENSE](LICENSE). No runtime packages, external image APIs, global hooks, or helper scripts are needed. Regression prompts for future edits live in [evals/evals.json](evals/evals.json).
