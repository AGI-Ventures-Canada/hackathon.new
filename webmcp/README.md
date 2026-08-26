# Oatmeal WebMCP

Oatmeal registers browser-native tools with `document.modelContext.registerTool`. Registration follows the current route, signed-in role, event lifecycle, judging style, and visible capabilities. An `AbortController` removes tools when that context changes.

## Human control

Agents may read, navigate, edit ordinary organizer data, and prepare visible work. A person keeps the final click for event creation, sign in, registration, terms and location consent, invitations, project saves and submissions, go-live, announcements, results, judging responses, mentor requests, claims, and resolutions.

No WebMCP tool deletes data, sends email, transitions an event, chooses winners, or publishes results.

## Tool inventory

| Surface | Tools | When shown |
|---|---|---|
| Create or import | `get_hackathon_draft`, `update_hackathon_draft`, `open_hackathon_review`, `open_sign_in` | The draft tools stay stable while fields change. Sign in appears only for a signed-out person. |
| Visitor or attendee | `get_event_guide`, `get_my_event_status`, `open_registration`, `get_my_team`, `prepare_team_invite`, `get_project_draft`, `prepare_project` | Only the next useful tools appear for the viewer's registration, team, and project state. |
| Attendee mentor help | `get_my_mentor_request`, `prepare_mentor_request` | The prepare tool appears only when the attendee can open a new request. |
| Organizer reads and navigation | `get_hackathon_overview`, `list_hackathon_schedule`, `list_hackathon_challenges`, `list_hackathon_prizes`, `open_hackathon_section` | Available to the exact event organizer. Results and unreleased content are still filtered by lifecycle. |
| Organizer edits | `update_hackathon_details`, `add_schedule_item`, `set_hackathon_timeline`, `add_challenge`, `add_prize`, `draft_announcement` | Details and ordinary schedule items stop at completion. Timeline, challenge, and prize writes are draft-only. Announcements are saved as drafts. |
| Organizer reviews | `open_go_live_review`, `open_publish_review` | Go-live appears for drafts. Results review appears during judging or after completion. Both require a human click. |
| Judge | `get_my_judging_status`, `get_judge_assignments`, `get_judge_assignment`, `open_judge_assignment`, plus one of `prepare_judge_scores`, `prepare_judge_picks`, `prepare_judge_bucket`, or `prepare_judge_gates` | Only an assigned judge sees these tools. The preparation tool matches the configured response style and makes no request. |
| Public mentor queue | `get_mentor_queue_status` | Signed-out visitors receive aggregate counts only. |
| Verified mentor | `get_mentor_queue`, `get_mentor_request`, `open_mentor_claim`, `open_mentor_resolve` | Request text is mentor-only. Claim and finish actions open a human review. |

## Contracts

`lib/webmcp/tool.ts` builds JSON Schema from the same Zod schema used at execution time. All results use one envelope:

```json
{"ok":true,"data":{},"requiresHumanAction":true}
```

or:

```json
{"ok":false,"error":{"code":"event_changed","message":"Refresh the page.","retryable":true}}
```

Tool names and parameter names are at most 30 characters. Descriptions are at most 500 characters, parameter descriptions at most 150, and each serialized result at most 1,500 characters. Read tools use `readOnlyHint`. Tools that return project, attendee, request, or imported text use `untrustedContentHint`.

Database, Clerk, participant, team, assignment, prize, criterion, and mentor-request IDs never enter tool results. Page sessions map them to opaque references and reject references after their source record disappears.

## Server checks

Hiding a browser tool is not authorization. Each WebMCP request rechecks the authenticated principal, exact event role, ownership, event status, and the server's current `updated_at` value. Mutation requests include the status and event version read by the page. A stale status or version returns a stable `409 event_changed` error.

Draft challenge creation cannot release a challenge. Draft date changes cannot schedule reminders. Existing go-live handlers send work that was safely held while the event was a draft. Invitation responses include `delivery: "sent" | "queued" | "failed"`. The existing `queued` field remains for compatibility and is true only for draft work held until go-live. A failed delivery stays saved and pending, but no reminder is scheduled until email delivery is confirmed.

Signed-out event data is published and audience-filtered. Results require `results_published_at`; challenges require release. Anonymous judging omits team mode, team names, members, submitter identity, and internal IDs. Public mentor data contains counts only; mentor DTOs omit attendee IDs and other mentors' identities.

## Origin trial

`WEBMCP_ORIGIN_TRIAL_TOKEN` is optional and server-only. `next.config.ts` decodes its WebMCP origin and sends it as an `Origin-Trial` response header only when the request host matches. Preview, staging, and production use different exact-origin Vercel values; tokens are never hardcoded. A deployment fails when a configured token is malformed, expired, or within 30 days of expiry.

Keep origin isolation enabled and leave the `tools` Permissions Policy at its `self` default. Native Chrome verification uses `document.modelContext.getTools()` followed by `document.modelContext.executeTool(tool, JSON.stringify(args))`. A wrapper timeout is not proof of an app failure; retry with raw DevTools evaluation and `awaitPromise: true`.

Approved target origins:

- `https://oatmeal-git-feature-webmcp-organizer-tools-agi-ventures-canada.vercel.app`
- `https://staging.hackathon.new`
- `https://hackathon.new`

Origin-trial operations record:

| Exact origin | Vercel environment | Issue date | Expiry | Removal owner |
|---|---|---|---|---|
| `https://oatmeal-git-feature-webmcp-organizer-tools-agi-ventures-canada.vercel.app` | Preview, branch `feature/webmcp-organizer-tools` | 2026-08-26 | 2026-11-17 00:00 UTC (Nov 16 Toronto) | Oatmeal release owner |
| `https://staging.hackathon.new` | Custom environment `staging` | 2026-08-26 | 2026-11-17 00:00 UTC (Nov 16 Toronto) | Oatmeal release owner |
| `https://hackathon.new` | Production | 2026-08-26 | 2026-11-17 00:00 UTC (Nov 16 Toronto) | Oatmeal release owner |

Keep the issue date and expiry in sync with Chrome's enrollment records. The removal owner removes the matching Vercel value when the trial expires or the browser no longer needs it.

See [Chrome's origin-trial guide](https://developer.chrome.com/blog/ai-webmcp-origin-trial) and [troubleshooting guide](https://developer.chrome.com/docs/web-platform/origin-trial-troubleshooting/).

## Verification

Deterministic coverage lives under `__tests__/lib`, `__tests__/services`, `__tests__/components`, and `__tests__/integration`. The model-selection dataset is [evals.json](evals.json). The hosted role and lifecycle matrix is [preview-qa.md](preview-qa.md).

Run only the static project gates before a push:

```bash
bun lint
bun run build
bun run test:all
bun cli:build
```

For this delivery, browser checks run only against a ready Vercel preview. Run the matrix in Codex's built-in browser and in a dedicated Chrome profile for the native WebMCP connection. Use synthetic data and never send a real invitation or publish real results.

## References

- [WebMCP and AI agents](https://developer.chrome.com/docs/ai/agents)
- [Imperative WebMCP API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Evals for WebMCP](https://developer.chrome.com/docs/ai/webmcp/evals)
