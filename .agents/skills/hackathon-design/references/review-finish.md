# Review the completed task

Use this reference after implementing the requested design or development change.
Review the real behavior and rendered surface against the request and project rules.
Do not report a pass for a check that did not run.

## Gather enough evidence

Read the diff, changed components, caller contracts, and affected API behavior.
For a visual change, compare the previous and current screen where available.
Use existing fixtures or local lifecycle scenarios for realistic test states.
Keep test data out of production rendering and avoid live side effects during review.
Choose examples that exercise permissions, lifecycle gates, and long or missing content.
Use a fresh reviewer for a substantial flow or redesign when available.
Give the reviewer the request, project constraints, changed files, and verification evidence.

## Inspect the interface

- Is the main task and next action clear without extra explanation?
- Does the screen preserve the existing shell and familiar patterns?
- Are shadcn controls unchanged except for supported variants and sizes?
- Do colors use existing semantic roles and work in light and dark mode?
- Does copy use short, plain words and describe the user's result?
- Are real values, published content, legal text, and consent preserved?
- Are loading, empty, error, and full states distinguishable and useful?
- Does the shell appear immediately, with matching skeleton content while data loads?
- Do filtering, searching, and pagination replace stale content with skeletons immediately?
- Are facts and imagery supported by real sources, without fabricated metrics or quotes?

For app screens, judge hierarchy, working controls, density, and state clarity.
For public event pages, check real event details and role/lifecycle-appropriate actions.
For requested marketing work, check its audience, supplied material, and working destination.
Do not impose a marketing hero, section count, or decorative style on an app screen.

## Exercise the flow

Follow each changed primary action to its actual API or destination.
Verify validation errors, permission denial, and lifecycle restrictions as well as success.
Check optimistic feedback occurs before a delayed response on ordinary mutations.
Force a failed request and confirm exact rollback, visible error, and a useful retry path.
Check temporary items reconcile after success without duplicates or lost unrelated edits.
Keep sensitive transitions, batch sends, uploads, and redirects truthful while pending.
Confirm queued responses are described as queued rather than already completed.
Check repeated clicks and concurrent updates where the change can trigger them.
Verify form input is recoverable after failure, and new drafts survive supported exits.
Check back, cancel, close, Escape, and browser navigation through the changed flow.

## Check accessibility and responsive behavior

Verify keyboard order, visible focus, accessible control names, and field error associations.
Check focus entry and restoration for overlays and a visible cancel or close action.
Confirm touch access to anything available on hover.
Inspect at 375px, a tablet width, and the desktop layout used by the feature.
Check the sidebar at either side of 1024px and inspect mobile navigation independently.
Look for page overflow, clipped labels, unreachable table actions, and covered focus.
Check long names, URLs, empty fields, and larger text rather than only tidy fixtures.
Inspect both themes and reduced motion for changes that affect them.
Check console output for hydration errors and failed requests.

For UI changes, follow the root guide's `agent-browser` verification workflow.
Its sandbox exception forbids browser startup in a sandboxed Codex environment.
When that exception applies, use automated checks and report the skipped browser review.
When browser access is available, inspect the real changed route and interaction.
Do not present a build or source-only review as browser verification.

## Verify implementation and parity

Keep page files server-side and isolate interactive client components.
Check API validation, tenant access, roles, lifecycle gates, and side effects remain aligned.
Consider app, WebMCP, and CLI for every changed behavior.
Update and test `lib/webmcp/organizer-parity.ts` when its mapped surface changes.
Record useful supported equivalents and explain gaps; an empty entry is not proof of parity.
For a visual-only change, state why API, WebMCP, and CLI behavior is unchanged.

Run meaningful targeted tests for behavior, failure, and affected product surfaces.
Use `bun run test`, never the separate Bun test runner.
Run integration and email tests separately where required by the project.
Before pushing, complete the root guide's lint, build, test, and CLI build checks.
Invoke the local `pr-review` skill as required before every push.
Fix Critical findings and resolve reviewer warnings before merge.

## Report the result

Rank actionable findings by user impact, with a file/line and a concrete fix.
Distinguish a defect from a preference the request did not ask to change.
For a redesign, name anything the old screen made easier that now regressed.
After fixes, repeat only the checks affected by those changes or unresolved failures.
Close with what changed, what passed, what was skipped, and any real limitation.
Include the app, WebMCP, and CLI impact in the PR's required Parity section.
